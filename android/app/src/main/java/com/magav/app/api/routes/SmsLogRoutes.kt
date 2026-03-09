package com.magav.app.api.routes

import com.magav.app.api.models.ApiResponse
import com.magav.app.api.requireRole
import com.magav.app.db.MagavDatabase
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.temporal.ChronoUnit

@Serializable
data class SmsLogDetailResponse(
    val id: Int,
    val sentAt: String,
    val status: String,
    val error: String?,
    val shiftDate: String,
    val shiftName: String,
    val volunteerName: String
)

@Serializable
data class SmsLogSummaryResponse(
    val shiftDate: String,
    val shiftName: String,
    val totalVolunteers: Int,
    val sentSuccess: Int,
    val sentFail: Int,
    val notSent: Int
)

fun Route.smsLogRoutes(database: MagavDatabase) {
    authenticate("auth-bearer") {
        route("/api/sms-log") {

            // GET /api/sms-log - query logs with details
            get {
                call.requireRole("Admin", "SystemManager")

                val days = call.request.queryParameters["days"]?.toIntOrNull()?.coerceIn(1, 90) ?: 90
                val fromDate = Instant.now().minus(days.toLong(), ChronoUnit.DAYS).toString()

                val logs = database.smsLogDao().getLogsWithDetails(fromDate)
                val response = logs.map { dto ->
                    SmsLogDetailResponse(
                        id = dto.id,
                        sentAt = dto.sentAt,
                        status = dto.status,
                        error = dto.error,
                        shiftDate = dto.shiftDate,
                        shiftName = dto.shiftName,
                        volunteerName = dto.volunteerName
                    )
                }

                call.respond(ApiResponse.ok(response))
            }

            // GET /api/sms-log/summary - query summary
            get("/summary") {
                call.requireRole("Admin", "SystemManager")

                val days = call.request.queryParameters["days"]?.toIntOrNull()?.coerceIn(1, 90) ?: 90
                val fromDate = Instant.now().minus(days.toLong(), ChronoUnit.DAYS).toString()

                val summaries = database.smsLogDao().getSummary(fromDate)
                val response = summaries.map { dto ->
                    SmsLogSummaryResponse(
                        shiftDate = dto.shiftDate,
                        shiftName = dto.shiftName,
                        totalVolunteers = dto.totalVolunteers,
                        sentSuccess = dto.sentSuccess,
                        sentFail = dto.sentFail,
                        notSent = dto.notSent
                    )
                }

                call.respond(ApiResponse.ok(response))
            }
        }
    }
}
