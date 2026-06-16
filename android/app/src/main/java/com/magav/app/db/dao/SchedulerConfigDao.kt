package com.magav.app.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.magav.app.db.entity.SchedulerConfigEntity

@Dao
interface SchedulerConfigDao {

    @Query("SELECT * FROM SchedulerConfig")
    suspend fun getAll(): List<SchedulerConfigEntity>

    @Query("SELECT * FROM SchedulerConfig WHERE Id = :id")
    suspend fun getById(id: Int): SchedulerConfigEntity?

    @Query("SELECT * FROM SchedulerConfig WHERE IsEnabled = 1")
    suspend fun getEnabled(): List<SchedulerConfigEntity>

    @Insert
    suspend fun insert(config: SchedulerConfigEntity): Long

    // Idempotent insert keyed on UNIQUE(DayGroup, ReminderType): skips the row if it already
    // exists, so it never overwrites admin edits. DAO method only — NOT a schema change.
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertOrIgnore(config: SchedulerConfigEntity): Long

    @Update
    suspend fun update(config: SchedulerConfigEntity)
}
