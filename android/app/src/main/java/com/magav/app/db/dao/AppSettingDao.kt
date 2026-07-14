package com.magav.app.db.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.magav.app.db.entity.AppSettingEntity

@Dao
interface AppSettingDao {

    @Query("SELECT * FROM AppSettings WHERE `Key` = :key")
    suspend fun getByKey(key: String): AppSettingEntity?

    @Upsert
    suspend fun upsert(setting: AppSettingEntity)

    @Query("SELECT * FROM AppSettings")
    suspend fun getAll(): List<AppSettingEntity>
}