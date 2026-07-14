package com.magav.app.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "Shifts",
    indices = [
        Index(value = ["ShiftDate"]),
        Index(value = ["VolunteerId"]),
        Index(value = ["IsCanceled"])
    ],
    foreignKeys = [
        ForeignKey(
            entity = VolunteerEntity::class,
            parentColumns = ["Id"],
            childColumns = ["VolunteerId"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class ShiftEntity(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "Id")
    val id: Int = 0,

    @ColumnInfo(name = "ShiftDate")
    val shiftDate: String,

    @ColumnInfo(name = "ShiftName")
    val shiftName: String,

    @ColumnInfo(name = "CarId", defaultValue = "")
    val carId: String = "",

    @ColumnInfo(name = "VolunteerId")
    val volunteerId: Int? = null,

    @ColumnInfo(name = "VolunteerName")
    val volunteerName: String? = null,

    @ColumnInfo(name = "SmsSentAt")
    val smsSentAt: String? = null,

    @ColumnInfo(name = "LocationId")
    val locationId: Int? = null,

    @ColumnInfo(name = "CustomLocationName")
    val customLocationName: String? = null,

    @ColumnInfo(name = "CustomLocationNavigation")
    val customLocationNavigation: String? = null,

    @ColumnInfo(name = "IsCanceled", defaultValue = "0")
    val isCanceled: Int = 0,

    @ColumnInfo(name = "CanceledAt")
    val canceledAt: String? = null,

    @ColumnInfo(name = "CreatedAt")
    val createdAt: String? = null,

    @ColumnInfo(name = "UpdatedAt")
    val updatedAt: String? = null,

    // Administrative-shifts feature (two shift types: Operational | Administrative).
    // ShiftType discriminates; the 4 nullable columns carry admin-only fields and stay
    // NULL for operational rows. NO Index on ShiftType (low volume; avoids the Room
    // index-name pitfall on the migration — ADR-004). Added additively in MIGRATION_9_10;
    // the entity defaults/NOT-NULL flags MUST byte-match that migration.
    @ColumnInfo(name = "ShiftType", defaultValue = "Operational")
    val shiftType: String = "Operational",

    @ColumnInfo(name = "Description")
    val description: String? = null,

    @ColumnInfo(name = "ShiftTime")
    val shiftTime: String? = null,

    @ColumnInfo(name = "Address")
    val address: String? = null,

    @ColumnInfo(name = "VehicleLocation")
    val vehicleLocation: String? = null,

    // v2: reference to a picked Vehicle-type Location (מיקום רכב picker). Plain nullable Int,
    // NO @ForeignKey / NO index — mirrors the LocationId convention (an FK would change the
    // CREATE TABLE shape → table rebuild → ADR-004). Free-text vehicle location still lives in
    // VehicleLocation above; when both are set the server nulls the text (id wins). MIGRATION_10_11.
    @ColumnInfo(name = "VehicleLocationId")
    val vehicleLocationId: Int? = null
)
