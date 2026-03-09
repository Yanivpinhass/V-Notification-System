package com.magav.app.service

import org.apache.poi.ss.usermodel.Cell
import org.apache.poi.ss.usermodel.CellType
import org.apache.poi.ss.usermodel.CellValue
import org.apache.poi.ss.usermodel.DateUtil
import org.apache.poi.ss.usermodel.FormulaEvaluator
import org.apache.poi.ss.usermodel.Sheet
import org.apache.poi.ss.usermodel.WorkbookFactory
import java.io.InputStream
import java.time.LocalDate
import java.time.ZoneId

data class ExcelShift(
    val date: LocalDate,
    val name: String,
    val car: String,
    val volunteers: List<String>
)

object ShiftScheduleParser {
    private const val TEAM_COUNT = 4
    private const val ROWS_PER_TEAM = 6
    private const val VOLUNTEER_ROWS_PER_TEAM = 4
    private const val COLUMNS_TO_READ = 7
    private const val TEAM_BLOCK_OFFSET = 3

    fun parse(inputStream: InputStream): List<ExcelShift> {
        val workbook = WorkbookFactory.create(inputStream)
        val evaluator = workbook.creationHelper.createFormulaEvaluator()
        val results = mutableListOf<ExcelShift>()

        for (sheetIndex in 0 until workbook.numberOfSheets) {
            val sheet = workbook.getSheetAt(sheetIndex)
            val totalRows = sheet.lastRowNum + 1
            val dateRows = findDateRows(sheet, totalRows, evaluator)

            android.util.Log.d("ShiftParser", "Sheet $sheetIndex: found ${dateRows.size} date rows in $totalRows total rows")

            for (dateRow in dateRows) {
                val lastRequiredRow = dateRow + TEAM_BLOCK_OFFSET + (TEAM_COUNT * ROWS_PER_TEAM) - 1
                if (lastRequiredRow >= totalRows) continue
                parseWeekBlock(sheet, dateRow, results, evaluator)
            }
        }

        android.util.Log.d("ShiftParser", "Total shifts parsed: ${results.size}")
        workbook.close()
        return results
    }

    private fun findDateRows(sheet: Sheet, totalRows: Int, evaluator: FormulaEvaluator): List<Int> {
        val dateRows = mutableListOf<Int>()

        for (rowIndex in 0 until totalRows) {
            val row = sheet.getRow(rowIndex) ?: continue
            val cell = row.getCell(0) ?: continue
            val date = getCellAsDate(cell, evaluator) ?: continue

            @Suppress("DEPRECATION")
            if (date.year + 1900 > 1901) {
                dateRows.add(rowIndex)
            }
        }

        return dateRows
    }

    private fun getCellAsDate(cell: Cell, evaluator: FormulaEvaluator): java.util.Date? {
        return try {
            when (cell.cellType) {
                CellType.NUMERIC -> {
                    if (DateUtil.isCellDateFormatted(cell)) {
                        cell.dateCellValue
                    } else {
                        DateUtil.getJavaDate(cell.numericCellValue)
                    }
                }
                CellType.FORMULA -> {
                    val evaluated = evaluator.evaluate(cell)
                    if (evaluated.cellType == CellType.NUMERIC) {
                        DateUtil.getJavaDate(evaluated.numberValue)
                    } else {
                        null
                    }
                }
                else -> null
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun getCellStringValue(cell: Cell?, evaluator: FormulaEvaluator): String {
        if (cell == null) return ""
        return try {
            when (cell.cellType) {
                CellType.STRING -> cell.stringCellValue.trim()
                CellType.NUMERIC -> {
                    if (DateUtil.isCellDateFormatted(cell)) {
                        cell.dateCellValue.toString()
                    } else {
                        val num = cell.numericCellValue
                        if (num == Math.floor(num) && !num.isInfinite()) {
                            num.toLong().toString()
                        } else {
                            num.toString()
                        }
                    }
                }
                CellType.FORMULA -> {
                    val evaluated = evaluator.evaluate(cell)
                    when (evaluated.cellType) {
                        CellType.STRING -> evaluated.stringValue.trim()
                        CellType.NUMERIC -> {
                            val num = evaluated.numberValue
                            if (num == Math.floor(num) && !num.isInfinite()) {
                                num.toLong().toString()
                            } else {
                                num.toString()
                            }
                        }
                        else -> cell.toString().trim()
                    }
                }
                CellType.BOOLEAN -> cell.booleanCellValue.toString()
                CellType.BLANK -> ""
                else -> cell.toString().trim()
            }
        } catch (_: Exception) {
            cell.toString().trim()
        }
    }

    private fun parseWeekBlock(sheet: Sheet, dateRowIndex: Int, results: MutableList<ExcelShift>, evaluator: FormulaEvaluator) {
        val dates = mutableListOf<LocalDate>()
        val dateRow = sheet.getRow(dateRowIndex) ?: return

        for (col in 0 until COLUMNS_TO_READ) {
            val cell = dateRow.getCell(col) ?: continue
            val utilDate = getCellAsDate(cell, evaluator) ?: continue

            @Suppress("DEPRECATION")
            if (utilDate.year + 1900 <= 1901) continue

            val localDate = utilDate.toInstant().atZone(ZoneId.systemDefault()).toLocalDate()
            dates.add(localDate)
        }

        if (dates.isEmpty()) return

        android.util.Log.d("ShiftParser", "Week block at row $dateRowIndex: dates=${dates.joinToString()}")

        val teamStartRow = dateRowIndex + TEAM_BLOCK_OFFSET

        for (teamIndex in 0 until TEAM_COUNT) {
            val teamRowOffset = teamStartRow + (teamIndex * ROWS_PER_TEAM)
            val nameRow = sheet.getRow(teamRowOffset) ?: continue
            val carRow = sheet.getRow(teamRowOffset + 1) ?: continue

            for (col in 0 until COLUMNS_TO_READ) {
                if (col >= dates.size) break
                val date = dates[col]

                val teamName = getCellStringValue(nameRow.getCell(col), evaluator)
                val carNumber = getCellStringValue(carRow.getCell(col), evaluator)

                if (teamName.isBlank()) continue

                val volunteers = mutableListOf<String>()
                for (volRow in 0 until VOLUNTEER_ROWS_PER_TEAM) {
                    val row = sheet.getRow(teamRowOffset + 2 + volRow) ?: continue
                    val name = getCellStringValue(row.getCell(col), evaluator)
                    if (name.isNotBlank()) {
                        volunteers.add(name)
                    }
                }

                results.add(
                    ExcelShift(
                        date = date,
                        name = teamName,
                        car = carNumber,
                        volunteers = volunteers
                    )
                )
            }
        }
    }
}
