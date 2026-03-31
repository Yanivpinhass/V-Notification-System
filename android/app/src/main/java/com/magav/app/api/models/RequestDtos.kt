package com.magav.app.api.models

import kotlinx.serialization.Serializable

// ── Auth ─────────────────────────────────────────────────────────────────────

@Serializable
data class LoginRequest(
    val username: String,
    val password: String
)

@Serializable
data class RefreshTokenRequest(
    val refreshToken: String
)

@Serializable
data class ChangePasswordRequest(
    val newPassword: String
)

// ── Login Response ───────────────────────────────────────────────────────────

@Serializable
data class LoginResponse(
    val accessToken: String,
    val refreshToken: String,
    val expiresAt: String,
    val user: UserInfo,
    val mustChangePassword: Boolean
)

@Serializable
data class UserInfo(
    val id: String,
    val name: String,
    val roles: List<String>,
    val permissions: Map<String, String> = emptyMap()
)

// ── Users ────────────────────────────────────────────────────────────────────

@Serializable
data class CreateUserRequest(
    val fullName: String,
    val userName: String,
    val password: String,
    val role: String,
    val isActive: Boolean = true,
    val mustChangePassword: Boolean = true
)

@Serializable
data class UpdateUserRequest(
    val fullName: String,
    val userName: String,
    val newPassword: String?,
    val role: String,
    val isActive: Boolean,
    val mustChangePassword: Boolean
)

@Serializable
data class UserDto(
    val id: Int,
    val fullName: String,
    val userName: String,
    val isActive: Boolean,
    val role: String,
    val mustChangePassword: Boolean,
    val lastConnected: String?,
    val createdAt: String,
    val updatedAt: String
)

// ── Volunteers ───────────────────────────────────────────────────────────────

@Serializable
data class CreateVolunteerRequest(
    val mappingName: String,
    val mobilePhone: String?,
    val approveToReceiveSms: Boolean
)

@Serializable
data class UpdateVolunteerRequest(
    val mappingName: String,
    val mobilePhone: String?,
    val approveToReceiveSms: Boolean
)

@Serializable
data class VolunteerDto(
    val id: Int,
    val mappingName: String,
    val mobilePhone: String?,
    val approveToReceiveSms: Boolean,
    val createdAt: String?,
    val updatedAt: String?
)

// ── Import Results ───────────────────────────────────────────────────────────

@Serializable
data class ImportResultDto(
    val totalRows: Int = 0,
    val inserted: Int = 0,
    val updated: Int = 0,
    val errors: Int = 0,
    val errorMessages: List<String> = emptyList(),
    val unresolvedVolunteers: Int = 0,
    val unresolvedVolunteerNames: List<String> = emptyList()
)

// ── Shifts ──────────────────────────────────────────────────────────────────

@Serializable
data class CreateShiftRequest(
    val shiftDate: String,
    val shiftName: String,
    val carId: String,
    val volunteerId: Int
)

@Serializable
data class UpdateShiftGroupRequest(
    val date: String,
    val oldShiftName: String,
    val oldCarId: String,
    val newShiftName: String,
    val newCarId: String
)

@Serializable
data class ShiftWithVolunteerDto(
    val id: Int,
    val shiftDate: String,
    val shiftName: String,
    val carId: String,
    val volunteerId: Int?,
    val volunteerName: String,
    val volunteerPhone: String?,
    val volunteerApproved: Boolean,
    val isUnresolved: Boolean = false
)

@Serializable
data class DateShiftInfo(
    val date: String,
    val hasUnresolved: Boolean
)

@Serializable
data class SendShiftSmsRequest(
    val templateId: Int? = null
)

// ── Scheduler ────────────────────────────────────────────────────────────────

@Serializable
data class SchedulerConfigUpdateDto(
    val id: Int,
    val time: String,
    val daysBeforeShift: Int,
    val isEnabled: Int,
    val messageTemplateId: Int
)

// ── Message Templates ───────────────────────────────────────────────────────

@Serializable
data class CreateMessageTemplateRequest(
    val name: String,
    val content: String
)

@Serializable
data class UpdateMessageTemplateRequest(
    val name: String,
    val content: String
)
