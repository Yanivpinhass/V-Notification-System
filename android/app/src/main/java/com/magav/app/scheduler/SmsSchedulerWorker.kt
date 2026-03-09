package com.magav.app.scheduler

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.magav.app.MagavApplication
import com.magav.app.db.MagavDatabase
import com.magav.app.service.SmsReminderService
import com.magav.app.sms.AndroidSmsProvider
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
        val database = MagavApplication.database
        val smsProvider = AndroidSmsProvider(applicationContext)
        val reminderService = SmsReminderService(database, smsProvider)

        val configId = inputData.getInt("configId", -1)
        android.util.Log.d("SmsWorker", "configId=$configId")

        return try {
            if (configId != -1) {
                val config = database.schedulerConfigDao().getById(configId) ?: run {
                    android.util.Log.e("SmsWorker", "Config $configId not found")
                    return Result.failure()
                }
                val targetDate = LocalDate.now(israelTz).plusDays(config.daysBeforeShift.toLong())
                android.util.Log.d("SmsWorker", "Executing config ${config.id} (${config.reminderType}, daysBeforeShift=${config.daysBeforeShift}) for targetDate=$targetDate")
                reminderService.execute(config, targetDate)
            } else {
                checkAllConfigs(database, reminderService)
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
    ) {
        val now = ZonedDateTime.now(israelTz)
        val currentTime = String.format("%02d:%02d", now.hour, now.minute)
        val currentDayOfWeek = now.dayOfWeek

        val configs = database.schedulerConfigDao().getEnabled()

        for (config in configs) {
            val days = getDaysForGroup(config.dayGroup)
            if (currentDayOfWeek !in days) continue
            if (config.time != currentTime) continue

            val targetDate = now.toLocalDate().plusDays(config.daysBeforeShift.toLong())
            val targetDateStr = targetDate.toString()

            if (database.schedulerRunLogDao().existsForConfigAndDate(
                    config.id, targetDateStr, config.reminderType
                )
            ) continue

            reminderService.execute(config, targetDate)
        }
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
