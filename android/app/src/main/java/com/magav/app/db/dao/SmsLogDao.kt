package com.magav.app.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.magav.app.db.entity.SmsLogEntity

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
        ORDER BY sl.SentAt DESC
        """
    )
    suspend fun getLogsWithDetails(from: String): List<SmsLogDetailDto>

    @Query(
        """
        SELECT s.ShiftDate AS shiftDate, s.ShiftName AS shiftName,
               COUNT(*) AS TotalVolunteers,
               COUNT(CASE WHEN sl.Status = 'Success' THEN 1 END) AS SentSuccess,
               COUNT(CASE WHEN sl.Status = 'Fail' THEN 1 END) AS SentFail,
               COUNT(CASE WHEN sl.Id IS NULL THEN 1 END) AS NotSent
        FROM Shifts s
        LEFT JOIN SmsLog sl ON sl.ShiftId = s.Id
        WHERE s.ShiftDate >= :from
        GROUP BY s.ShiftDate, s.ShiftName
        HAVING COUNT(sl.Id) > 0
        ORDER BY s.ShiftDate DESC, s.ShiftName
        """
    )
    suspend fun getSummary(from: String): List<SmsLogSummaryDto>

    @Insert
    suspend fun insert(log: SmsLogEntity): Long

    @Query("SELECT * FROM SmsLog WHERE ShiftId = :shiftId AND ReminderType = :reminderType AND Status = 'Success' LIMIT 1")
    suspend fun getByShiftIdAndReminderType(shiftId: Int, reminderType: String): SmsLogEntity?

    @Query("SELECT * FROM SmsLog WHERE ShiftId IN (:shiftIds) AND ReminderType = :reminderType AND Status = 'Success'")
    suspend fun getSuccessfulByShiftIdsAndReminderType(shiftIds: List<Int>, reminderType: String): List<SmsLogEntity>

    @Query("DELETE FROM SmsLog WHERE ShiftId = :shiftId")
    suspend fun deleteByShiftId(shiftId: Int)
}
