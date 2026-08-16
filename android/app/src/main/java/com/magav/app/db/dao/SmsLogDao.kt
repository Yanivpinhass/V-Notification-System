package com.magav.app.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.magav.app.db.entity.SmsLogEntity

// Detector row: a (shift, reminder-type) pair with more than one non-Fail dispatch in the
// current run window — the signature of a duplicate send. [dup-sms plan 5.2]
data class DuplicateSmsDto(
    val shiftId: Int,
    val reminderType: String,
    val cnt: Int
)

@Dao
interface SmsLogDao {

    @Query(
        """
        SELECT sl.Id AS id, sl.SentAt AS sentAt, sl.Status AS status, sl.Error AS error,
               s.ShiftDate AS shiftDate, s.ShiftName AS shiftName, v.MappingName AS volunteerName
        FROM SmsLog sl
        JOIN Shifts s ON sl.ShiftId = s.Id
        JOIN Volunteers v ON s.VolunteerId = v.Id
        WHERE sl.SentAt >= :from
          AND s.ShiftType = 'Operational'
        ORDER BY sl.SentAt DESC
        """
    )
    suspend fun getLogsWithDetails(from: String): List<SmsLogDetailDto>

    @Query(
        """
        SELECT s.ShiftDate AS shiftDate, s.ShiftName AS shiftName,
               COUNT(*) AS TotalVolunteers,
               COUNT(CASE WHEN sl.Status IN ('Success', 'Dispatched') THEN 1 END) AS SentSuccess,
               COUNT(CASE WHEN sl.Status = 'Fail' THEN 1 END) AS SentFail,
               COUNT(CASE WHEN sl.Id IS NULL THEN 1 END) AS NotSent
        FROM Shifts s
        LEFT JOIN SmsLog sl ON sl.ShiftId = s.Id
        WHERE s.ShiftDate >= :from
          AND s.IsCanceled = 0
          AND s.ShiftType = 'Operational'
        GROUP BY s.ShiftDate, s.ShiftName
        HAVING COUNT(sl.Id) > 0
        ORDER BY s.ShiftDate DESC, s.ShiftName
        """
    )
    suspend fun getSummary(from: String): List<SmsLogSummaryDto>

    @Insert
    suspend fun insert(log: SmsLogEntity): Long

    // 'Dispatched' counts as sent: the message was handed to the radio and is most likely
    // delivered — the alreadySentSms prompts must see it. [dup-sms plan 1.8]
    @Query("SELECT * FROM SmsLog WHERE ShiftId = :shiftId AND ReminderType = :reminderType AND Status IN ('Success', 'Dispatched') LIMIT 1")
    suspend fun getByShiftIdAndReminderType(shiftId: Int, reminderType: String): SmsLogEntity?

    // Scheduler dedup: ANY row — regardless of status — blocks automatic re-dispatch
    // (at-most-once doctrine; even Fail rows are only retried manually). [dup-sms plan 1.2]
    @Query("SELECT DISTINCT ShiftId FROM SmsLog WHERE ShiftId IN (:shiftIds) AND ReminderType = :reminderType")
    suspend fun getShiftIdsWithAnyRow(shiftIds: List<Int>, reminderType: String): List<Int>

    // Point re-check immediately before the write-ahead insert — status-filter-FREE on purpose
    // (do NOT reuse getByShiftIdAndReminderType: its status filter serves the alreadySentSms
    // prompt, not dedup). Returns 1/0. [dup-sms plan 1.3b]
    @Query("SELECT EXISTS(SELECT 1 FROM SmsLog WHERE ShiftId = :shiftId AND ReminderType = :reminderType)")
    suspend fun existsByShiftIdAndReminderType(shiftId: Int, reminderType: String): Int

    @Query("UPDATE SmsLog SET Status = :status, Error = :error WHERE Id = :id")
    suspend fun updateStatusById(id: Long, status: String, error: String?)

    @Query(
        """
        SELECT ShiftId AS shiftId, ReminderType AS reminderType, COUNT(*) AS cnt
        FROM SmsLog
        WHERE ReminderType IN ('SameDay', 'Advance', 'WeekdayAdvance', 'AdminAdvance')
          AND SentAt >= :since
          AND Status != 'Fail'
        GROUP BY ShiftId, ReminderType
        HAVING COUNT(*) > 1
        """
    )
    suspend fun findDuplicateDispatches(since: String): List<DuplicateSmsDto>

    @Query("DELETE FROM SmsLog WHERE ShiftId = :shiftId")
    suspend fun deleteByShiftId(shiftId: Int)
}
