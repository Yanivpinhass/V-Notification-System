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
import kotlinx.coroutines.delay
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

class SmsSchedulerWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    private val israelTz = ZoneId.of("Asia/Jerusalem")

    override suspend fun doWork(): Result {
        android.util.Log.d("SmsWorker", "doWork started")

        if (!MagavApplication.isDatabaseReady) {
            android.util.Log.e("SmsWorker", "Database not initialized, failing worker")
            return Result.failure()
        }
        val database = MagavApplication.database

        val subIdSetting = database.appSettingDao().getByKey("sms_sim_subscription_id")
        val subscriptionId = subIdSetting?.value?.toIntOrNull() ?: -1
        val smsProvider = AndroidSmsProvider(applicationContext, subscriptionId)
        val reminderService = SmsReminderService(database, smsProvider)

        val configId = inputData.getInt("configId", -1)
        android.util.Log.d("SmsWorker", "configId=$configId, subscriptionId=$subscriptionId")

        return try {
            waitForCallToEnd()
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

            // Notification errors must not trigger Result.retry()
            try {
                showSmsSummaryNotification(summary)
            } catch (e: Exception) {
                android.util.Log.e("SmsWorker", "Failed to show notification", e)
            }

            android.util.Log.d("SmsWorker", "doWork completed successfully")
            Result.success()
        } catch (e: Exception) {
            android.util.Log.e("SmsWorker", "doWork failed", e)
            Result.retry()
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
        manager.notify(100, notification)
    }

    private suspend fun waitForCallToEnd() {
        val tm = applicationContext.getSystemService(TelephonyManager::class.java)

        @Suppress("DEPRECATION")
        if (tm.callState == TelephonyManager.CALL_STATE_IDLE) return

        android.util.Log.w("SmsWorker", "Call active, upgrading to foreground worker and waiting for call to end")

        // Upgrade to foreground worker so Android won't kill us during the wait
        val notification = NotificationCompat.Builder(applicationContext, "magav_server_channel")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("מגב - ממתין לסיום שיחה")
            .setContentText("הודעות SMS ישלחו לאחר סיום השיחה")
            .setOngoing(true)
            .build()

        val foregroundInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ForegroundInfo(102, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            ForegroundInfo(102, notification)
        }
        setForeground(foregroundInfo)

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
     *  • WeekdayAdvance: half-open window [today+N, nextWorkingDay(today)+N); runLogDate = today (firing day),
     *    so shifts whose natural send day lands on Fri/Sat/holiday/holiday-eve are pulled back onto this run.
     */
    private suspend fun computeWindow(
        config: SchedulerConfigEntity, today: LocalDate, database: MagavDatabase
    ): Triple<LocalDate, LocalDate, LocalDate> {
        val n = config.daysBeforeShift.toLong()
        val windowStart = today.plusDays(n)
        return if (config.reminderType == ReminderTypes.WEEKDAY_ADVANCE) {
            Triple(windowStart, nextWorkingDay(today, database).plusDays(n), today)
        } else {
            Triple(windowStart, windowStart.plusDays(1), windowStart)
        }
    }
}
