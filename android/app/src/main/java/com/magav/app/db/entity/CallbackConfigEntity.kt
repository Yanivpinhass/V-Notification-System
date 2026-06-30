package com.magav.app.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Singleton config row (Id = 1) for the Android-only "auto-callback-to-gate" feature:
 * when an eligible incoming call rings unanswered for 20s, reject it and dial the Gate phone.
 *
 * DATA-LOSS NOTE (ADR-004): every @ColumnInfo(defaultValue=…) here MUST match the DEFAULT
 * clauses in MagavDatabase.MIGRATION_8_9 exactly, or Room's schema-hash validation fails on
 * upgrade. Do not change a default on one side only. Modelled on SchedulerConfigEntity.
 */
@Entity(tableName = "CallbackConfig")
data class CallbackConfigEntity(
    @PrimaryKey
    @ColumnInfo(name = "Id")
    val id: Int = 1, // fixed singleton (autoGenerate = false)

    @ColumnInfo(name = "IsActive", defaultValue = "0")
    val isActive: Int = 0,

    @ColumnInfo(name = "GatePhone", defaultValue = "")
    val gatePhone: String = "",

    @ColumnInfo(name = "FromHour", defaultValue = "08:00")
    val fromHour: String = "08:00",

    @ColumnInfo(name = "ToHour", defaultValue = "20:00")
    val toHour: String = "20:00",

    @ColumnInfo(name = "AllDay", defaultValue = "0")
    val allDay: Int = 0,

    // ON (1) = trigger for ANY incoming caller (skip the today/yesterday-volunteer filter).
    @ColumnInfo(name = "AllCallers", defaultValue = "0")
    val allCallers: Int = 0,

    @ColumnInfo(name = "UpdatedAt")
    val updatedAt: String? = null,

    @ColumnInfo(name = "UpdatedBy")
    val updatedBy: String? = null
)
