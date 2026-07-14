package com.magav.app.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import com.magav.app.db.entity.MessageTemplateEntity

@Dao
interface MessageTemplateDao {

    @Query("SELECT * FROM MessageTemplate ORDER BY Id")
    suspend fun getAll(): List<MessageTemplateEntity>

    @Query("SELECT * FROM MessageTemplate WHERE Id = :id")
    suspend fun getById(id: Int): MessageTemplateEntity?

    // Deterministic by-name lookup (administrative-shifts template resolution). Name is NOT unique —
    // ORDER BY Id LIMIT 1 picks the lowest (oldest) id, never random. Used to resolve admin template
    // ids BY NAME (never hardcoded), mirroring .NET DbInitializer.ResolveTemplateIdByNameAsync.
    @Query("SELECT * FROM MessageTemplate WHERE Name = :name ORDER BY Id LIMIT 1")
    suspend fun getByName(name: String): MessageTemplateEntity?

    @Insert
    suspend fun insert(template: MessageTemplateEntity): Long

    @Update
    suspend fun update(template: MessageTemplateEntity)

    @Query("DELETE FROM MessageTemplate WHERE Id = :id")
    suspend fun deleteById(id: Int)

    @Query("SELECT COUNT(*) FROM MessageTemplate")
    suspend fun count(): Int

    @Query("SELECT COUNT(*) FROM SchedulerConfig WHERE MessageTemplateId = :templateId")
    suspend fun getUsageCount(templateId: Int): Int
}
