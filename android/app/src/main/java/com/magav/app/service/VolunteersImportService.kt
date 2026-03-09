package com.magav.app.service

import com.magav.app.api.models.ImportResultDto
import com.magav.app.db.MagavDatabase
import com.magav.app.db.entity.VolunteerEntity
import org.apache.poi.ss.usermodel.WorkbookFactory
import java.io.InputStream
import java.time.Instant

class VolunteersImportService(private val database: MagavDatabase) {

    companion object {
        private const val MAX_ROWS = 10000

        private val SMS_APPROVED_VALUES = setOf("כן", "1", "true", "yes")
    }

    suspend fun importFromExcel(inputStream: InputStream): ImportResultDto {
        val workbook = WorkbookFactory.create(inputStream)
        try {
            val sheet = workbook.getSheetAt(0)
            val totalRows = sheet.physicalNumberOfRows

            var inserted = 0
            var updated = 0
            var errorCount = 0
            val errorMessages = mutableListOf<String>()

            val rowCount = minOf(totalRows, MAX_ROWS)

            for (rowIndex in 1 until rowCount) {
                val row = sheet.getRow(rowIndex) ?: continue

                val name = row.getCell(0)?.toString()?.trim()
                if (name.isNullOrBlank()) {
                    continue
                }

                val rawPhone = row.getCell(1)?.toString()?.trim().orEmpty()
                val phone = sanitizePhone(rawPhone)

                val approvalRaw = row.getCell(2)?.toString()?.trim().orEmpty()
                val approval = if (SMS_APPROVED_VALUES.any { it.equals(approvalRaw, ignoreCase = true) }) 1 else 0

                try {
                    val existing = database.volunteerDao().getByMappingName(name)
                    val now = Instant.now().toString()

                    if (existing != null) {
                        val updatedEntity = existing.copy(
                            mobilePhone = phone,
                            approveToReceiveSms = approval,
                            updatedAt = now
                        )
                        database.volunteerDao().update(updatedEntity)
                        updated++
                    } else {

                        val newEntity = VolunteerEntity(
                            mappingName = name,
                            mobilePhone = phone,
                            approveToReceiveSms = approval,
                            createdAt = now,
                            updatedAt = now
                        )
                        database.volunteerDao().insert(newEntity)
                        inserted++
                    }
                } catch (e: Exception) {
                    errorMessages.add("שורה ${rowIndex + 1}: ${e.message}")
                    errorCount++
                }
            }

            return ImportResultDto(
                totalRows = rowCount - 1,
                inserted = inserted,
                updated = updated,
                errors = errorCount,
                errorMessages = errorMessages
            )
        } finally {
            workbook.close()
        }
    }

    private fun sanitizePhone(raw: String): String {
        val digits = raw.replace(Regex("[^0-9]"), "")
        if (digits.isBlank()) return ""
        return if (digits.startsWith("0")) digits else "0$digits"
    }
}
