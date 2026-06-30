package com.magav.app.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import com.magav.app.db.entity.CallbackConfigEntity

@Dao
interface CallbackConfigDao {

    @Query("SELECT * FROM CallbackConfig WHERE Id = 1")
    suspend fun get(): CallbackConfigEntity?

    // Seed-only: keyed on PK (Id = 1) so it never clobbers an existing row / admin edits.
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertOrIgnore(config: CallbackConfigEntity): Long

    // Route write path (PUT): inserts the singleton if missing, otherwise updates it.
    @Upsert
    suspend fun upsert(config: CallbackConfigEntity)
}
