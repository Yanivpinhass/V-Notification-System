package com.magav.app.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import com.magav.app.db.entity.ShiftEntity

@Dao
interface ShiftDao {

    @Query("SELECT * FROM Shifts WHERE ShiftDate >= :from AND ShiftDate < :to AND IsCanceled = 0")
    suspend fun getByDateRange(from: String, to: String): List<ShiftEntity>

    @Query("SELECT DISTINCT ShiftDate FROM Shifts WHERE ShiftDate >= :from AND ShiftDate < :to AND IsCanceled = 0")
    suspend fun getDistinctDatesByRange(from: String, to: String): List<String>

    @Query("SELECT DISTINCT ShiftDate FROM Shifts WHERE VolunteerId IS NULL AND IsCanceled = 0 AND ShiftDate >= :from AND ShiftDate < :to")
    suspend fun getDistinctDatesWithUnresolved(from: String, to: String): List<String>

    @Query("SELECT * FROM Shifts WHERE VolunteerId = :volunteerId AND IsCanceled = 0")
    suspend fun getByVolunteerId(volunteerId: Int): List<ShiftEntity>

    @Query("DELETE FROM Shifts WHERE ShiftDate >= :from")
    suspend fun deleteByDateFrom(from: String)

    @Query("DELETE FROM Shifts WHERE ShiftDate >= :from AND ShiftDate <= :to")
    suspend fun deleteByDateRange(from: String, to: String)

    @Insert
    suspend fun insertAll(shifts: List<ShiftEntity>)

    @Insert
    suspend fun insert(shift: ShiftEntity): Long

    @Update
    suspend fun update(shift: ShiftEntity)

    @Query("DELETE FROM Shifts WHERE VolunteerId = :volunteerId")
    suspend fun deleteByVolunteerId(volunteerId: Int)

    @Query("SELECT * FROM Shifts WHERE Id = :id")
    suspend fun getById(id: Int): ShiftEntity?

    @Query("DELETE FROM Shifts WHERE Id = :id")
    suspend fun deleteById(id: Int)

    @Query("UPDATE Shifts SET ShiftName = :newShiftName, CarId = :newCarId, UpdatedAt = :updatedAt WHERE ShiftDate >= :from AND ShiftDate < :to AND ShiftName = :oldShiftName AND CarId = :oldCarId AND IsCanceled = 0")
    suspend fun updateShiftGroup(newShiftName: String, newCarId: String, updatedAt: String, from: String, to: String, oldShiftName: String, oldCarId: String)

    @Query("SELECT COUNT(*) FROM Shifts WHERE ShiftName = :shiftName AND CarId = :carId AND ShiftDate >= :from AND ShiftDate < :to AND IsCanceled = 0")
    suspend fun countShiftGroup(shiftName: String, carId: String, from: String, to: String): Int

    @Query("UPDATE Shifts SET LocationId = :locationId, CustomLocationName = :customName, CustomLocationNavigation = :customNav, UpdatedAt = :updatedAt WHERE ShiftDate >= :from AND ShiftDate < :to AND ShiftName = :shiftName AND CarId = :carId AND IsCanceled = 0")
    suspend fun updateShiftGroupLocation(locationId: Int?, customName: String?, customNav: String?, updatedAt: String, from: String, to: String, shiftName: String, carId: String)

    @Query("DELETE FROM Shifts WHERE ShiftDate < :cutoff")
    suspend fun deleteOlderThan(cutoff: String): Int

    @Query("SELECT * FROM Shifts WHERE IsCanceled = 1 AND ShiftDate >= :from AND ShiftDate < :to ORDER BY ShiftDate, ShiftName, VolunteerName")
    suspend fun getCanceledByDateRange(from: String, to: String): List<ShiftEntity>

    @Query("UPDATE Shifts SET IsCanceled = 1, CanceledAt = :canceledAt, UpdatedAt = :updatedAt WHERE Id = :id")
    suspend fun cancelById(id: Int, canceledAt: String, updatedAt: String): Int

    @Query("UPDATE Shifts SET IsCanceled = 1, CanceledAt = :canceledAt, UpdatedAt = :updatedAt WHERE ShiftDate >= :from AND ShiftDate < :to AND ShiftName = :shiftName AND CarId = :carId AND IsCanceled = 0")
    suspend fun cancelShiftGroup(canceledAt: String, updatedAt: String, from: String, to: String, shiftName: String, carId: String): Int
}
