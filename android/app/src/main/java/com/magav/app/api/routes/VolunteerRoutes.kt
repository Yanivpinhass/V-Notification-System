package com.magav.app.api.routes

import com.magav.app.api.models.ApiResponse
import com.magav.app.api.models.CreateVolunteerRequest
import com.magav.app.api.models.UpdateVolunteerRequest
import com.magav.app.api.models.VolunteerDto
import com.magav.app.api.requireRole
import com.magav.app.db.MagavDatabase
import com.magav.app.db.entity.VolunteerEntity
import com.magav.app.service.VolunteersImportService
import io.ktor.http.*
import io.ktor.http.content.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.Instant

private fun sanitizePhone(phone: String?): String? {
    if (phone.isNullOrBlank()) return null
    val digits = phone.filter { it.isDigit() }
    if (digits.isEmpty()) return null
    return if (digits.startsWith("0")) digits else "0$digits"
}

private fun VolunteerEntity.toDto() = VolunteerDto(
    id = id,
    mappingName = mappingName,
    mobilePhone = mobilePhone,
    approveToReceiveSms = approveToReceiveSms == 1,
    createdAt = createdAt,
    updatedAt = updatedAt
)

fun Route.volunteerRoutes(database: MagavDatabase) {
    authenticate("auth-bearer") {
        route("/api/volunteers") {

            // GET /api/volunteers - list all volunteers
            get {
                call.requireRole("Admin", "SystemManager")
                val volunteers = database.volunteerDao().getAll()
                call.respond(ApiResponse.ok(volunteers.map { it.toDto() }))
            }

            // GET /api/volunteers/{id} - get volunteer by id
            get("/{id}") {
                call.requireRole("Admin", "SystemManager")
                val id = call.parameters["id"]?.toIntOrNull()
                if (id == null) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("מזהה לא תקין")
                    )
                    return@get
                }

                val volunteer = database.volunteerDao().getById(id)
                if (volunteer == null) {
                    call.respond(
                        HttpStatusCode.NotFound,
                        ApiResponse.fail<Unit>("מתנדב לא נמצא")
                    )
                    return@get
                }

                call.respond(ApiResponse.ok(volunteer.toDto()))
            }

            // POST /api/volunteers - create volunteer
            post {
                call.requireRole("Admin", "SystemManager")
                val request = call.receive<CreateVolunteerRequest>()
                val now = Instant.now().toString()

                if (request.mappingName.isBlank()) {
                    throw IllegalArgumentException("שם מיפוי נדרש")
                }

                // Check uniqueness by mappingName
                val existing = database.volunteerDao().getByMappingName(request.mappingName)
                if (existing != null) {
                    throw IllegalArgumentException("שם מיפוי כבר קיים")
                }

                val entity = VolunteerEntity(
                    mappingName = request.mappingName,
                    mobilePhone = sanitizePhone(request.mobilePhone),
                    approveToReceiveSms = if (request.approveToReceiveSms) 1 else 0,
                    createdAt = now,
                    updatedAt = now
                )

                val newId = database.volunteerDao().insert(entity)
                val created = database.volunteerDao().getById(newId.toInt())!!
                call.respond(HttpStatusCode.Created, ApiResponse.ok(created.toDto()))
            }

            // PUT /api/volunteers/{id} - update volunteer
            put("/{id}") {
                call.requireRole("Admin", "SystemManager")
                val id = call.parameters["id"]?.toIntOrNull()
                if (id == null) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("מזהה לא תקין")
                    )
                    return@put
                }

                val existing = database.volunteerDao().getById(id)
                if (existing == null) {
                    call.respond(
                        HttpStatusCode.NotFound,
                        ApiResponse.fail<Unit>("מתנדב לא נמצא")
                    )
                    return@put
                }

                val request = call.receive<UpdateVolunteerRequest>()
                val now = Instant.now().toString()

                if (request.mappingName.isBlank()) {
                    throw IllegalArgumentException("שם מיפוי נדרש")
                }

                // Check name uniqueness if changed
                if (request.mappingName != existing.mappingName) {
                    val duplicate = database.volunteerDao().getByMappingName(request.mappingName)
                    if (duplicate != null) {
                        throw IllegalArgumentException("שם מיפוי כבר קיים")
                    }
                }

                val updated = existing.copy(
                    mappingName = request.mappingName,
                    mobilePhone = sanitizePhone(request.mobilePhone),
                    approveToReceiveSms = if (request.approveToReceiveSms) 1 else 0,
                    updatedAt = now
                )

                database.volunteerDao().update(updated)
                call.respond(ApiResponse.ok(updated.toDto()))
            }

            // DELETE /api/volunteers/{id} - cascade delete
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

                val existing = database.volunteerDao().getById(id)
                if (existing == null) {
                    call.respond(
                        HttpStatusCode.NotFound,
                        ApiResponse.fail<Unit>("מתנדב לא נמצא")
                    )
                    return@delete
                }

                // Delete related SMS logs (via shift IDs)
                val shifts = database.shiftDao().getByVolunteerId(id)
                for (shift in shifts) {
                    database.smsLogDao().deleteByShiftId(shift.id)
                }

                // Delete related shifts
                database.shiftDao().deleteByVolunteerId(id)

                // Delete volunteer
                database.volunteerDao().delete(existing)
                call.respond(ApiResponse.ok("המתנדב נמחק בהצלחה"))
            }

            // POST /api/volunteers/import - file upload
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

                val service = VolunteersImportService(database)
                val result = service.importFromExcel(bytes.inputStream())
                call.respond(ApiResponse.ok(result))
            }
        }
    }
}
