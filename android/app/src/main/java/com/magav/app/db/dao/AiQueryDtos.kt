package com.magav.app.db.dao

import androidx.room.ColumnInfo

/**
 * DTO for the getShiftsWithVolunteers() JOIN query used by AI data loading.
 * Named AiShiftVolunteerDto to avoid clash with existing
 * com.magav.app.api.models.ShiftWithVolunteerDto in RequestDtos.kt.
 */
data class AiShiftVolunteerDto(
    @ColumnInfo(name = "shiftId")
    val shiftId: Int,

    @ColumnInfo(name = "shiftDate")
    val shiftDate: String,

    @ColumnInfo(name = "shiftName")
    val shiftName: String,

    @ColumnInfo(name = "carId")
    val carId: String,

    @ColumnInfo(name = "volunteerName")
    val volunteerName: String,

    @ColumnInfo(name = "volunteerPhone")
    val volunteerPhone: String?,

    @ColumnInfo(name = "smsApproved")
    val smsApproved: Int
)
