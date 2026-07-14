package com.magav.app.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "SchedulerConfig",
    indices = [
        Index(value = ["DayGroup", "ReminderType"], unique = true)
    ]
)
data class SchedulerConfigEntity(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "Id")
    val id: Int = 0,

    @ColumnInfo(name = "DayGroup")
    val dayGroup: String,

    @ColumnInfo(name = "ReminderType")
    val reminderType: String,

    @ColumnInfo(name = "Time")
    val time: String,

    @ColumnInfo(name = "DaysBeforeShift", defaultValue = "0")
    val daysBeforeShift: Int = 0,

    @ColumnInfo(name = "IsEnabled", defaultValue = "1")
    val isEnabled: Int = 1,

    @ColumnInfo(name = "MessageTemplateId", defaultValue = "1")
    val messageTemplateId: Int = 1,

    @ColumnInfo(name = "UpdatedAt")
    val updatedAt: String? = null,

    @ColumnInfo(name = "UpdatedBy")
    val updatedBy: String? = null
)
