package com.magav.app.api.routes

import android.content.Context
import com.magav.app.api.models.ApiResponse
import com.magav.app.api.models.CreateShiftRequest
import com.magav.app.api.models.SendShiftSmsRequest
import com.magav.app.api.models.ShiftWithVolunteerDto
import com.magav.app.api.requireRole
import com.magav.app.db.MagavDatabase
import com.magav.app.db.entity.ShiftEntity
import com.magav.app.db.entity.SmsLogEntity
import com.magav.app.service.ShiftsImportService
import com.magav.app.service.SmsReminderService
import com.magav.app.sms.AndroidSmsProvider
import io.ktor.http.*
import io.ktor.http.content.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

fun Route.shiftRoutes(database: MagavDatabase, context: Context) {
    authenticate("auth-bearer") {
        route("/api/shifts") {

            // GET /api/shifts/by-date?date=YYYY-MM-DD
            get("/by-date") {
                call.requireRole("Admin", "SystemManager")

                val dateStr = call.request.queryParameters["date"]
                if (dateStr.isNullOrBlank()) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("פרמטר תאריך נדרש")
                    )
                    return@get
                }

                val date = try {
                    LocalDate.parse(dateStr)
                } catch (_: Exception) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("פורמט תאריך לא תקין")
                    )
                    return@get
                }

                val from = date.atStartOfDay(ZoneOffset.UTC)
                    .format(DateTimeFormatter.ISO_INSTANT)
                val to = date.plusDays(1).atStartOfDay(ZoneOffset.UTC)
                    .format(DateTimeFormatter.ISO_INSTANT)

                val shifts = database.shiftDao().getByDateRange(from, to)
                val volunteers = database.volunteerDao().getAll()
                val volunteerMap = volunteers.associateBy { it.id }

                val dtos = shifts.map { shift ->
                    val vol = volunteerMap[shift.volunteerId]
                    ShiftWithVolunteerDto(
                        id = shift.id,
                        shiftDate = shift.shiftDate,
                        shiftName = shift.shiftName,
                        carId = shift.carId,
                        volunteerId = shift.volunteerId,
                        volunteerName = vol?.mappingName ?: "מתנדב לא ידוע",
                        volunteerPhone = vol?.mobilePhone,
                        volunteerApproved = vol?.approveToReceiveSms == 1
                    )
                }

                call.respond(ApiResponse.ok(dtos))
            }

            // DELETE /api/shifts/{id}
            delete("/{id}") {
                call.requireRole("Admin", "SystemManager")

                val id = call.parameters["id"]?.toIntOrNull()
                if (id == null) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("מזהה לא תקין")
                    )
                    return@delete
                }

                val existing = database.shiftDao().getById(id)
                if (existing == null) {
                    call.respond(
                        HttpStatusCode.NotFound,
                        ApiResponse.fail<Unit>("שיבוץ לא נמצא")
                    )
                    return@delete
                }

                // Cascade: delete SMS logs first, then the shift
                database.smsLogDao().deleteByShiftId(id)
                database.shiftDao().deleteById(id)

                call.respond(ApiResponse.ok("השיבוץ נמחק בהצלחה"))
            }

            // POST /api/shifts/{id}/send-sms - send SMS to a shift volunteer
            post("/{id}/send-sms") {
                call.requireRole("Admin", "SystemManager")

                val id = call.parameters["id"]?.toIntOrNull()
                    ?: throw IllegalArgumentException("מזהה לא תקין")

                val shift = database.shiftDao().getById(id) ?: run {
                    call.respond(HttpStatusCode.NotFound, ApiResponse.fail<Unit>("שיבוץ לא נמצא"))
                    return@post
                }

                val volunteer = database.volunteerDao().getById(shift.volunteerId) ?: run {
                    call.respond(HttpStatusCode.NotFound, ApiResponse.fail<Unit>("מתנדב לא נמצא"))
                    return@post
                }

                if (volunteer.mobilePhone.isNullOrBlank()) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("למתנדב אין מספר טלפון"))
                    return@post
                }
                if (volunteer.approveToReceiveSms != 1) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("המתנדב לא אישר קבלת הודעות SMS"))
                    return@post
                }

                val request = call.receive<SendShiftSmsRequest>()

                val israelTz = ZoneId.of("Asia/Jerusalem")
                val shiftDate = Instant.parse(shift.shiftDate).atZone(israelTz).toLocalDate()
                val today = LocalDate.now(israelTz)

                val templateId = request.templateId ?: run {
                    if (shiftDate.isBefore(today)) {
                        call.respond(
                            HttpStatusCode.BadRequest,
                            ApiResponse.fail<Unit>("לא ניתן לשלוח תזכורת למשמרת שעברה")
                        )
                        return@post
                    }
                    if (shiftDate == today) 1 else 2
                }

                val template = database.messageTemplateDao().getById(templateId) ?: run {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("תבנית הודעה לא נמצאה"))
                    return@post
                }

                val message = SmsReminderService.buildMessage(
                    template.content, shift.shiftName, shift.carId, volunteer.mappingName, shiftDate
                )

                val smsProvider = AndroidSmsProvider(context)
                val result = smsProvider.sendSms(volunteer.mobilePhone, message)

                val reminderType = when (templateId) { 1 -> "SameDay"; 2 -> "Advance"; else -> "Manual" }
                database.smsLogDao().insert(
                    SmsLogEntity(
                        shiftId = shift.id,
                        sentAt = Instant.now().toString(),
                        status = if (result.success) "Success" else "Fail",
                        error = result.error,
                        reminderType = reminderType
                    )
                )

                if (result.success) {
                    database.shiftDao().update(shift.copy(smsSentAt = Instant.now().toString()))
                }

                if (!result.success) {
                    call.respond(
                        HttpStatusCode.InternalServerError,
                        ApiResponse.fail<Unit>(result.error ?: "שליחת SMS נכשלה")
                    )
                    return@post
                }

                call.respond(ApiResponse.ok("הודעת SMS נשלחה בהצלחה"))
            }

            // POST /api/shifts - create a new shift assignment
            post {
                call.requireRole("Admin", "SystemManager")

                val request = call.receive<CreateShiftRequest>()

                if (request.shiftName.isBlank()) {
                    throw IllegalArgumentException("שם משמרת נדרש")
                }

                // Verify volunteer exists
                val volunteer = database.volunteerDao().getById(request.volunteerId)
                if (volunteer == null) {
                    call.respond(
                        HttpStatusCode.NotFound,
                        ApiResponse.fail<Unit>("המתנדב לא נמצא")
                    )
                    return@post
                }

                // Convert date to ISO_INSTANT format (matching import format)
                val shiftDateIso = try {
                    LocalDate.parse(request.shiftDate)
                        .atStartOfDay(ZoneOffset.UTC)
                        .format(DateTimeFormatter.ISO_INSTANT)
                } catch (_: Exception) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("פורמט תאריך לא תקין")
                    )
                    return@post
                }

                // Check for duplicates
                val from = shiftDateIso
                val to = LocalDate.parse(request.shiftDate)
                    .plusDays(1).atStartOfDay(ZoneOffset.UTC)
                    .format(DateTimeFormatter.ISO_INSTANT)
                val existingShifts = database.shiftDao().getByDateRange(from, to)
                val isDuplicate = existingShifts.any {
                    it.shiftName == request.shiftName &&
                    it.carId == request.carId &&
                    it.volunteerId == request.volunteerId
                }
                if (isDuplicate) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("המתנדב כבר משובץ למשמרת זו")
                    )
                    return@post
                }

                val now = Instant.now().toString()
                val entity = ShiftEntity(
                    shiftDate = shiftDateIso,
                    shiftName = request.shiftName,
                    carId = request.carId,
                    volunteerId = request.volunteerId,
                    createdAt = now,
                    updatedAt = now
                )

                val newId = database.shiftDao().insert(entity)

                val dto = ShiftWithVolunteerDto(
                    id = newId.toInt(),
                    shiftDate = shiftDateIso,
                    shiftName = request.shiftName,
                    carId = request.carId,
                    volunteerId = request.volunteerId,
                    volunteerName = volunteer.mappingName,
                    volunteerPhone = volunteer.mobilePhone,
                    volunteerApproved = volunteer.approveToReceiveSms == 1
                )

                call.respond(HttpStatusCode.Created, ApiResponse.ok(dto))
            }

            // POST /api/shifts/import - file upload
            post("/import") {
                call.requireRole("Admin", "SystemManager")

                // CSRF header check
                val xRequestedWith = call.request.header("X-Requested-With")
                if (xRequestedWith != "XMLHttpRequest") {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("בקשה לא תקינה")
                    )
                    return@post
                }

                val multipart = call.receiveMultipart()
                var fileBytes: ByteArray? = null
                var fileName: String? = null

                multipart.forEachPart { part ->
                    when (part) {
                        is PartData.FileItem -> {
                            if (part.name == "file") {
                                fileName = part.originalFileName
                                fileBytes = part.streamProvider().use { it.readBytes() }
                            }
                        }
                        else -> {}
                    }
                    part.dispose()
                }

                if (fileBytes == null || fileName == null) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("קובץ לא נמצא")
                    )
                    return@post
                }

                val bytes = fileBytes!!
                val name = fileName!!

                // File size max 10MB
                if (bytes.size > 10 * 1024 * 1024) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("גודל הקובץ חורג מהמותר (10MB)")
                    )
                    return@post
                }

                // Extension validation
                val extension = name.substringAfterLast('.', "").lowercase()
                if (extension !in listOf("xlsx", "xls")) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("סוג קובץ לא נתמך. יש להעלות קובץ xlsx או xls")
                    )
                    return@post
                }

                // Magic bytes check
                if (bytes.size >= 2) {
                    val isZip = bytes[0] == 0x50.toByte() && bytes[1] == 0x4B.toByte()
                    val isOle = bytes[0] == 0xD0.toByte() && bytes[1] == 0xCF.toByte()
                    if (!isZip && !isOle) {
                        call.respond(
                            HttpStatusCode.BadRequest,
                            ApiResponse.fail<Unit>("תוכן הקובץ אינו תואם לפורמט Excel")
                        )
                        return@post
                    }
                } else {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("קובץ ריק או לא תקין")
                    )
                    return@post
                }

                val service = ShiftsImportService(database)
                val result = service.importFromExcel(bytes.inputStream())
                call.respond(ApiResponse.ok(result))
            }
        }
    }
}
