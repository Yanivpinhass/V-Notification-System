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
    val updatedAt: String? = null,

    // Location-type discriminator (Vehicle = מיקומי ניידות | General = מיקומים כללי).
    // Added additively in MIGRATION_10_11; existing rows backfill to 'Vehicle' via the DEFAULT.
    // NO index (the unique index_Locations_Name stays; name uniqueness is intentionally global).
    // Entity default/NOT-NULL MUST byte-match that migration (ADR-004).
    @ColumnInfo(name = "LocationType", defaultValue = "Vehicle")
    val locationType: String = "Vehicle"
)
