package com.magav.app.api.routes

import com.magav.app.api.models.JewishHolidayRequest
import com.magav.app.api.requireRole
import com.magav.app.db.MagavDatabase
import com.magav.app.db.entity.JewishHolidayEntity
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import com.magav.app.api.models.ApiResponse
import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.time.format.DateTimeParseException

@Serializable
data class JewishHolidayDto(
    val id: Int,
    val date: String,
    val name: String
)

private fun JewishHolidayEntity.toDto() = JewishHolidayDto(
    id = id,
    date = date,
    name = name
)

private fun validateHolidayRequest(request: JewishHolidayRequest) {
    if (request.name.isBlank()) throw IllegalArgumentException("שם חג נדרש")
    try { LocalDate.parse(request.date) }
    catch (_: DateTimeParseException) { throw IllegalArgumentException("תאריך לא תקין (yyyy-MM-dd)") }
}

fun Route.jewishHolidayRoutes(database: MagavDatabase) {
    authenticate("auth-bearer") {
        route("/api/jewish-holidays") {

            // GET /api/jewish-holidays - list all holidays sorted by date
            get {
                call.requireRole("Admin", "SystemManager")
                val holidays = database.jewishHolidayDao().getAll()
                call.respond(ApiResponse.ok(holidays.map { it.toDto() }))
            }

            // GET /api/jewish-holidays/{id}
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

                val holiday = database.jewishHolidayDao().getById(id)
                if (holiday == null) {
                    call.respond(
                        HttpStatusCode.NotFound,
                        ApiResponse.fail<Unit>("חג לא נמצא")
                    )
                    return@get
                }

                call.respond(ApiResponse.ok(holiday.toDto()))
            }

            // POST /api/jewish-holidays - create holiday
            post {
                call.requireRole("Admin", "SystemManager")
                val request = call.receive<JewishHolidayRequest>()
                validateHolidayRequest(request)

                // Check uniqueness by date
                val existing = database.jewishHolidayDao().getByDate(request.date)
                if (existing != null) {
                    throw IllegalArgumentException("תאריך זה כבר קיים")
                }

                val entity = JewishHolidayEntity(
                    date = request.date,
                    name = request.name.trim()
                )

                val newId = database.jewishHolidayDao().insert(entity)
                val created = database.jewishHolidayDao().getById(newId.toInt())!!
                call.respond(HttpStatusCode.Created, ApiResponse.ok(created.toDto()))
            }

            // PUT /api/jewish-holidays/{id} - update holiday
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

                val existing = database.jewishHolidayDao().getById(id)
                if (existing == null) {
                    call.respond(
                        HttpStatusCode.NotFound,
                        ApiResponse.fail<Unit>("חג לא נמצא")
                    )
                    return@put
                }

                val request = call.receive<JewishHolidayRequest>()
                validateHolidayRequest(request)

                // Check date uniqueness if changed (exclude self)
                if (request.date != existing.date) {
                    val duplicate = database.jewishHolidayDao().getByDate(request.date)
                    if (duplicate != null) {
                        throw IllegalArgumentException("תאריך זה כבר קיים")
                    }
                }

                val updated = existing.copy(
                    date = request.date,
                    name = request.name.trim()
                )

                database.jewishHolidayDao().update(updated)
                call.respond(ApiResponse.ok(updated.toDto()))
            }

            // DELETE /api/jewish-holidays/{id} - delete holiday
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

                val existing = database.jewishHolidayDao().getById(id)
                if (existing == null) {
                    call.respond(
                        HttpStatusCode.NotFound,
                        ApiResponse.fail<Unit>("חג לא נמצא")
                    )
                    return@delete
                }

                database.jewishHolidayDao().deleteById(id)
                call.respond(ApiResponse.ok("החג נמחק בהצלחה"))
            }
        }
    }
}
