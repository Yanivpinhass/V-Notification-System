package com.magav.app.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.magav.app.db.entity.SchedulerRunLogEntity

@Dao
interface SchedulerRunLogDao {

    @Query("SELECT * FROM SchedulerRunLog ORDER BY RanAt DESC LIMIT :count")
    suspend fun getRecent(count: Int): List<SchedulerRunLogEntity>

    @Query(
        """
        SELECT COUNT(*) > 0 FROM SchedulerRunLog
        WHERE ConfigId = :configId AND TargetDate = :targetDate AND ReminderType = :reminderType
        """
    )
    suspend fun existsForConfigAndDate(configId: Int, targetDate: String, reminderType: String): Boolean

    @Insert
    suspend fun insert(log: SchedulerRunLogEntity): Long

    @Query("DELETE FROM SchedulerRunLog WHERE TargetDate < :cutoff")
    suspend fun deleteOlderThan(cutoff: String): Int
}
