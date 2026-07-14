package com.magav.app.db.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import com.magav.app.db.entity.VolunteerEntity

@Dao
interface VolunteerDao {

    @Query("SELECT * FROM Volunteers")
    suspend fun getAll(): List<VolunteerEntity>

    @Query("SELECT * FROM Volunteers WHERE Id = :id")
    suspend fun getById(id: Int): VolunteerEntity?

    @Query("SELECT * FROM Volunteers WHERE MappingName = :name")
    suspend fun getByMappingName(name: String): VolunteerEntity?

    @Query("SELECT * FROM Volunteers WHERE ApproveToReceiveSms = 1")
    suspend fun getSmsApproved(): List<VolunteerEntity>

    @Query("SELECT COUNT(*) FROM Volunteers")
    suspend fun count(): Int

    @Insert
    suspend fun insert(volunteer: VolunteerEntity): Long

    @Update
    suspend fun update(volunteer: VolunteerEntity)

    @Delete
    suspend fun delete(volunteer: VolunteerEntity)

    @Query("DELETE FROM Volunteers WHERE Id = :id")
    suspend fun deleteById(id: Int)
}
