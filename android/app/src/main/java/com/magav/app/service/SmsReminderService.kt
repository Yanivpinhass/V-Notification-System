package com.magav.app.service

import com.magav.app.db.MagavDatabase
import com.magav.app.db.entity.SchedulerConfigEntity
import com.magav.app.db.entity.SchedulerRunLogEntity
import com.magav.app.db.entity.SmsLogEntity
import com.magav.app.sms.SmsProvider
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

class SmsReminderService(
    private val database: MagavDatabase,
    private val smsProvider: SmsProvider
) {
    suspend fun execute(config: SchedulerConfigEntity, targetDate: LocalDate) {
        val targetDateStart = targetDate.atStartOfDay(ZoneOffset.UTC).format(DateTimeFormatter.ISO_INSTANT)
        val targetDateEnd = targetDate.plusDays(1).atStartOfDay(ZoneOffset.UTC).format(DateTimeFormatter.ISO_INSTANT)
        val targetDateStr = targetDate.format(DateTimeFormatter.ISO_LOCAL_DATE)
        val reminderType = config.reminderType

        android.util.Log.d("SmsReminder", "execute: config=${config.id}, type=$reminderType, target=$targetDateStr, range=[$targetDateStart, $targetDateEnd)")

        val shifts = database.shiftDao().getByDateRange(targetDateStart, targetDateEnd)
        android.util.Log.d("SmsReminder", "Found ${shifts.size} shifts for $targetDateStr")

        var totalEligible = 0
        var smsSent = 0
        var smsFailed = 0

        for (shift in shifts) {
            val volunteer = database.volunteerDao().getById(shift.volunteerId)
            if (volunteer == null) {
                android.util.Log.w("SmsReminder", "Volunteer ${shift.volunteerId} not found for shift ${shift.id}")
                continue
            }

            if (volunteer.approveToReceiveSms != 1) {
                android.util.Log.d("SmsReminder", "Skip ${volunteer.mappingName}: not approved")
                continue
            }
            if (volunteer.mobilePhone.isNullOrBlank()) {
                android.util.Log.d("SmsReminder", "Skip ${volunteer.mappingName}: no phone")
                continue
            }

            val existingLog = database.smsLogDao().getByShiftIdAndReminderType(shift.id, reminderType)
            if (existingLog != null && existingLog.status == "Success") {
                android.util.Log.d("SmsReminder", "Skip ${volunteer.mappingName}: already sent")
                continue
            }

            totalEligible++

            try {
                val message = buildMessage(
                    config.messageTemplate, shift.shiftName, shift.carId,
                    volunteer.mappingName, targetDate
                )
                android.util.Log.d("SmsReminder", "Sending SMS #$totalEligible to ${volunteer.mappingName} (${volunteer.mobilePhone})")
                val result = smsProvider.sendSms(volunteer.mobilePhone, message)
                android.util.Log.d("SmsReminder", "SMS result: success=${result.success}, error=${result.error}")

                val now = Instant.now().toString()
                val smsLog = SmsLogEntity(
                    shiftId = shift.id,
                    sentAt = now,
                    status = if (result.success) "Success" else "Fail",
                    error = result.error,
                    reminderType = reminderType
                )
                database.smsLogDao().insert(smsLog)

                if (result.success) {
                    smsSent++
                    // Update SmsSentAt
                    database.shiftDao().update(shift.copy(smsSentAt = now))
                } else {
                    smsFailed++
                }

                // Add delay between SMS to avoid carrier rate limiting
                if (totalEligible > 1) {
                    kotlinx.coroutines.delay(500)
                }
            } catch (e: Exception) {
                smsFailed++
                try {
                    database.smsLogDao().insert(
                        SmsLogEntity(
                            shiftId = shift.id,
                            sentAt = Instant.now().toString(),
                            status = "Fail",
                            error = "שגיאה פנימית",
                            reminderType = reminderType
                        )
                    )
                } catch (_: Exception) {
                }
            }
        }

        // Determine status
        val status = when {
            totalEligible == 0 -> "Completed"
            smsFailed == 0 -> "Completed"
            smsSent == 0 -> "Failed"
            else -> "Partial"
        }
        val runError = if (smsFailed > 0) "$smsFailed הודעות נכשלו" else null

        android.util.Log.d("SmsReminder", "Summary: eligible=$totalEligible, sent=$smsSent, failed=$smsFailed, status=$status")

        // Insert SchedulerRunLog
        try {
            database.schedulerRunLogDao().insert(
                SchedulerRunLogEntity(
                    configId = config.id,
                    reminderType = reminderType,
                    ranAt = Instant.now().toString(),
                    targetDate = targetDateStr,
                    totalEligible = totalEligible,
                    smsSent = smsSent,
                    smsFailed = smsFailed,
                    status = status,
                    error = runError
                )
            )
        } catch (_: Exception) {
            // UNIQUE constraint violation = already ran
        }
    }

    private fun buildMessage(
        template: String, shiftName: String, carId: String,
        volunteerName: String, targetDate: LocalDate
    ): String {
        val dateStr = "${targetDate.dayOfMonth.toString().padStart(2, '0')}/" +
            "${targetDate.monthValue.toString().padStart(2, '0')}/${targetDate.year}"
        val dayName = getHebrewDayName(targetDate.dayOfWeek)

        return template
            .replace("{שם}", volunteerName)
            .replace("{שם מלא}", volunteerName)
            .replace("{תאריך}", dateStr)
            .replace("{יום}", dayName)
            .replace("{משמרת}", shiftName)
            .replace("{רכב}", carId)
    }

    private fun getHebrewDayName(day: DayOfWeek): String = when (day) {
        DayOfWeek.SUNDAY -> "יום א׳"
        DayOfWeek.MONDAY -> "יום ב׳"
        DayOfWeek.TUESDAY -> "יום ג׳"
        DayOfWeek.WEDNESDAY -> "יום ד׳"
        DayOfWeek.THURSDAY -> "יום ה׳"
        DayOfWeek.FRIDAY -> "יום ו׳"
        DayOfWeek.SATURDAY -> "שבת"
    }
}
