/*
 * INTENTIONAL DIVERGENCE from the .NET `Volunteer` model — do NOT "fix" by adding columns. [ISS-003 / ADR-016]
 *
 * This entity deliberately OMITS the four .NET-only columns `InternalIdHash`, `FirstName`, `LastName`,
 * and `RoleId`, and keys volunteers on the unique `MappingName` instead. The hashed-internal-id
 * SMS-approval flow is .NET + React only; Android has no public approval flow and never reads those columns.
 *
 * Adding ANY field here is a Room @Entity change: it REQUIRES a @Database version bump + a migration
 * registered in BOTH addMigrations(...) sites (MagavApplication.kt / ADR-004), or it can silently wipe
 * all user data. Don't add columns for parity alone — see ADR-016 and tools/parity.md.
 */
package com.magav.app.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "Volunteers",
    indices = [Index(value = ["MappingName"], unique = true)]
)
data class VolunteerEntity(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "Id")
    val id: Int = 0,

    @ColumnInfo(name = "MappingName")
    val mappingName: String,

    @ColumnInfo(name = "MobilePhone")
    val mobilePhone: String? = null,

    @ColumnInfo(name = "ApproveToReceiveSms", defaultValue = "0")
    val approveToReceiveSms: Int = 0,

    @ColumnInfo(name = "CreatedAt")
    val createdAt: String? = null,

    @ColumnInfo(name = "UpdatedAt")
    val updatedAt: String? = null
)
