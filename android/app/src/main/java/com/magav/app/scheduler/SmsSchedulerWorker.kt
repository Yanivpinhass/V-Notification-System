package com.magav.app.scheduler

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.BitmapFactory
import android.os.Build
import android.telephony.TelephonyManager
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.magav.app.MainActivity
import com.magav.app.MagavApplication
import com.magav.app.R
import com.magav.app.db.MagavDatabase
import com.magav.app.db.entity.SchedulerConfigEntity
import com.magav.app.service.SmsSummary
import com.magav.app.service.SmsReminderService
import com.magav.app.sms.AndroidSmsProvider
import com.magav.app.util.DayGroups
import com.magav.app.util.ReminderTypes
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

class SmsSchedulerWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    private val israelTz = ZoneId.of("Asia/Jerusalem")

    private companion object {
        // Per-worker foreground ids: BASE + configId (two same-minute configs run as PARALLEL
        // workers — a shared id would let one worker's completion cancel the other's foreground
        // notification and strip its protection).
        const val FOREGROUND_ID_BASE = 300
        const val ERROR_NOTIFICATION_ID = 110
        const val SUMMARY_NOTIFICATION_ID = 100
    }

    override suspend fun doWork(): Result {
        android.util.Log.d("SmsWorker", "doWork started (runAttemptCount=$runAttemptCount)")

        if (!MagavApplication.isDatabaseReady) {
            android.util.Log.e("SmsWorker", "Database not initialized, failing worker")
            return Result.failure()
        }
        val database = MagavApplication.database

        // Retry cap: initial run + 1 executing retry; the attempt after that only notifies.
        // Per-shift write-ahead dedup makes retries duplicate-safe — the cap stops churn. [dup-sms 1.6]
        if (runAttemptCount >= 2) {
            android.util.Log.e("SmsWorker", "Retry cap reached (runAttemptCount=$runAttemptCount), giving up")
            try {
                showSchedulerErrorNotification("שליחת התזכורות נכשלה לאחר מספר ניסיונות — יש לבדוק את יומן ההודעות")
            } catch (e: Exception) {
                android.util.Log.e("SmsWorker", "Failed to show retry-cap notification", e)
            }
            return Result.failure()
        }

        val subIdSetting = database.appSettingDao().getByKey("sms_sim_subscription_id")
        val subscriptionId = subIdSetting?.value?.toIntOrNull() ?: -1
        val smsProvider = AndroidSmsProvider(applicationContext, subscriptionId)
        val reminderService = SmsReminderService(database, smsProvider)

        val configId = inputData.getInt("configId", -1)
        android.util.Log.d("SmsWorker", "configId=$configId, subscriptionId=$subscriptionId")

        // Foreground for the whole batch — exempts the send loop from the ~10-min execution
        // budget and Doze stops. Degrade silently if the OS refuses (background-start
        // restriction on Android 12+) — never fail the run over it. [dup-sms 1.7]
        val batchNotificationId = FOREGROUND_ID_BASE + maxOf(configId, 0)
        try {
            setForeground(
                buildForegroundInfo(batchNotificationId, "מגב — שליחת תזכורות", "שליחת תזכורות SMS מתבצעת")
            )
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            android.util.Log.w("SmsWorker", "setForeground refused, continuing non-foreground", e)
        }

        return try {
            waitForCallToEnd(batchNotificationId)
            // Captured after the (possibly long) call-wait so the detector window covers only
            // this batch's own rows.
            val runStart = Instant.now()
            val summary = if (configId != -1) {
                val config = database.schedulerConfigDao().getById(configId) ?: run {
                    android.util.Log.e("SmsWorker", "Config $configId not found")
                    return Result.failure()
                }
                if (config.isEnabled != 1) {
                    android.util.Log.d("SmsWorker", "Config $configId is disabled, skipping")
                    return Result.success()
                }

                // Check if config's day group matches the effective day group (holiday-aware)
                val now = ZonedDateTime.now(israelTz)
                val effectiveGroup = getEffectiveDayGroupSafe(now, database)
                if (config.dayGroup != effectiveGroup) {
                    android.util.Log.d("SmsWorker", "Config ${config.id} dayGroup=${config.dayGroup} != effective=$effectiveGroup, skipping")
                    return Result.success()
                }

                val today = LocalDate.now(israelTz)
                val (windowStart, windowEnd, runLogDate) = computeWindow(config, today, database)

                android.util.Log.d("SmsWorker", "Executing config ${config.id} (${config.reminderType}, daysBeforeShift=${config.daysBeforeShift}) firingDay=$today window=[$windowStart..$windowEnd) runLogDate=$runLogDate")
                reminderService.execute(config, windowStart, windowEnd, runLogDate)
            } else {
                checkAllConfigs(database, reminderService)
            }

            runDuplicateDetector(database, runStart)

            // Notification errors must not trigger Result.retry()
            try {
                showSmsSummaryNotification(summary)
            } catch (e: Exception) {
                android.util.Log.e("SmsWorker", "Failed to show notification", e)
            }

            android.util.Log.d("SmsWorker", "doWork completed successfully")
            Result.success()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            android.util.Log.e("SmsWorker", "doWork failed", e)
            Result.retry()
        }
    }

    /**
     * Alerts on >1 non-Fail dispatch for the same (shift, reminder type) created in THIS run.
     * Bounded to the run window (1-min back-margin) so historical rows — including the original
     * incident's duplicates — and cross-run remediation manual sends never alert. A Fail + one
     * retry is the expected remediation shape, so Fail rows are excluded. Log-only: a detector
     * error after a completed batch must never map to Result.retry(). [dup-sms 5.2]
     */
    private suspend fun runDuplicateDetector(database: MagavDatabase, runStart: Instant) {
        try {
            val since = runStart.minusSeconds(60).toString()
            val dups = database.smsLogDao().findDuplicateDispatches(since)
            if (dups.isNotEmpty()) {
                android.util.Log.e("SmsWorker", "DUPLICATE SMS DETECTED in this run: $dups")
                showSchedulerErrorNotification("זוהו הודעות SMS כפולות (${dups.size} משמרות) — יש לבדוק את יומן ההודעות")
            }
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            android.util.Log.e("SmsWorker", "Duplicate detector failed", e)
        }
    }

    private fun showSchedulerErrorNotification(text: String) {
        val notification = NotificationCompat.Builder(applicationContext, "magav_error_channel")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("שגיאה בשליחת תזכורות")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        val manager = applicationContext.getSystemService(NotificationManager::class.java)
        manager.notify(ERROR_NOTIFICATION_ID, notification)
    }

    private fun buildForegroundInfo(notificationId: Int, title: String, text: String): ForegroundInfo {
        val notification = NotificationCompat.Builder(applicationContext, "magav_server_channel")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .build()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ForegroundInfo(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            ForegroundInfo(notificationId, notification)
        }
    }

    private suspend fun checkAllConfigs(
        database: MagavDatabase,
        reminderService: SmsReminderService
    ): SmsSummary {
        val now = ZonedDateTime.now(israelTz)
        val currentTime = String.format("%02d:%02d", now.hour, now.minute)

        val effectiveGroup = getEffectiveDayGroupSafe(now, database)

        val configs = database.schedulerConfigDao().getEnabled()

        var totalEligible = 0
        var totalSent = 0
        var totalFailed = 0

        for (config in configs) {
            try {
                if (config.dayGroup != effectiveGroup) continue
                if (config.time != currentTime) continue

                val today = now.toLocalDate()
                val (windowStart, windowEnd, runLogDate) = computeWindow(config, today, database)

                val summary = reminderService.execute(config, windowStart, windowEnd, runLogDate)
                totalEligible += summary.totalEligible
                totalSent += summary.smsSent
                totalFailed += summary.smsFailed
            } catch (e: Exception) {
                android.util.Log.e("SmsWorker", "Config ${config.id} failed, continuing", e)
            }
        }

        return SmsSummary(totalEligible, totalSent, totalFailed)
    }

    private fun showSmsSummaryNotification(summary: SmsSummary) {
        if (summary.totalEligible == 0) return

        val contentText = when {
            summary.smsFailed == 0 -> "נשלחו ${summary.smsSent} הודעות בהצלחה"
            summary.smsSent == 0 -> "שליחת הודעות נכשלה (${summary.smsFailed} הודעות)"
            else -> "נשלחו ${summary.smsSent} הודעות, ${summary.smsFailed} נכשלו"
        }

        val intent = Intent(applicationContext, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            applicationContext, 0, intent, PendingIntent.FLAG_IMMUTABLE
        )

        val appIcon = BitmapFactory.decodeResource(applicationContext.resources, R.mipmap.ic_launcher)
        val notification = NotificationCompat.Builder(applicationContext, "magav_sms_summary_channel")
            .setSmallIcon(R.drawable.ic_notification)
            .setLargeIcon(appIcon)
            .setContentTitle("סיכום שליחת הודעות")
            .setContentText(contentText)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(SUMMARY_NOTIFICATION_ID, notification)
    }

    private suspend fun waitForCallToEnd(notificationId: Int) {
        val tm = applicationContext.getSystemService(TelephonyManager::class.java)

        @Suppress("DEPRECATION")
        if (tm.callState == TelephonyManager.CALL_STATE_IDLE) return

        android.util.Log.w("SmsWorker", "Call active, waiting for call to end (foreground)")

        // Cosmetic re-title of this worker's EXISTING foreground notification (same id — never a
        // second one); the foreground protection itself was already taken at doWork entry.
        // Guarded: a refused setForeground must not abort the run. [dup-sms 1.7]
        try {
            setForeground(
                buildForegroundInfo(notificationId, "מגב - ממתין לסיום שיחה", "הודעות SMS ישלחו לאחר סיום השיחה")
            )
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            android.util.Log.w("SmsWorker", "setForeground refused during call-wait, continuing", e)
        }

        // Poll every 60s, up to 20 minutes
        for (attempt in 1..20) {
            android.util.Log.w("SmsWorker", "Call active, waiting 60s (attempt $attempt/20)")
            delay(60_000L)

            @Suppress("DEPRECATION")
            if (tm.callState == TelephonyManager.CALL_STATE_IDLE) {
                android.util.Log.d("SmsWorker", "Call ended after $attempt min, proceeding with SMS")
                return
            }
        }
        android.util.Log.w("SmsWorker", "Call still active after 20 min, sending anyway")
    }

    private suspend fun getEffectiveDayGroupSafe(now: ZonedDateTime, database: MagavDatabase): String {
        val effective = try {
            getEffectiveDayGroup(now, database)
        } catch (e: Exception) {
            android.util.Log.w("SmsWorker", "Holiday check failed, falling back to normal", e)
            getNormalDayGroup(now.dayOfWeek)
        }
        val normal = getNormalDayGroup(now.dayOfWeek)
        if (effective != normal) {
            android.util.Log.i("SmsWorker", "Holiday override: ${now.dayOfWeek} -> effective group '$effective'")
        }
        return effective
    }

    private fun getNormalDayGroup(day: DayOfWeek): String = when (day) {
        DayOfWeek.SATURDAY -> DayGroups.SAT
        DayOfWeek.FRIDAY -> DayGroups.FRI
        else -> DayGroups.SUN_THU
    }

    private suspend fun getEffectiveDayGroup(now: ZonedDateTime, database: MagavDatabase): String =
        effectiveDayGroupForDate(now.toLocalDate(), database)

    /**
     * Per-date holiday-aware day group. Preserves the exact priority/short-circuit order:
     * Saturday > today is holiday > Friday > tomorrow is holiday > default (SunThu).
     * Propagates exceptions — the tick gate caller (getEffectiveDayGroupSafe) owns the fallback.
     */
    private suspend fun effectiveDayGroupForDate(date: LocalDate, database: MagavDatabase): String {
        if (date.dayOfWeek == DayOfWeek.SATURDAY) return DayGroups.SAT
        if (database.jewishHolidayDao().isHoliday(date.toString()) > 0) return DayGroups.SAT
        if (date.dayOfWeek == DayOfWeek.FRIDAY) return DayGroups.FRI
        if (database.jewishHolidayDao().isHoliday(date.plusDays(1).toString()) > 0) return DayGroups.FRI
        return DayGroups.SUN_THU
    }

    private suspend fun isWorkingDay(date: LocalDate, database: MagavDatabase): Boolean =
        effectiveDayGroupForDate(date, database) == DayGroups.SUN_THU

    /**
     * Smallest date strictly after [from] that is a working day. Bounded walk (max 14 days) with its
     * own try/catch so a holiday-data gap or DB error can never crash the worker or loop forever —
     * falls back to the next plain Sun–Thu weekday.
     */
    private suspend fun nextWorkingDay(from: LocalDate, database: MagavDatabase): LocalDate {
        try {
            var candidate = from.plusDays(1)
            for (i in 0 until 14) {
                if (isWorkingDay(candidate, database)) return candidate
                candidate = candidate.plusDays(1)
            }
            android.util.Log.w("SmsWorker", "nextWorkingDay exceeded 14-day bound from $from; falling back to next weekday")
        } catch (e: Exception) {
            android.util.Log.w("SmsWorker", "nextWorkingDay failed from $from; falling back to next weekday", e)
        }
        return nextPlainWeekday(from)
    }

    private fun nextPlainWeekday(from: LocalDate): LocalDate {
        var d = from.plusDays(1)
        while (d.dayOfWeek == DayOfWeek.FRIDAY || d.dayOfWeek == DayOfWeek.SATURDAY) d = d.plusDays(1)
        return d
    }

    /**
     * Computes (windowStart, windowEnd, runLogDate) for the eligibility query + RunLog key.
     *  • SameDay/Advance: single-day window [today+N, today+N+1); runLogDate = today+N (byte-identical).
     *  • WeekdayAdvance/AdminAdvance: half-open window [today+N, nextWorkingDay(today)+N); runLogDate =
     *    today (firing day), so shifts whose natural send day lands on Fri/Sat/holiday/holiday-eve are
     *    pulled back onto this run. AdminAdvance reuses this verbatim — its config is DayGroup='SunThu'
     *    (so it fires only on working days) with N=1 (the only gap/overlap-free value). The
     *    dayGroup != effectiveGroup firing gate lives at the callers (doWork / checkAllConfigs).
     */
    private suspend fun computeWindow(
        config: SchedulerConfigEntity, today: LocalDate, database: MagavDatabase
    ): Triple<LocalDate, LocalDate, LocalDate> {
        val n = config.daysBeforeShift.toLong()
        val windowStart = today.plusDays(n)
        return if (config.reminderType == ReminderTypes.WEEKDAY_ADVANCE ||
            config.reminderType == ReminderTypes.ADMIN_ADVANCE) {
            Triple(windowStart, nextWorkingDay(today, database).plusDays(n), today)
        } else {
            Triple(windowStart, windowStart.plusDays(1), windowStart)
        }
    }
}
