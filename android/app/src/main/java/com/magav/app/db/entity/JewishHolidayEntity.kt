package com.magav.app.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "JewishHolidays",
    indices = [Index(value = ["Date"], unique = true)]
)
data class JewishHolidayEntity(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "Id")
    val id: Int = 0,

    @ColumnInfo(name = "Date")
    val date: String,

    @ColumnInfo(name = "Name")
    val name: String
)
