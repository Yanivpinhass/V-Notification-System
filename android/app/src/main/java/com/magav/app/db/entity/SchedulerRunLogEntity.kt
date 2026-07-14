package com.magav.app.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "SchedulerRunLog",
    indices = [
        Index(value = ["ConfigId"]),
        Index(value = ["RanAt"]),
        Index(value = ["ConfigId", "TargetDate", "ReminderType"], unique = true)
    ],
    foreignKeys = [
        ForeignKey(
            entity = SchedulerConfigEntity::class,
            parentColumns = ["Id"],
            childColumns = ["ConfigId"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class SchedulerRunLogEntity(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "Id")
    val id: Int = 0,

    @ColumnInfo(name = "ConfigId")
    val configId: Int,

    @ColumnInfo(name = "ReminderType")
    val reminderType: String,

    @ColumnInfo(name = "RanAt")
    val ranAt: String,

    @ColumnInfo(name = "TargetDate")
    val targetDate: String,

    @ColumnInfo(name = "TotalEligible", defaultValue = "0")
    val totalEligible: Int = 0,

    @ColumnInfo(name = "SmsSent", defaultValue = "0")
    val smsSent: Int = 0,

    @ColumnInfo(name = "SmsFailed", defaultValue = "0")
    val smsFailed: Int = 0,

    @ColumnInfo(name = "Status", defaultValue = "Pending")
    val status: String = "Pending",

    @ColumnInfo(name = "Error")
    val error: String? = null
)
