package com.magav.app.api.routes

import android.content.Context
import com.magav.app.api.getUserName
import com.magav.app.api.models.ApiResponse
import com.magav.app.api.requireRole
import com.magav.app.db.MagavDatabase
import com.magav.app.scheduler.AlarmScheduler
import com.magav.app.util.AppSettingsKeys
import com.magav.app.util.ReminderTypes
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import java.time.Instant

// Mirrors the .NET /api/admin-scheduler/config + /api/admin-settings/templates endpoints. GET = Admin/
// SystemManager; PUT = Admin only (matching the operational scheduler-config / template PUTs).

// Admin scheduler config PUT — only the editable fields. DayGroup/ReminderType/DaysBeforeShift are
// SERVER-OWNED/immutable (DaysBeforeShift stays pinned at 1) and are NOT accepted from the body.
@Serializable
data class AdminSchedulerConfigUpdateDto(val time: String, val isEnabled: Int, val messageTemplateId: Int)

@Serializable
data class AdminTemplatesDto(val assignmentTemplateId: Int?, val todayTemplateId: Int?)

@Serializable
data class AdminTemplatesUpdateDto(val assignmentTemplateId: Int, val todayTemplateId: Int)

private val ADMIN_TIME_REGEX = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")

fun Route.adminSchedulerRoutes(database: MagavDatabase, context: Context) {
    authenticate("auth-bearer") {

        route("/api/admin-scheduler") {

            // GET /api/admin-scheduler/config - the single AdminAdvance row
            get("/config") {
                call.requireRole("Admin", "SystemManager")

                val config = database.schedulerConfigDao().getByReminderType(ReminderTypes.ADMIN_ADVANCE)
                if (config == null) {
                    call.respond(HttpStatusCode.NotFound, ApiResponse.fail<Unit>("הגדרת תזמון מנהלית לא נמצאה"))
                    return@get
                }
                call.respond(ApiResponse.ok(toSchedulerDto(config)))
            }

            // PUT /api/admin-scheduler/config - update ONLY time/isEnabled/messageTemplateId
            put("/config") {
                call.requireRole("Admin")

                val existing = database.schedulerConfigDao().getByReminderType(ReminderTypes.ADMIN_ADVANCE)
                if (existing == null) {
                    call.respond(HttpStatusCode.NotFound, ApiResponse.fail<Unit>("הגדרת תזמון מנהלית לא נמצאה"))
                    return@put
                }

                val dto = call.receive<AdminSchedulerConfigUpdateDto>()
                if (!ADMIN_TIME_REGEX.matches(dto.time)) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("שעה לא תקינה (HH:mm)"))
                    return@put
                }
                if (dto.isEnabled !in listOf(0, 1)) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("ערך הפעלה לא תקין"))
                    return@put
                }
                if (database.messageTemplateDao().getById(dto.messageTemplateId) == null) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("תבנית הודעה לא נמצאה"))
                    return@put
                }

                // DayGroup/ReminderType/DaysBeforeShift are left exactly as stored (server-owned).
                val updated = existing.copy(
                    time = dto.time,
                    isEnabled = dto.isEnabled,
                    messageTemplateId = dto.messageTemplateId,
                    updatedAt = Instant.now().toString(),
                    updatedBy = call.getUserName() ?: "unknown"
                )
                database.schedulerConfigDao().update(updated)

                // Re-schedule alarms so enabling/disabling or re-timing the admin row takes effect
                // (parity with the operational scheduler PUTs).
                AlarmScheduler(context).scheduleAllAlarms()

                call.respond(ApiResponse.ok(toSchedulerDto(updated)))
            }
        }

        route("/api/admin-settings") {

            // GET /api/admin-settings/templates - assignment + today admin template-role ids
            get("/templates") {
                call.requireRole("Admin", "SystemManager")

                val assignment = database.appSettingDao().getByKey(AppSettingsKeys.ADMIN_ASSIGNMENT_TEMPLATE_ID)?.value?.toIntOrNull()
                val todayId = database.appSettingDao().getByKey(AppSettingsKeys.ADMIN_TODAY_TEMPLATE_ID)?.value?.toIntOrNull()
                call.respond(ApiResponse.ok(AdminTemplatesDto(assignment, todayId)))
            }

            // PUT /api/admin-settings/templates - set the assignment + today template-role ids
            put("/templates") {
                call.requireRole("Admin")

                val dto = call.receive<AdminTemplatesUpdateDto>()
                if (database.messageTemplateDao().getById(dto.assignmentTemplateId) == null ||
                    database.messageTemplateDao().getById(dto.todayTemplateId) == null) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("תבנית הודעה לא נמצאה"))
                    return@put
                }

                database.appSettingDao().upsert(
                    com.magav.app.db.entity.AppSettingEntity(
                        key = AppSettingsKeys.ADMIN_ASSIGNMENT_TEMPLATE_ID,
                        value = dto.assignmentTemplateId.toString()
                    )
                )
                database.appSettingDao().upsert(
                    com.magav.app.db.entity.AppSettingEntity(
                        key = AppSettingsKeys.ADMIN_TODAY_TEMPLATE_ID,
                        value = dto.todayTemplateId.toString()
                    )
                )

                call.respond(ApiResponse.ok("התבניות נשמרו בהצלחה"))
            }
        }
    }
}

// Reuses SchedulerConfigDto (declared in SchedulerRoutes.kt, same package) for the config response.
private fun toSchedulerDto(entity: com.magav.app.db.entity.SchedulerConfigEntity): SchedulerConfigDto =
    SchedulerConfigDto(
        id = entity.id,
        dayGroup = entity.dayGroup,
        reminderType = entity.reminderType,
        time = entity.time,
        daysBeforeShift = entity.daysBeforeShift,
        isEnabled = entity.isEnabled,
        messageTemplateId = entity.messageTemplateId,
        updatedAt = entity.updatedAt,
        updatedBy = entity.updatedBy
    )
