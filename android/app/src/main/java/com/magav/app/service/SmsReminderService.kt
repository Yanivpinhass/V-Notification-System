package com.magav.app.service

import com.magav.app.db.MagavDatabase
import com.magav.app.db.entity.SchedulerConfigEntity
import com.magav.app.db.entity.SchedulerRunLogEntity
import com.magav.app.db.entity.LocationEntity
import com.magav.app.db.entity.SmsLogEntity
import com.magav.app.db.entity.VolunteerEntity
import com.magav.app.sms.SmsProvider
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import com.magav.app.util.ReminderTypes
import com.magav.app.util.SmsStatuses
import com.magav.app.util.toIsoRange

data class SmsSummary(val totalEligible: Int, val smsSent: Int, val smsFailed: Int)

class SmsReminderService(
    private val database: MagavDatabase,
    private val smsProvider: SmsProvider
) {
    suspend fun execute(config: SchedulerConfigEntity, targetDate: LocalDate): SmsSummary {
        val (targetDateStart, targetDateEnd) = targetDate.toIsoRange()
        val targetDateStr = targetDate.format(DateTimeFormatter.ISO_LOCAL_DATE)
        val reminderType = config.reminderType

        android.util.Log.d("SmsReminder", "execute: config=${config.id}, type=$reminderType, target=$targetDateStr, range=[$targetDateStart, $targetDateEnd)")

        // Resolve message template once before the loop
        val messageTemplate = database.messageTemplateDao().getById(config.messageTemplateId)
        if (messageTemplate == null) {
            android.util.Log.e("SmsReminder", "MessageTemplate ${config.messageTemplateId} not found for config ${config.id}")
            return SmsSummary(0, 0, 0)
        }

        val shifts = database.shiftDao().getByDateRange(targetDateStart, targetDateEnd)
        android.util.Log.d("SmsReminder", "Found ${shifts.size} shifts for $targetDateStr")

        // Bulk loads (replaces N+1 per-shift queries)
        val volunteerMap: Map<Int, VolunteerEntity>
        val sentShiftIds: Set<Int>
        val locationMap: Map<Int, LocationEntity>
        if (shifts.isNotEmpty()) {
            volunteerMap = database.volunteerDao().getAll().associateBy { it.id }
            val shiftIds = shifts.map { it.id }
            sentShiftIds = database.smsLogDao().getSuccessfulByShiftIdsAndReminderType(shiftIds, reminderType)
                .map { it.shiftId }.toSet()
            locationMap = if (reminderType == ReminderTypes.SAME_DAY) {
                database.locationDao().getAll().associateBy { it.id }
            } else emptyMap()
        } else {
            volunteerMap = emptyMap()
            sentShiftIds = emptySet()
            locationMap = emptyMap()
        }

        var totalEligible = 0
        var smsSent = 0
        var smsFailed = 0

        for (shift in shifts) {
            val volId = shift.volunteerId ?: continue
            val volunteer = volunteerMap[volId]
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

            if (shift.id in sentShiftIds) {
                android.util.Log.d("SmsReminder", "Skip ${volunteer.mappingName}: already sent")
                continue
            }

            totalEligible++

            try {
                var message = buildMessage(
                    messageTemplate.content, shift.shiftName, shift.carId,
                    volunteer.mappingName, targetDate
                )
                if (reminderType == ReminderTypes.SAME_DAY) {
                    val location = shift.locationId?.let { locationMap[it] }
                    val locName = location?.name ?: shift.customLocationName
                    val locNav = location?.navigation ?: shift.customLocationNavigation
                    val locCity = location?.city
                    message += buildLocationText(locName, locCity, locNav)
                }
                android.util.Log.d("SmsReminder", "Sending SMS #$totalEligible to ${volunteer.mappingName} (${volunteer.mobilePhone})")
                val result = smsProvider.sendSms(volunteer.mobilePhone, message)
                android.util.Log.d("SmsReminder", "SMS result: success=${result.success}, error=${result.error}")

                val now = Instant.now().toString()
                val smsLog = SmsLogEntity(
                    shiftId = shift.id,
                    sentAt = now,
                    status = if (result.success) SmsStatuses.SUCCESS else SmsStatuses.FAIL,
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
                            status = SmsStatuses.FAIL,
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

        return SmsSummary(totalEligible, smsSent, smsFailed)
    }

    companion object {
        fun buildMessage(
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

        fun buildLocationText(name: String?, city: String?, navigation: String?): String {
            if (name.isNullOrEmpty()) return ""
            val text = if (!city.isNullOrEmpty()) "\nהניידת נמצאת ב$city ($name)"
                       else "\nהניידת נמצאת אצל $name"
            return if (!navigation.isNullOrEmpty()) "$text ,נווט $navigation" else text
        }

        fun getHebrewDayName(day: DayOfWeek): String = when (day) {
            DayOfWeek.SUNDAY -> "יום א׳"
            DayOfWeek.MONDAY -> "יום ב׳"
            DayOfWeek.TUESDAY -> "יום ג׳"
            DayOfWeek.WEDNESDAY -> "יום ד׳"
            DayOfWeek.THURSDAY -> "יום ה׳"
            DayOfWeek.FRIDAY -> "יום ו׳"
            DayOfWeek.SATURDAY -> "שבת"
        }
    }
}
