package com.magav.app.api.routes

import com.magav.app.api.getUserName
import com.magav.app.api.models.ApiResponse
import com.magav.app.api.models.SchedulerConfigUpdateDto
import com.magav.app.api.requireRole
import com.magav.app.db.MagavDatabase
import com.magav.app.scheduler.AlarmScheduler
import com.magav.app.util.ReminderTypes
import android.content.Context
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import java.time.Instant

@Serializable
data class SchedulerConfigDto(
    val id: Int,
    val dayGroup: String,
    val reminderType: String,
    val time: String,
    val daysBeforeShift: Int,
    val isEnabled: Int,
    val messageTemplateId: Int,
    val updatedAt: String?,
    val updatedBy: String?
)

@Serializable
data class SchedulerRunLogDto(
    val id: Int,
    val configId: Int,
    val reminderType: String,
    val ranAt: String,
    val targetDate: String,
    val totalEligible: Int,
    val smsSent: Int,
    val smsFailed: Int,
    val status: String,
    val error: String?
)

private val TIME_REGEX = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")

fun Route.schedulerRoutes(database: MagavDatabase, context: Context) {
    authenticate("auth-bearer") {
        route("/api/scheduler") {

            // GET /api/scheduler/config - get all scheduler configs
            get("/config") {
                call.requireRole("Admin", "SystemManager")

                val configs = database.schedulerConfigDao().getAll()
                val response = configs.map { entity ->
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
                }

                call.respond(ApiResponse.ok(response))
            }

            // PUT /api/scheduler/config - update scheduler configs
            put("/config") {
                call.requireRole("Admin")

                val updates = call.receive<List<SchedulerConfigUpdateDto>>()
                val now = Instant.now().toString()
                val updatedBy = call.getUserName() ?: "unknown"

                // Fetch all configs once and reuse for both the id-set validation and the update
                // loop, instead of re-fetching each row by id below.
                val configsById = database.schedulerConfigDao().getAll().associateBy { it.id }
                val submittedIds = updates.map { it.id }.toSet()
                // Validate the submitted id-set EXACTLY matches the existing config id-set:
                // reject unknown ids, missing ids, and duplicate ids — without a hardcoded count
                // (so adding/removing a config row never silently breaks saving).
                if (updates.size != configsById.size || submittedIds != configsById.keys) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("רשימת ההגדרות אינה תואמת את ההגדרות הקיימות")
                    )
                    return@put
                }

                // Validate each entry
                for (update in updates) {
                    // Time format HH:mm
                    if (!TIME_REGEX.matches(update.time)) {
                        throw IllegalArgumentException("פורמט שעה לא תקין: ${update.time}. נדרש HH:mm")
                    }

                    // IsEnabled 0 or 1
                    if (update.isEnabled !in listOf(0, 1)) {
                        throw IllegalArgumentException("ערך isEnabled חייב להיות 0 או 1")
                    }

                    // DaysBeforeShift 0-7
                    if (update.daysBeforeShift !in 0..7) {
                        throw IllegalArgumentException("ימים לפני משמרת חייב להיות בין 0 ל-7")
                    }

                    // Validate MessageTemplateId exists
                    val template = database.messageTemplateDao().getById(update.messageTemplateId)
                    if (template == null) {
                        throw IllegalArgumentException("תבנית הודעה לא נמצאה")
                    }

                    // Cross-validate reminderType using the already-fetched config (the id-set
                    // check above guarantees the id is present).
                    val existingConfig = configsById.getValue(update.id)

                    // SameDay must have DaysBeforeShift=0
                    if (existingConfig.reminderType == ReminderTypes.SAME_DAY && update.daysBeforeShift != 0) {
                        throw IllegalArgumentException("תזכורת ביום המשמרת חייבת להיות עם 0 ימים לפני")
                    }

                    // Advance must have DaysBeforeShift>=1
                    if (existingConfig.reminderType == ReminderTypes.ADVANCE && update.daysBeforeShift < 1) {
                        throw IllegalArgumentException("תזכורת מקדימה חייבת להיות עם לפחות יום אחד לפני")
                    }

                    // WeekdayAdvance must have DaysBeforeShift>=1
                    if (existingConfig.reminderType == ReminderTypes.WEEKDAY_ADVANCE && update.daysBeforeShift < 1) {
                        throw IllegalArgumentException("תזכורת מוקדמת (ימי חול בלבד) חייבת להיות לפחות יום אחד לפני")
                    }
                }

                // Update each config
                for (update in updates) {
                    val existingConfig = configsById.getValue(update.id)
                    val updatedConfig = existingConfig.copy(
                        time = update.time,
                        daysBeforeShift = update.daysBeforeShift,
                        isEnabled = update.isEnabled,
                        messageTemplateId = update.messageTemplateId,
                        updatedAt = now,
                        updatedBy = updatedBy
                    )
                    database.schedulerConfigDao().update(updatedConfig)
                }

                // Re-schedule alarms with updated configs
                AlarmScheduler(context).scheduleAllAlarms()

                // Return updated configs
                val configs = database.schedulerConfigDao().getAll()
                val response = configs.map { entity ->
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
                }

                call.respond(ApiResponse.ok(response))
            }

            // GET /api/scheduler/run-log - recent 50 run logs
            get("/run-log") {
                call.requireRole("Admin", "SystemManager")

                val logs = database.schedulerRunLogDao().getRecent(50)
                val response = logs.map { entity ->
                    SchedulerRunLogDto(
                        id = entity.id,
                        configId = entity.configId,
                        reminderType = entity.reminderType,
                        ranAt = entity.ranAt,
                        targetDate = entity.targetDate,
                        totalEligible = entity.totalEligible,
                        smsSent = entity.smsSent,
                        smsFailed = entity.smsFailed,
                        status = entity.status,
                        error = entity.error
                    )
                }

                call.respond(ApiResponse.ok(response))
            }
        }
    }
}
