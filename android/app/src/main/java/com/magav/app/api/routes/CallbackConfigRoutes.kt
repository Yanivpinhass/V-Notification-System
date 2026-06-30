package com.magav.app.api.routes

import com.magav.app.api.getUserName
import com.magav.app.api.models.ApiResponse
import com.magav.app.api.requireRole
import com.magav.app.db.MagavDatabase
import com.magav.app.db.entity.CallbackConfigEntity
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import java.time.Instant

// Booleans on the wire (isActive/allDay/allCallers) <-> Int 0/1 in the entity, mirroring the
// SchedulerConfig DTO convention. Android-only feature → no .NET / React-web counterpart on the
// server side (the React page is gated to the Android WebView by window.NativeMedia presence).
@Serializable
data class CallbackConfigDto(
    val isActive: Boolean,
    val gatePhone: String,
    val fromHour: String,
    val toHour: String,
    val allDay: Boolean,
    val allCallers: Boolean,
    val updatedAt: String?,
    val updatedBy: String?
)

@Serializable
data class UpdateCallbackConfigDto(
    val isActive: Boolean,
    val gatePhone: String,
    val fromHour: String,
    val toHour: String,
    val allDay: Boolean,
    val allCallers: Boolean
)

// TIME_REGEX in SchedulerRoutes.kt is private to that file, so declare a local copy here.
private val TIME_REGEX = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")
// Permissive gate-phone check: accepts +972…/972…/0… (mirrors SettingsRoutes test-sms validation).
private val GATE_PHONE_REGEX = Regex("^[0-9+\\-]+$")

fun Route.callbackConfigRoutes(database: MagavDatabase) {
    authenticate("auth-bearer") {
        route("/api/callback-config") {

            // GET /api/callback-config - current singleton config (defaults if missing)
            get {
                call.requireRole("Admin", "SystemManager")

                val cfg = database.callbackConfigDao().get() ?: CallbackConfigEntity()
                call.respond(ApiResponse.ok(toDto(cfg)))
            }

            // PUT /api/callback-config - update the singleton config
            put {
                call.requireRole("Admin")

                val dto = call.receive<UpdateCallbackConfigDto>()

                // When active, a valid Gate phone is mandatory (the feature would otherwise have
                // nothing to dial). Accept +972…/972…/0… forms; CallbackLogic sanitizes at dial time.
                if (dto.isActive) {
                    val phone = dto.gatePhone.trim()
                    if (phone.length < 9 || !GATE_PHONE_REGEX.matches(phone)) {
                        call.respond(
                            HttpStatusCode.BadRequest,
                            ApiResponse.fail<Unit>("יש להזין מספר טלפון תקין לשער")
                        )
                        return@put
                    }
                }

                // When not All-day, both window bounds must be valid HH:mm (CallbackLogic parses them).
                if (!dto.allDay) {
                    if (!TIME_REGEX.matches(dto.fromHour) || !TIME_REGEX.matches(dto.toHour)) {
                        call.respond(
                            HttpStatusCode.BadRequest,
                            ApiResponse.fail<Unit>("פורמט שעה לא תקין. נדרש HH:mm")
                        )
                        return@put
                    }
                }

                // No NPE: start from the existing row or a fresh default (both carry Id = 1), so
                // upsert always targets the singleton.
                val existing = database.callbackConfigDao().get() ?: CallbackConfigEntity()
                database.callbackConfigDao().upsert(
                    existing.copy(
                        isActive = if (dto.isActive) 1 else 0,
                        gatePhone = dto.gatePhone.trim(),
                        fromHour = dto.fromHour,
                        toHour = dto.toHour,
                        allDay = if (dto.allDay) 1 else 0,
                        allCallers = if (dto.allCallers) 1 else 0,
                        updatedAt = Instant.now().toString(),
                        updatedBy = call.getUserName() ?: "unknown"
                    )
                )

                val saved = database.callbackConfigDao().get() ?: CallbackConfigEntity()
                call.respond(ApiResponse.ok(toDto(saved)))
            }
        }
    }
}

private fun toDto(entity: CallbackConfigEntity): CallbackConfigDto =
    CallbackConfigDto(
        isActive = entity.isActive == 1,
        gatePhone = entity.gatePhone,
        fromHour = entity.fromHour,
        toHour = entity.toHour,
        allDay = entity.allDay == 1,
        allCallers = entity.allCallers == 1,
        updatedAt = entity.updatedAt,
        updatedBy = entity.updatedBy
    )
