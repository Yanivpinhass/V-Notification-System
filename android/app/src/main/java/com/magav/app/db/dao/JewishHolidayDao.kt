package com.magav.app.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.magav.app.db.entity.JewishHolidayEntity

@Dao
interface JewishHolidayDao {

    @Query("SELECT * FROM JewishHolidays ORDER BY Date")
    suspend fun getAll(): List<JewishHolidayEntity>

    @Query("SELECT * FROM JewishHolidays WHERE Id = :id")
    suspend fun getById(id: Int): JewishHolidayEntity?

    @Query("SELECT * FROM JewishHolidays WHERE Date = :date LIMIT 1")
    suspend fun getByDate(date: String): JewishHolidayEntity?

    @Query("SELECT COUNT(*) FROM JewishHolidays WHERE Date = :date")
    suspend fun isHoliday(date: String): Int

    @Insert
    suspend fun insert(holiday: JewishHolidayEntity): Long

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertOrIgnore(holiday: JewishHolidayEntity): Long

    // Bulk overload: Room runs the whole list in a SINGLE transaction (one commit instead of one
    // per row). Used by the startup seed, which inserts ~160 rows on every launch.
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertOrIgnore(holidays: List<JewishHolidayEntity>)

    @Update
    suspend fun update(holiday: JewishHolidayEntity)

    @Query("DELETE FROM JewishHolidays WHERE Id = :id")
    suspend fun deleteById(id: Int)
}
