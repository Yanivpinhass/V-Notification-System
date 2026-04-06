package com.magav.app.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "Locations",
    indices = [Index(value = ["Name"], unique = true)]
)
data class LocationEntity(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "Id")
    val id: Int = 0,

    @ColumnInfo(name = "Name")
    val name: String,

    @ColumnInfo(name = "Address")
    val address: String? = null,

    @ColumnInfo(name = "City")
    val city: String? = null,

    @ColumnInfo(name = "Navigation")
    val navigation: String? = null,

    @ColumnInfo(name = "CreatedAt")
    val createdAt: String? = null,

    @ColumnInfo(name = "UpdatedAt")
    val updatedAt: String? = null
)
