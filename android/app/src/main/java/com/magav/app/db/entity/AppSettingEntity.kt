package com.magav.app.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "AppSettings")
data class AppSettingEntity(
    @PrimaryKey
    @ColumnInfo(name = "Key")
    val key: String,

    @ColumnInfo(name = "Value")
    val value: String
)