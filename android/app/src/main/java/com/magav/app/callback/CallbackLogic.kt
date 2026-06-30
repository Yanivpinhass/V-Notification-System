package com.magav.app.callback

import android.Manifest
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import com.magav.app.MagavApplication
import com.magav.app.util.toIsoInstant
import kotlinx.coroutines.delay
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/**
 * Shared logic for the Android-only "auto-callback-to-gate" feature. Fully decoupled from the SMS
 * subsystem — nothing here touches MagavServerService or any SMS file.
 *
 * Flow: an eligible unanswered incoming call → a single one-shot +20s exact alarm
 * (CallbackAlarmReceiver) → if still RINGING at fire, reject the call and dial the Gate phone.
 * Every public entry point is fail-safe: on any error / missing data / missing permission it does
 * NOTHING (never crashes, never dials the wrong number).
 */
object CallbackLogic {

    private const val TAG = "CallbackLogic"
    private const val ALARM_REQUEST_CODE = 770042 // fixed single slot; no collision with AlarmScheduler ids
    private const val CALLBACK_DELAY_MS = 20_000L
    private val ISRAEL_TZ: ZoneId = ZoneId.of("Asia/Jerusalem")

    /**
     * National-significant-number key: last 9 digits, reconciling +972…/972…/0… and the malformed
     * 0972… the Excel import can produce. Returns null for empty/withheld numbers (→ fail-safe skip).
     */
    fun israeliMsisdnKey(raw: String?): String? {
        val digits = raw?.filter { it.isDigit() } ?: return null
        if (digits.isEmpty()) return null
        val d = when {
            digits.startsWith("972") -> digits.removePrefix("972")
            digits.startsWith("0") -> digits.removePrefix("0")
            else -> digits
        }
        return if (d.length >= 9) d.takeLast(9) else d
    }

    /** Active-window check (Israel tz), with midnight-wrap support. All-day ⇒ always in window. */
    fun isWithinWindow(allDay: Boolean, fromHour: String, toHour: String, now: LocalTime): Boolean {
        if (allDay) return true
        val from = LocalTime.parse(fromHour)
        val to = LocalTime.parse(toHour)
        return if (!from.isAfter(to)) {
            !now.isBefore(from) && !now.isAfter(to)      // from <= now <= to
        } else {
            !now.isBefore(from) || !now.isAfter(to)      // wrap: now >= from || now <= to
        }
    }

    /**
     * Eligibility gate for a RINGING incoming call. Cheap checks first (DB ready, config active,
     * time window); only then does the All-callers short-circuit or the number-matching query run.
     * Fail-safe: any exception ⇒ false (do nothing).
     */
    suspend fun isEligible(number: String?): Boolean {
        return try {
            if (!MagavApplication.isDatabaseReady) return false
            val db = MagavApplication.database
            val cfg = db.callbackConfigDao().get() ?: return false
            if (cfg.isActive != 1) return false
            if (!isWithinWindow(cfg.allDay == 1, cfg.fromHour, cfg.toHour, LocalTime.now(ISRAEL_TZ))) {
                return false
            }

            // All callers ON: trigger for ANY caller — the number is not needed, no query.
            if (cfg.allCallers == 1) return true

            // Otherwise match the caller against today/yesterday volunteers. Empty/withheld number
            // is a fail-safe skip (do NOT recover via the call log — it lags a ring).
            val key = israeliMsisdnKey(number) ?: return false

            val today = LocalDate.now(ISRAEL_TZ)
            val from = today.minusDays(1).toIsoInstant()  // yesterday 00:00 UTC (inclusive)
            val to = today.plusDays(1).toIsoInstant()      // tomorrow 00:00 UTC (exclusive)
            val shifts = db.shiftDao().getByDateRange(from, to) // already filters IsCanceled = 0
            if (shifts.isEmpty()) return false

            val volunteersById = db.volunteerDao().getAll().associateBy { it.id }
            val eligibleKeys = shifts.asSequence()
                .mapNotNull { it.volunteerId?.let { id -> volunteersById[id]?.mobilePhone } }
                .mapNotNull { israeliMsisdnKey(it) }
                .toSet()

            key in eligibleKeys
        } catch (e: Exception) {
            android.util.Log.e(TAG, "isEligible failed — fail-safe skip", e)
            false
        }
    }

    /** Arm the single one-shot +20s exact alarm. No-op (logs) if exact alarms aren't permitted. */
    fun armAlarm(context: Context) {
        try {
            val am = context.getSystemService(AlarmManager::class.java) ?: return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
                android.util.Log.w(TAG, "Exact alarms not permitted — cannot arm 20s callback")
                return
            }
            val pi = alarmPendingIntent(context, PendingIntent.FLAG_UPDATE_CURRENT)!!
            val triggerAt = SystemClock.elapsedRealtime() + CALLBACK_DELAY_MS
            am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
            android.util.Log.d(TAG, "Callback alarm armed (+20s)")
        } catch (e: Exception) {
            android.util.Log.e(TAG, "armAlarm failed", e)
        }
    }

    /** Cancel a pending callback alarm (battery optimization; correctness rests on the fire-time re-check). */
    fun cancelAlarm(context: Context) {
        try {
            val am = context.getSystemService(AlarmManager::class.java) ?: return
            val pi = alarmPendingIntent(context, PendingIntent.FLAG_NO_CREATE)
            if (pi != null) {
                am.cancel(pi)
                pi.cancel()
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "cancelAlarm failed", e)
        }
    }

    /**
     * Reject the still-ringing call and dial the Gate. Called ONLY after CallbackAlarmReceiver has
     * re-checked callState == RINGING. Re-checks permissions; each native action is isolated.
     */
    suspend fun rejectAndDialGate(context: Context) {
        try {
            if (!MagavApplication.isDatabaseReady) return
            val db = MagavApplication.database
            val cfg = db.callbackConfigDao().get() ?: return

            val gate = cfg.gatePhone.filter { it.isDigit() || it == '+' }
            if (gate.isEmpty()) {
                android.util.Log.w(TAG, "No gate phone configured — skip")
                return
            }

            val telecom = context.getSystemService(TelecomManager::class.java) ?: return

            // 1) Reject the ringing call (needs ANSWER_PHONE_CALLS).
            if (hasPermission(context, Manifest.permission.ANSWER_PHONE_CALLS)) {
                try {
                    @Suppress("DEPRECATION")
                    telecom.endCall()
                } catch (e: Exception) {
                    android.util.Log.e(TAG, "endCall failed", e)
                }
            } else {
                android.util.Log.w(TAG, "ANSWER_PHONE_CALLS not granted — cannot reject")
            }

            // brief gap so the reject settles before placing the outgoing call
            delay(700)

            // 2) Dial the Gate (needs CALL_PHONE).
            if (hasPermission(context, Manifest.permission.CALL_PHONE)) {
                try {
                    val uri = Uri.fromParts("tel", gate, null)
                    val extras = Bundle()
                    val subId = db.appSettingDao().getByKey("sms_sim_subscription_id")
                        ?.value?.toIntOrNull() ?: -1
                    val handle = gatePhoneAccountHandle(context, subId)
                    if (handle != null) {
                        extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, handle)
                    }
                    telecom.placeCall(uri, extras)
                    android.util.Log.d(TAG, "Gate dialed")
                } catch (e: Exception) {
                    android.util.Log.e(TAG, "placeCall failed", e)
                }
            } else {
                android.util.Log.w(TAG, "CALL_PHONE not granted — cannot dial gate")
            }
        } catch (e: Exception) {
            android.util.Log.e(TAG, "rejectAndDialGate failed", e)
        }
    }

    private fun alarmPendingIntent(context: Context, extraFlag: Int): PendingIntent? {
        val intent = Intent(context, CallbackAlarmReceiver::class.java).apply {
            action = "com.magav.app.CALLBACK_FIRE"
        }
        return PendingIntent.getBroadcast(
            context, ALARM_REQUEST_CODE, intent,
            extraFlag or PendingIntent.FLAG_IMMUTABLE
        )
    }

    /** PhoneAccountHandle for the SMS-selected SIM, or null (omit the extra → system default SIM). */
    private fun gatePhoneAccountHandle(context: Context, subId: Int): android.telecom.PhoneAccountHandle? {
        if (subId < 0) return null
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null // getPhoneAccountHandle is API 30+
        return try {
            context.getSystemService(TelephonyManager::class.java)
                ?.createForSubscriptionId(subId)
                ?.phoneAccountHandle
        } catch (e: Exception) {
            android.util.Log.w(TAG, "phoneAccountHandle lookup failed — using default SIM", e)
            null
        }
    }

    private fun hasPermission(context: Context, permission: String): Boolean =
        context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
}
