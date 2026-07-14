package com.magav.app.db.dao

import androidx.room.ColumnInfo

data class SmsLogDetailDto(
    @ColumnInfo(name = "id")
    val id: Int,

    @ColumnInfo(name = "sentAt")
    val sentAt: String,

    @ColumnInfo(name = "status")
    val status: String,

    @ColumnInfo(name = "error")
    val error: String?,

    @ColumnInfo(name = "shiftDate")
    val shiftDate: String,

    @ColumnInfo(name = "shiftName")
    val shiftName: String,

    @ColumnInfo(name = "volunteerName")
    val volunteerName: String
)

data class SmsLogSummaryDto(
    @ColumnInfo(name = "shiftDate")
    val shiftDate: String,

    @ColumnInfo(name = "shiftName")
    val shiftName: String,

    @ColumnInfo(name = "TotalVolunteers")
    val totalVolunteers: Int,

    @ColumnInfo(name = "SentSuccess")
    val sentSuccess: Int,

    @ColumnInfo(name = "SentFail")
    val sentFail: Int,

    @ColumnInfo(name = "NotSent")
    val notSent: Int
)
