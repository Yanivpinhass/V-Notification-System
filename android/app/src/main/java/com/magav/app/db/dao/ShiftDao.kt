package com.magav.app.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import com.magav.app.db.entity.ShiftEntity

@Dao
interface ShiftDao {

    // TYPE-AGNOSTIC by design (ADR-021 / D12). The SOLE remaining caller is auto-callback eligibility
    // (CallbackLogic.isEligible) — a volunteer on an administrative shift today is still a legitimate
    // caller. Do NOT delete this method and do NOT add a ShiftType predicate. The scheduler + all
    // operational Ktor routes use getByDateRangeAndType instead.
    @Query("SELECT * FROM Shifts WHERE ShiftDate >= :from AND ShiftDate < :to AND IsCanceled = 0")
    suspend fun getByDateRange(from: String, to: String): List<ShiftEntity>

    // Typed variant — the scheduler passes the config-resolved type (Administrative for AdminAdvance,
    // else Operational); operational Ktor routes pass "Operational". Mirrors the .NET eligibility filter.
    @Query("SELECT * FROM Shifts WHERE ShiftDate >= :from AND ShiftDate < :to AND ShiftType = :shiftType AND IsCanceled = 0")
    suspend fun getByDateRangeAndType(from: String, to: String, shiftType: String): List<ShiftEntity>

    @Query("SELECT DISTINCT ShiftDate FROM Shifts WHERE ShiftDate >= :from AND ShiftDate < :to AND ShiftType = 'Operational' AND IsCanceled = 0")
    suspend fun getDistinctDatesByRange(from: String, to: String): List<String>

    @Query("SELECT DISTINCT ShiftDate FROM Shifts WHERE VolunteerId IS NULL AND IsCanceled = 0 AND ShiftType = 'Operational' AND ShiftDate >= :from AND ShiftDate < :to")
    suspend fun getDistinctDatesWithUnresolved(from: String, to: String): List<String>

    // F1: TYPE-AGNOSTIC by design — the volunteer-delete cascade must cover admin shifts too.
    @Query("SELECT * FROM Shifts WHERE VolunteerId = :volunteerId AND IsCanceled = 0")
    suspend fun getByVolunteerId(volunteerId: Int): List<ShiftEntity>

    // Defensive Operational filter (this method has NO current caller; harmless future-proofing so a
    // future importer can't hard-delete admin rows through it). Mirrors deleteByDateRange.
    @Query("DELETE FROM Shifts WHERE ShiftDate >= :from AND ShiftType = 'Operational'")
    suspend fun deleteByDateFrom(from: String)

    // P0 DATA-LOSS GUARD: the Excel import hard-deletes a date range then re-inserts from the sheet.
    // WITHOUT the Operational predicate it would destroy administrative shifts in that range.
    @Query("DELETE FROM Shifts WHERE ShiftDate >= :from AND ShiftDate <= :to AND ShiftType = 'Operational'")
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

    // Operational group ops key on (ShiftName, CarId) + [from,to) — an admin group whose
    // ShiftName=Description could otherwise collide, so EACH gets an Operational predicate.
    @Query("UPDATE Shifts SET ShiftName = :newShiftName, CarId = :newCarId, UpdatedAt = :updatedAt WHERE ShiftDate >= :from AND ShiftDate < :to AND ShiftName = :oldShiftName AND CarId = :oldCarId AND ShiftType = 'Operational' AND IsCanceled = 0")
    suspend fun updateShiftGroup(newShiftName: String, newCarId: String, updatedAt: String, from: String, to: String, oldShiftName: String, oldCarId: String)

    @Query("SELECT COUNT(*) FROM Shifts WHERE ShiftName = :shiftName AND CarId = :carId AND ShiftDate >= :from AND ShiftDate < :to AND ShiftType = 'Operational' AND IsCanceled = 0")
    suspend fun countShiftGroup(shiftName: String, carId: String, from: String, to: String): Int

    @Query("UPDATE Shifts SET LocationId = :locationId, CustomLocationName = :customName, CustomLocationNavigation = :customNav, UpdatedAt = :updatedAt WHERE ShiftDate >= :from AND ShiftDate < :to AND ShiftName = :shiftName AND CarId = :carId AND ShiftType = 'Operational' AND IsCanceled = 0")
    suspend fun updateShiftGroupLocation(locationId: Int?, customName: String?, customNav: String?, updatedAt: String, from: String, to: String, shiftName: String, carId: String)

    // D11: TYPE-AGNOSTIC by design — admin shifts age out after a month exactly like operational
    // (matches .NET ShiftCleanupService). Do NOT add a ShiftType predicate here.
    @Query("DELETE FROM Shifts WHERE ShiftDate < :cutoff")
    suspend fun deleteOlderThan(cutoff: String): Int

    @Query("SELECT * FROM Shifts WHERE IsCanceled = 1 AND ShiftDate >= :from AND ShiftDate < :to AND ShiftType = 'Operational' ORDER BY ShiftDate, ShiftName, VolunteerName")
    suspend fun getCanceledByDateRange(from: String, to: String): List<ShiftEntity>

    // by-id cancel/delete stay TYPE-AGNOSTIC (a shift id is exactly one type; admin per-row cancel/
    // delete routes here). Do NOT add a ShiftType predicate — it would silently no-op admin rows.
    @Query("UPDATE Shifts SET IsCanceled = 1, CanceledAt = :canceledAt, UpdatedAt = :updatedAt WHERE Id = :id")
    suspend fun cancelById(id: Int, canceledAt: String, updatedAt: String): Int

    // Twin of the .NET raw inline cancel-group UPDATE — the Operational predicate MUST match it exactly.
    @Query("UPDATE Shifts SET IsCanceled = 1, CanceledAt = :canceledAt, UpdatedAt = :updatedAt WHERE ShiftDate >= :from AND ShiftDate < :to AND ShiftName = :shiftName AND CarId = :carId AND ShiftType = 'Operational' AND IsCanceled = 0")
    suspend fun cancelShiftGroup(canceledAt: String, updatedAt: String, from: String, to: String, shiftName: String, carId: String): Int

    // === Administrative group ops (mirror .NET ShiftsRepository.UpdateAdminGroupAsync / CancelAdminGroupAsync) ===
    // All scoped to ShiftType='Administrative', keyed on (date range, ShiftTime, Description). ShiftName is
    // kept == Description (both set to :newDescription) so the NOT-NULL ShiftName constraint stays satisfied.

    @Query("UPDATE Shifts SET Description = :newDescription, ShiftName = :newDescription, ShiftTime = :newShiftTime, Address = :address, LocationId = :locationId, CustomLocationName = :customName, CustomLocationNavigation = :customNav, CarId = :carId, VehicleLocation = :vehicleLocation, VehicleLocationId = :vehicleLocationId, UpdatedAt = :updatedAt WHERE ShiftType = 'Administrative' AND IsCanceled = 0 AND ShiftDate >= :from AND ShiftDate < :to AND ShiftTime = :oldShiftTime AND Description = :oldDescription")
    suspend fun updateAdminGroup(newDescription: String, newShiftTime: String, address: String?, locationId: Int?, customName: String?, customNav: String?, carId: String, vehicleLocation: String?, vehicleLocationId: Int?, updatedAt: String, from: String, to: String, oldShiftTime: String, oldDescription: String): Int

    @Query("UPDATE Shifts SET IsCanceled = 1, CanceledAt = :canceledAt, UpdatedAt = :updatedAt WHERE ShiftType = 'Administrative' AND IsCanceled = 0 AND ShiftDate >= :from AND ShiftDate < :to AND ShiftTime = :shiftTime AND Description = :description")
    suspend fun cancelAdminGroup(canceledAt: String, updatedAt: String, from: String, to: String, shiftTime: String, description: String): Int

    // Active volunteer-ids already in a (date range, ShiftTime, Description) admin group. Used by the
    // create dup-volunteer guard so the add-volunteers-in-edit re-POST is idempotent. Mirrors .NET
    // ShiftsRepository.GetAdminGroupVolunteerIdsAsync.
    @Query("SELECT VolunteerId FROM Shifts WHERE ShiftType = 'Administrative' AND IsCanceled = 0 AND VolunteerId IS NOT NULL AND ShiftDate >= :from AND ShiftDate < :to AND ShiftTime = :shiftTime AND Description = :description")
    suspend fun getAdminGroupVolunteerIds(from: String, to: String, shiftTime: String, description: String): List<Int>
}
