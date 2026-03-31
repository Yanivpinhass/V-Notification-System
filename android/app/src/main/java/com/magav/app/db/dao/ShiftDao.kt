package com.magav.app.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import com.magav.app.db.entity.ShiftEntity

@Dao
interface ShiftDao {

    @Query("SELECT * FROM Shifts WHERE ShiftDate >= :from AND ShiftDate < :to")
    suspend fun getByDateRange(from: String, to: String): List<ShiftEntity>

    @Query("SELECT DISTINCT ShiftDate FROM Shifts WHERE ShiftDate >= :from AND ShiftDate < :to")
    suspend fun getDistinctDatesByRange(from: String, to: String): List<String>

    @Query("SELECT DISTINCT ShiftDate FROM Shifts WHERE VolunteerId IS NULL AND ShiftDate >= :from AND ShiftDate < :to")
    suspend fun getDistinctDatesWithUnresolved(from: String, to: String): List<String>

    @Query("SELECT * FROM Shifts WHERE VolunteerId = :volunteerId")
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

    @Query("UPDATE Shifts SET ShiftName = :newShiftName, CarId = :newCarId, UpdatedAt = :updatedAt WHERE ShiftDate >= :from AND ShiftDate < :to AND ShiftName = :oldShiftName AND CarId = :oldCarId")
    suspend fun updateShiftGroup(newShiftName: String, newCarId: String, updatedAt: String, from: String, to: String, oldShiftName: String, oldCarId: String)

    @Query("SELECT COUNT(*) FROM Shifts WHERE ShiftName = :shiftName AND CarId = :carId AND ShiftDate >= :from AND ShiftDate < :to")
    suspend fun countShiftGroup(shiftName: String, carId: String, from: String, to: String): Int
}
