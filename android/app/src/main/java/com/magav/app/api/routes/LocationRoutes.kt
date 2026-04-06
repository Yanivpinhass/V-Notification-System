package com.magav.app.api.routes

import com.magav.app.api.models.ApiResponse
import com.magav.app.api.models.LocationRequest
import com.magav.app.api.requireRole
import com.magav.app.db.MagavDatabase
import com.magav.app.db.entity.LocationEntity
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import com.magav.app.util.toIsoInstant

@Serializable
data class LocationDto(
    val id: Int,
    val name: String,
    val address: String?,
    val city: String?,
    val navigation: String?,
    val createdAt: String?,
    val updatedAt: String?
)

private fun LocationEntity.toDto() = LocationDto(
    id = id,
    name = name,
    address = address,
    city = city,
    navigation = navigation,
    createdAt = createdAt,
    updatedAt = updatedAt
)

fun Route.locationRoutes(database: MagavDatabase) {
    authenticate("auth-bearer") {
        route("/api/locations") {

            // GET /api/locations - list all locations
            get {
                call.requireRole("Admin", "SystemManager")
                val locations = database.locationDao().getAll()
                call.respond(ApiResponse.ok(locations.map { it.toDto() }))
            }

            // GET /api/locations/{id} - get location by id
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

                val location = database.locationDao().getById(id)
                if (location == null) {
                    call.respond(
                        HttpStatusCode.NotFound,
                        ApiResponse.fail<Unit>("מיקום לא נמצא")
                    )
                    return@get
                }

                call.respond(ApiResponse.ok(location.toDto()))
            }

            // POST /api/locations - create location
            post {
                call.requireRole("Admin", "SystemManager")
                val request = call.receive<LocationRequest>()

                if (request.name.isBlank()) {
                    throw IllegalArgumentException("שם מיקום נדרש")
                }

                // Check uniqueness by name
                val existing = database.locationDao().getByName(request.name.trim())
                if (existing != null) {
                    throw IllegalArgumentException("שם מיקום כבר קיים")
                }

                val now = Instant.now().toString()
                val entity = LocationEntity(
                    name = request.name.trim(),
                    address = request.address?.trim(),
                    city = request.city?.trim(),
                    navigation = request.navigation?.trim(),
                    createdAt = now,
                    updatedAt = now
                )

                val newId = database.locationDao().insert(entity)
                val created = database.locationDao().getById(newId.toInt())!!
                call.respond(HttpStatusCode.Created, ApiResponse.ok(created.toDto()))
            }

            // PUT /api/locations/{id} - update location
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

                val existing = database.locationDao().getById(id)
                if (existing == null) {
                    call.respond(
                        HttpStatusCode.NotFound,
                        ApiResponse.fail<Unit>("מיקום לא נמצא")
                    )
                    return@put
                }

                val request = call.receive<LocationRequest>()

                if (request.name.isBlank()) {
                    throw IllegalArgumentException("שם מיקום נדרש")
                }

                // Check name uniqueness if changed (exclude self)
                if (request.name.trim() != existing.name) {
                    val duplicate = database.locationDao().getByName(request.name.trim())
                    if (duplicate != null) {
                        throw IllegalArgumentException("שם מיקום כבר קיים")
                    }
                }

                val now = Instant.now().toString()
                val updated = existing.copy(
                    name = request.name.trim(),
                    address = request.address?.trim(),
                    city = request.city?.trim(),
                    navigation = request.navigation?.trim(),
                    updatedAt = now
                )

                database.locationDao().update(updated)
                call.respond(ApiResponse.ok(updated.toDto()))
            }

            // DELETE /api/locations/{id} - delete location
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

                val existing = database.locationDao().getById(id)
                if (existing == null) {
                    call.respond(
                        HttpStatusCode.NotFound,
                        ApiResponse.fail<Unit>("מיקום לא נמצא")
                    )
                    return@delete
                }

                // Check if location is used in future shifts
                val israelTz = ZoneId.of("Asia/Jerusalem")
                val today = LocalDate.now(israelTz).toIsoInstant()

                val futureCount = database.locationDao().countFutureShiftsByLocationId(id, today)
                if (futureCount > 0) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("לא ניתן למחוק מיקום המשויך למשמרות עתידיות ($futureCount משמרות)")
                    )
                    return@delete
                }

                database.locationDao().deleteById(id)
                call.respond(ApiResponse.ok("המיקום נמחק בהצלחה"))
            }
        }
    }
}
