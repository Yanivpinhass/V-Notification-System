package com.magav.app.scheduler

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.magav.app.MagavApplication
import java.time.DayOfWeek
import java.time.ZoneId
import java.time.ZonedDateTime

class AlarmScheduler(private val context: Context) {

    private val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private val israelTz = ZoneId.of("Asia/Jerusalem")

    suspend fun scheduleAllAlarms() {
        val database = MagavApplication.database
        val allConfigs = database.schedulerConfigDao().getAll()

        android.util.Log.d("AlarmScheduler", "Scheduling alarms: ${allConfigs.size} total configs")

        // Cancel ALL alarms (enabled and disabled) using real request codes
        for (config in allConfigs) {
            val days = getDaysForGroup(config.dayGroup)
            for (day in days) {
                val requestCode = config.id * 10 + day.value
                val intent = Intent(context, SmsAlarmReceiver::class.java)
                val pendingIntent = PendingIntent.getBroadcast(
                    context, requestCode, intent,
                    PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
                )
                pendingIntent?.let { alarmManager.cancel(it) }
            }
        }

        // Re-schedule only enabled configs
        val enabledConfigs = allConfigs.filter { it.isEnabled == 1 }
        android.util.Log.d("AlarmScheduler", "Re-scheduling ${enabledConfigs.size} enabled configs")
        for (config in enabledConfigs) {
            val days = getDaysForGroup(config.dayGroup)
            for (day in days) {
                scheduleAlarmForDay(config.id, config.time, day)
            }
        }
        android.util.Log.d("AlarmScheduler", "All alarms scheduled")
    }

    private fun scheduleAlarmForDay(configId: Int, time: String, dayOfWeek: DayOfWeek) {
        val parts = time.split(":")
        val hour = parts[0].toInt()
        val minute = parts[1].toInt()

        val now = ZonedDateTime.now(israelTz)
        var target = now.with(dayOfWeek)
            .withHour(hour).withMinute(minute).withSecond(0).withNano(0)

        // If target is in the past, move to next week
        if (target.isBefore(now) || target.isEqual(now)) {
            target = target.plusWeeks(1)
        }

        val triggerAtMillis = target.toInstant().toEpochMilli()
        val requestCode = configId * 10 + dayOfWeek.value // unique per config+day

        val intent = Intent(context, SmsAlarmReceiver::class.java).apply {
            putExtra("configId", configId)
            action = "com.magav.app.SMS_ALARM_$requestCode"
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            // Fallback to inexact alarm (may fire up to 15 min late - acceptable for SMS reminders)
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
            android.util.Log.w("AlarmScheduler", "Exact alarms denied, using inexact for configId=$configId day=$dayOfWeek at $target")
        } else {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
            android.util.Log.d("AlarmScheduler", "Alarm set: configId=$configId day=$dayOfWeek at $target")
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
