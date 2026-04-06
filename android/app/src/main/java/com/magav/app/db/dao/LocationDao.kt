package com.magav.app.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import com.magav.app.db.entity.LocationEntity

@Dao
interface LocationDao {
    @Query("SELECT * FROM Locations ORDER BY Name")
    suspend fun getAll(): List<LocationEntity>

    @Query("SELECT * FROM Locations WHERE Id = :id")
    suspend fun getById(id: Int): LocationEntity?

    @Query("SELECT * FROM Locations WHERE Name = :name LIMIT 1")
    suspend fun getByName(name: String): LocationEntity?

    @Insert
    suspend fun insert(location: LocationEntity): Long

    @Update
    suspend fun update(location: LocationEntity)

    @Query("DELETE FROM Locations WHERE Id = :id")
    suspend fun deleteById(id: Int)

    @Query("SELECT COUNT(*) FROM Shifts WHERE LocationId = :locationId AND ShiftDate >= :today")
    suspend fun countFutureShiftsByLocationId(locationId: Int, today: String): Int
}
