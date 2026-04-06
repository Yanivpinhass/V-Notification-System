package com.magav.app.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import com.magav.app.util.ReminderTypes
import com.magav.app.util.SmsStatuses

@Entity(
    tableName = "SmsLog",
    indices = [
        Index(value = ["ShiftId"]),
        Index(value = ["SentAt"])
    ],
    foreignKeys = [
        ForeignKey(
            entity = ShiftEntity::class,
            parentColumns = ["Id"],
            childColumns = ["ShiftId"],
            onDelete = ForeignKey.CASCADE
        )
    ]
)
data class SmsLogEntity(
    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "Id")
    val id: Int = 0,

    @ColumnInfo(name = "ShiftId")
    val shiftId: Int,

    @ColumnInfo(name = "SentAt")
    val sentAt: String,

    @ColumnInfo(name = "Status", defaultValue = SmsStatuses.SUCCESS)
    val status: String = SmsStatuses.SUCCESS,

    @ColumnInfo(name = "Error")
    val error: String? = null,

    @ColumnInfo(name = "ReminderType", defaultValue = ReminderTypes.SAME_DAY)
    val reminderType: String = ReminderTypes.SAME_DAY
)
