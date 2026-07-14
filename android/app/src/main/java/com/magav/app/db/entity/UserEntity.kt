package com.magav.app.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "Users",
    indices = [Index(value = ["UserName"], unique = true)]
)
data class UserEntity(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "Id")
    val id: Int = 0,

    @ColumnInfo(name = "FullName")
    val fullName: String,

    @ColumnInfo(name = "UserName")
    val userName: String,

    @ColumnInfo(name = "PasswordHash")
    val passwordHash: String,

    @ColumnInfo(name = "IsActive", defaultValue = "1")
    val isActive: Int = 1,

    @ColumnInfo(name = "Role", defaultValue = "User")
    val role: String = "User",

    @ColumnInfo(name = "MustChangePassword", defaultValue = "0")
    val mustChangePassword: Int = 0,

    @ColumnInfo(name = "FailedLoginAttempts", defaultValue = "0")
    val failedLoginAttempts: Int = 0,

    @ColumnInfo(name = "LockoutUntil")
    val lockoutUntil: String? = null,

    @ColumnInfo(name = "RefreshTokenHash")
    val refreshTokenHash: String? = null,

    @ColumnInfo(name = "RefreshTokenExpiry")
    val refreshTokenExpiry: String? = null,

    @ColumnInfo(name = "LastConnected")
    val lastConnected: String? = null,

    @ColumnInfo(name = "CreatedAt")
    val createdAt: String,

    @ColumnInfo(name = "UpdatedAt")
    val updatedAt: String
)
