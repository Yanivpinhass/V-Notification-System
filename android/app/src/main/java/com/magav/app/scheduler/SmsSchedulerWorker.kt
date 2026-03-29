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
import com.magav.app.service.SmsSummary
import com.magav.app.service.SmsReminderService
import com.magav.app.sms.AndroidSmsProvider
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
                val targetDate = LocalDate.now(israelTz).plusDays(config.daysBeforeShift.toLong())
                val targetDateStr = targetDate.toString()

                // Prevent re-execution on retry (same check as checkAllConfigs)
                if (database.schedulerRunLogDao().existsForConfigAndDate(
                        config.id, targetDateStr, config.reminderType
                    )
                ) {
                    android.util.Log.d("SmsWorker", "Config $configId already ran for $targetDateStr, skipping")
                    return Result.success()
                }

                android.util.Log.d("SmsWorker", "Executing config ${config.id} (${config.reminderType}, daysBeforeShift=${config.daysBeforeShift}) for targetDate=$targetDate")
                reminderService.execute(config, targetDate)
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
        val currentDayOfWeek = now.dayOfWeek

        val configs = database.schedulerConfigDao().getEnabled()

        var totalEligible = 0
        var totalSent = 0
        var totalFailed = 0

        for (config in configs) {
            try {
                val days = getDaysForGroup(config.dayGroup)
                if (currentDayOfWeek !in days) continue
                if (config.time != currentTime) continue

                val targetDate = now.toLocalDate().plusDays(config.daysBeforeShift.toLong())
                val targetDateStr = targetDate.toString()

                if (database.schedulerRunLogDao().existsForConfigAndDate(
                        config.id, targetDateStr, config.reminderType
                    )
                ) continue

                val summary = reminderService.execute(config, targetDate)
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

    private fun getDaysForGroup(dayGroup: String): List<DayOfWeek> = when (dayGroup) {
        "SunThu" -> listOf(
            DayOfWeek.SUNDAY, DayOfWeek.MONDAY, DayOfWeek.TUESDAY,
            DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY
        )
        "Fri" -> listOf(DayOfWeek.FRIDAY)
        "Sat" -> listOf(DayOfWeek.SATURDAY)
        else -> emptyList()
    }
}
