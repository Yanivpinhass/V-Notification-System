package com.magav.app.service

import com.magav.app.api.models.ImportResultDto
import com.magav.app.db.MagavDatabase
import com.magav.app.db.entity.ShiftEntity
import java.io.InputStream
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import com.magav.app.util.toIsoInstant

class ShiftsImportService(private val database: MagavDatabase) {

    companion object {
        private val ISRAEL_TZ = ZoneId.of("Asia/Jerusalem")
    }

    suspend fun importFromExcel(inputStream: InputStream): ImportResultDto {
        val excelShifts = ShiftScheduleParser.parse(inputStream)
        android.util.Log.d("ShiftsImport", "Parsed ${excelShifts.size} shifts from Excel")

        val today = LocalDate.now(ISRAEL_TZ)
        val futureShifts = excelShifts.filter { !it.date.isBefore(today) }
        android.util.Log.d("ShiftsImport", "Future shifts (>= $today): ${futureShifts.size}")

        if (futureShifts.isEmpty()) {
            return ImportResultDto(
                totalRows = 0, inserted = 0, updated = 0,
                errors = 1,
                errorMessages = listOf("לא נמצאו משמרות עתידיות בקובץ")
            )
        }

        val allVolunteers = database.volunteerDao().getAll()
        val volunteerMap = allVolunteers.associateBy { it.mappingName.lowercase() }
        android.util.Log.d("ShiftsImport", "Volunteers in DB: ${allVolunteers.size}")

        val unresolvedNames = mutableSetOf<String>()
        val newShifts = mutableListOf<ShiftEntity>()
        val dedupeKeys = mutableSetOf<String>()
        var totalAssignments = 0

        val now = Instant.now().toString()

        for (shift in futureShifts) {
            val shiftDateIso = shift.date.toIsoInstant()

            for (volunteerName in shift.volunteers) {
                totalAssignments++
                val volunteer = volunteerMap[volunteerName.lowercase()]

                if (volunteer != null) {
                    val dedupeKey = "$shiftDateIso|${shift.name}|${volunteer.id}"
                    if (!dedupeKeys.add(dedupeKey)) continue

                    newShifts.add(
                        ShiftEntity(
                            shiftDate = shiftDateIso,
                            shiftName = shift.name,
                            carId = shift.car,
                            volunteerId = volunteer.id,
                            smsSentAt = null,
                            createdAt = now,
                            updatedAt = now
                        )
                    )
                } else {
                    val dedupeKey = "$shiftDateIso|${shift.name}|name:$volunteerName"
                    if (!dedupeKeys.add(dedupeKey)) continue

                    newShifts.add(
                        ShiftEntity(
                            shiftDate = shiftDateIso,
                            shiftName = shift.name,
                            carId = shift.car,
                            volunteerId = null,
                            volunteerName = volunteerName,
                            smsSentAt = null,
                            createdAt = now,
                            updatedAt = now
                        )
                    )
                    unresolvedNames.add(volunteerName)
                }
            }
        }

        val minDate = futureShifts.minOf { it.date }
        val maxDate = futureShifts.maxOf { it.date }
        val minDateIso = minDate.toIsoInstant()
        val maxDateIso = maxDate.toIsoInstant()
        database.shiftDao().deleteByDateRange(minDateIso, maxDateIso)
        database.shiftDao().insertAll(newShifts)

        return ImportResultDto(
            totalRows = totalAssignments,
            inserted = newShifts.size,
            updated = 0,
            errors = 0,
            errorMessages = emptyList(),
            unresolvedVolunteers = unresolvedNames.size,
            unresolvedVolunteerNames = unresolvedNames.toList()
        )
    }
}
