package com.magav.app.service

import com.magav.app.db.MagavDatabase
import com.magav.app.db.entity.SchedulerConfigEntity
import com.magav.app.db.entity.SchedulerRunLogEntity
import com.magav.app.db.entity.LocationEntity
import com.magav.app.db.entity.SmsLogEntity
import com.magav.app.db.entity.VolunteerEntity
import com.magav.app.sms.SmsProvider
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import com.magav.app.util.ReminderTypes
import com.magav.app.util.ShiftTypes
import com.magav.app.util.SmsStatuses
import com.magav.app.util.toIsoInstant

data class SmsSummary(val totalEligible: Int, val smsSent: Int, val smsFailed: Int)

class SmsReminderService(
    private val database: MagavDatabase,
    private val smsProvider: SmsProvider
) {
    private val israelTz = ZoneId.of("Asia/Jerusalem")

    suspend fun execute(
        config: SchedulerConfigEntity,
        windowStart: LocalDate,
        windowEnd: LocalDate,
        runLogTargetDate: LocalDate
    ): SmsSummary = executeMutex.withLock {
        // Process-global serialization: two configs alarmed at the same minute (or yesterday's
        // still-retrying work item vs today's fresh one) run as PARALLEL workers — without this
        // lock both could pass the pre-loop dedup snapshot before either inserts. [dup-sms 1.5]
        executeInternal(config, windowStart, windowEnd, runLogTargetDate)
    }

    private suspend fun executeInternal(
        config: SchedulerConfigEntity,
        windowStart: LocalDate,
        windowEnd: LocalDate,
        runLogTargetDate: LocalDate
    ): SmsSummary {
        // [windowStart, windowEnd) is the half-open shift-date query range. For SameDay/Advance it is a
        // single day (windowEnd == windowStart + 1) and runLogTargetDate == windowStart, byte-identical
        // to before. For WeekdayAdvance the window may span several days; runLogTargetDate is the firing day.
        val targetDateStart = windowStart.toIsoInstant()
        val targetDateEnd = windowEnd.toIsoInstant()
        val runLogDateStr = runLogTargetDate.format(DateTimeFormatter.ISO_LOCAL_DATE)
        val reminderType = config.reminderType

        // Shift-type isolation: AdminAdvance pulls ONLY Administrative shifts; every operational
        // reminder type pulls ONLY Operational. Mirrors the .NET eligibility predicate.
        val shiftType = if (reminderType == ReminderTypes.ADMIN_ADVANCE)
            ShiftTypes.ADMINISTRATIVE else ShiftTypes.OPERATIONAL

        android.util.Log.d("SmsReminder", "execute: config=${config.id}, type=$reminderType, window=[$targetDateStart, $targetDateEnd), runLogDate=$runLogDateStr")

        // Resolve message template once before the loop
        val messageTemplate = database.messageTemplateDao().getById(config.messageTemplateId)
        if (messageTemplate == null) {
            android.util.Log.e("SmsReminder", "MessageTemplate ${config.messageTemplateId} not found for config ${config.id}")
            return SmsSummary(0, 0, 0)
        }

        val shifts = database.shiftDao().getByDateRangeAndType(targetDateStart, targetDateEnd, shiftType)
        android.util.Log.d("SmsReminder", "Found ${shifts.size} shifts in window [$targetDateStart, $targetDateEnd) type=$shiftType")

        // Bulk loads (replaces N+1 per-shift queries)
        val volunteerMap: Map<Int, VolunteerEntity>
        val sentShiftIds: Set<Int>
        val locationMap: Map<Int, LocationEntity>
        if (shifts.isNotEmpty()) {
            volunteerMap = database.volunteerDao().getAll().associateBy { it.id }
            val shiftIds = shifts.map { it.id }
            // ANY row — Success, Dispatched, or Fail — blocks automatic re-dispatch. A delivered
            // send may be logged Dispatched (unconfirmed) or even Fail (old data); resending
            // automatically is the incident's failure mode. [dup-sms 1.2, at-most-once doctrine]
            sentShiftIds = database.smsLogDao().getShiftIdsWithAnyRow(shiftIds, reminderType).toSet()
            // Load locations for SAME_DAY (location-append) AND for ADMIN_ADVANCE (the {מיקום}
            // placeholder resolves to the shift's location name — matching .NET which always projects it).
            locationMap = if (reminderType == ReminderTypes.SAME_DAY || reminderType == ReminderTypes.ADMIN_ADVANCE) {
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
        // Monitoring: eligible shifts pulled back from a later (non-working) day onto this run.
        // Always 0 for the single-day SameDay/Advance window.
        var pullBackCount = 0

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

            // Point re-check as close to dispatch as possible: a row of ANY status that appeared
            // since the pre-loop snapshot (e.g. a concurrent manual send) means a dispatch was
            // already attempted for this (shift, type). [dup-sms 1.3b]
            if (database.smsLogDao().existsByShiftIdAndReminderType(shift.id, reminderType) > 0) {
                android.util.Log.d("SmsReminder", "Skip ${volunteer.mappingName}: SmsLog row appeared after snapshot")
                continue
            }

            totalEligible++
            var writeAheadId: Long? = null

            try {
                // 🆕A: derive {תאריך}/{יום} from each shift's OWN date (the window may span several
                // days for WeekdayAdvance). Byte-identical for SameDay/Advance, where the single-day
                // window guarantees the shift date == windowStart.
                val shiftDate = Instant.parse(shift.shiftDate).atZone(israelTz).toLocalDate()
                if (shiftDate != windowStart) pullBackCount++
                val location = shift.locationId?.let { locationMap[it] }
                val locName = location?.name ?: shift.customLocationName
                val locNav = location?.navigation ?: shift.customLocationNavigation
                val locCity = location?.city
                var message = buildMessage(
                    messageTemplate.content, shift.shiftName, shift.carId,
                    volunteer.mappingName, shiftDate,
                    description = shift.description,
                    shiftTime = shift.shiftTime,
                    locationName = locName,
                    address = shift.address,
                    vehicleLocation = shift.vehicleLocation
                )
                if (reminderType == ReminderTypes.SAME_DAY) {
                    message += buildLocationText(locName, locCity, locNav)   // operational SameDay — unchanged
                } else if (reminderType == ReminderTypes.ADMIN_ADVANCE) {
                    // admin scheduled — mission + vehicle blocks (§5). Vehicle location via the bulk map.
                    val vehLoc = shift.vehicleLocationId?.let { locationMap[it] }
                    message += buildAdminSmsBlocks(
                        missionName = locName, missionAddress = shift.address, missionNav = locNav,
                        vehicleLocationId = shift.vehicleLocationId,
                        vehicleName = vehLoc?.name ?: shift.vehicleLocation,
                        vehicleCity = vehLoc?.city, vehicleNav = vehLoc?.navigation
                    )
                }
                android.util.Log.d("SmsReminder", "Sending SMS #$totalEligible to ${volunteer.mappingName} (${volunteer.mobilePhone})")

                // Write-ahead: record the dispatch BEFORE handing the message to the radio —
                // fail-closed (no row ⇒ no dispatch). Status passed explicitly: the entity
                // default is SUCCESS. [dup-sms 1.3]
                writeAheadId = database.smsLogDao().insert(
                    SmsLogEntity(
                        shiftId = shift.id,
                        sentAt = Instant.now().toString(),
                        status = SmsStatuses.DISPATCHED,
                        error = null,
                        reminderType = reminderType
                    )
                )

                val result = smsProvider.sendSms(volunteer.mobilePhone, message)
                android.util.Log.d("SmsReminder", "SMS result: outcome=${result.outcome}, error=${result.error}")

                // From here on the message may have reached the radio — the catch below must
                // NEVER flip the row to Fail (its current Dispatched state is already safe, and
                // a delivered message must not be re-labeled by a bookkeeping error). [review]
                val logId = checkNotNull(writeAheadId)
                writeAheadId = null

                when (result.outcome) {
                    SmsProvider.Outcome.CONFIRMED -> {
                        database.smsLogDao().updateStatusById(logId, SmsStatuses.SUCCESS, null)
                        smsSent++
                        // smsSentAt is bookkeeping only — its failure must not fail the shift. [review]
                        try {
                            database.shiftDao().update(shift.copy(smsSentAt = Instant.now().toString()))
                        } catch (be: Exception) {
                            if (be is CancellationException) throw be
                            android.util.Log.e("SmsReminder", "smsSentAt update failed for shift ${shift.id}", be)
                        }
                    }
                    SmsProvider.Outcome.FAILED -> {
                        database.smsLogDao().updateStatusById(logId, SmsStatuses.FAIL, result.error)
                        smsFailed++
                    }
                    SmsProvider.Outcome.UNKNOWN -> {
                        // Dispatched but unconfirmed — most likely delivered. The row stays
                        // DISPATCHED (blocks re-dispatch) and counts as sent.
                        android.util.Log.w("SmsReminder", "SMS outcome UNKNOWN for shift ${shift.id}: ${result.error}")
                        smsSent++
                    }
                }

                // Add delay between SMS to avoid carrier rate limiting
                if (totalEligible > 1) {
                    kotlinx.coroutines.delay(500)
                }
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                smsFailed++
                // writeAheadId is non-null ONLY between the insert and the send returning:
                //  • pre-insert exception → no row, no dispatch attempted — a later run may retry;
                //  • insert-to-send exception → nothing reached the radio — mark the row Fail;
                //  • post-send exception → writeAheadId already nulled — the row keeps its
                //    Dispatched/Success state (never flipped to Fail). [dup-sms 1.3e + review]
                writeAheadId?.let { id ->
                    try {
                        database.smsLogDao().updateStatusById(id, SmsStatuses.FAIL, "שגיאה פנימית")
                    } catch (ue: Exception) {
                        if (ue is CancellationException) throw ue
                        android.util.Log.e("SmsReminder", "Failed to mark write-ahead row $id as Fail", ue)
                    }
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

        android.util.Log.i("SmsReminder", "Summary: config=${config.id} type=$reminderType window=[$windowStart..$windowEnd) eligible=$totalEligible sent=$smsSent failed=$smsFailed pulledBack=$pullBackCount status=$status")

        // Insert SchedulerRunLog
        try {
            database.schedulerRunLogDao().insert(
                SchedulerRunLogEntity(
                    configId = config.id,
                    reminderType = reminderType,
                    ranAt = Instant.now().toString(),
                    targetDate = runLogDateStr,
                    totalEligible = totalEligible,
                    smsSent = smsSent,
                    smsFailed = smsFailed,
                    status = status,
                    error = runError
                )
            )
        } catch (_: android.database.sqlite.SQLiteConstraintException) {
            // UNIQUE constraint violation = already ran — silent dedup hit.
        } catch (e: Exception) {
            // Not a dedup hit: a transient/real DB error. Log distinctly so it is no longer
            // masked as "already ran". Do NOT rethrow — doWork()'s catch maps any exception to
            // Result.retry(), which would re-run the batch → duplicate SMS. [ISS-006]
            // Keep STRUCTURALLY IDENTICAL to the .NET mirror in
            // web/server/Magav.Server/Database/Repositories/SchedulerRunLogRepository.cs.
            android.util.Log.e(
                "SmsReminder",
                "SchedulerRunLog insert failed (non-constraint) for configId=${config.id}, targetDate=$runLogDateStr, reminderType=$reminderType",
                e
            )
        }

        return SmsSummary(totalEligible, smsSent, smsFailed)
    }

    companion object {
        // Serializes ALL scheduler batch executions in the process — see execute(). [dup-sms 1.5]
        private val executeMutex = Mutex()

        // The OPTIONAL administrative placeholders (their source columns are NULL for operational rows
        // and may be blank for admin rows). When blank, the token is STRIPPED (never left as raw {…})
        // and any line it emptied is collapsed. Mirrors .NET SmsReminderService.AdminOptionalPlaceholders.
        private val ADMIN_OPTIONAL_PLACEHOLDERS =
            listOf("{תיאור}", "{שעה}", "{מיקום}", "{כתובת}", "{מיקום רכב}")

        // 5 original params + 5 nullable administrative params (default null so operational callers pass
        // nothing new). NOTE: unlike the .NET ShiftVolunteerDto — which already carried LocationName —
        // Android buildMessage had no location name, so {מיקום} needs its own param here (10 total, not
        // the plan's 9). Behavior is identical to .NET BuildMessage; {שם מלא} keeps the pre-existing
        // Android divergence (mappingName, not First+Last) — ISS-003.
        fun buildMessage(
            template: String,
            shiftName: String,
            carId: String,
            volunteerName: String,
            targetDate: LocalDate,
            description: String? = null,
            shiftTime: String? = null,
            locationName: String? = null,
            address: String? = null,
            vehicleLocation: String? = null
        ): String {
            val dateStr = "${targetDate.dayOfMonth.toString().padStart(2, '0')}/" +
                "${targetDate.monthValue.toString().padStart(2, '0')}/${targetDate.year}"
            val dayName = getHebrewDayName(targetDate.dayOfWeek)

            // Existing placeholders — behavior UNCHANGED, so operational output stays byte-for-byte identical.
            var result = template
                .replace("{שם}", volunteerName)
                .replace("{שם מלא}", volunteerName)
                .replace("{תאריך}", dateStr)
                .replace("{יום}", dayName)
                .replace("{משמרת}", shiftName)
                .replace("{רכב}", carId)

            // Operational templates use none of the admin placeholders, so the strip + collapse below
            // is skipped for them (guaranteeing unchanged operational SMS).
            val hasAdmin = ADMIN_OPTIONAL_PLACEHOLDERS.any { result.contains(it) }

            result = replaceOrStrip(result, "{תיאור}", description)
            result = replaceOrStrip(result, "{שעה}", shiftTime)
            result = replaceOrStrip(result, "{כתובת}", address)
            result = replaceOrStrip(result, "{מיקום רכב}", vehicleLocation)
            result = replaceOrStrip(result, "{מיקום}", locationName)

            if (hasAdmin) result = collapseBlankLines(result)

            return result
        }

        // Replace the token with its value when present; otherwise DELETE the token (never ship raw {…}).
        private fun replaceOrStrip(s: String, token: String, value: String?): String =
            if (s.contains(token)) s.replace(token, if (value.isNullOrBlank()) "" else value) else s

        // Remove whitespace-only lines and trailing whitespace left by an inline strip; preserve any
        // line that still has literal content. Mirrors .NET CollapseBlankLines.
        private fun collapseBlankLines(s: String): String =
            s.replace("\r\n", "\n").split("\n").map { it.trimEnd() }.filter { it.isNotEmpty() }.joinToString("\n")

        fun buildLocationText(name: String?, city: String?, navigation: String?): String {
            if (name.isNullOrEmpty()) return ""
            val text = if (!city.isNullOrEmpty()) "\nהניידת נמצאת ב$city ($name)"
                       else "\nהניידת נמצאת אצל $name"
            return if (!navigation.isNullOrEmpty()) "$text\n${appendWazeNavigate(navigation)}" else text
        }

        // Admin MISSION-location block (§5a) — distinct wording from the vehicle block. Mirrors .NET
        // BuildAdminMissionText. Each line present only when its value is non-empty.
        fun buildAdminMissionText(name: String?, address: String?, navigation: String?): String {
            val sb = StringBuilder()
            if (!name.isNullOrBlank()) sb.append("\nמיקום המשימה: $name")
            if (!address.isNullOrBlank()) sb.append("\nכתובת: $address")
            if (!navigation.isNullOrBlank()) sb.append("\n${appendWazeNavigate(navigation)}")
            return sb.toString()
        }

        // Combined admin SMS blocks (mission then vehicle) appended to ALL admin sends (V2-D1).
        // Mirrors .NET BuildAdminSmsBlocks. vehicleName is the coalesced value (picked row name OR the
        // free text). When a Vehicle location is picked it reuses buildLocationText (with Waze); else a
        // plain free-text line (no Waze).
        fun buildAdminSmsBlocks(
            missionName: String?, missionAddress: String?, missionNav: String?,
            vehicleLocationId: Int?, vehicleName: String?, vehicleCity: String?, vehicleNav: String?
        ): String {
            val mission = buildAdminMissionText(missionName, missionAddress, missionNav)
            val vehicle = when {
                vehicleLocationId != null && !vehicleName.isNullOrBlank() ->
                    buildLocationText(vehicleName, vehicleCity, vehicleNav)
                !vehicleName.isNullOrBlank() -> "\nמיקום הרכב: $vehicleName"   // free-text fallback — no Waze
                else -> ""
            }
            return mission + vehicle
        }

        private fun appendWazeNavigate(url: String): String {
            if (!url.contains("waze.com", ignoreCase = true) &&
                !url.startsWith("waze://", ignoreCase = true))
                return url

            if (url.contains("navigate=yes", ignoreCase = true))
                return url

            return if (url.contains('?')) "$url&navigate=yes" else "$url?navigate=yes"
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
