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
import com.magav.app.util.LocationTypes
import com.magav.app.util.toIsoInstant

@Serializable
data class LocationDto(
    val id: Int,
    val name: String,
    val address: String?,
    val city: String?,
    val navigation: String?,
    val createdAt: String?,
    val updatedAt: String?,
    val locationType: String
)

private fun LocationEntity.toDto() = LocationDto(
    id = id,
    name = name,
    address = address,
    city = city,
    navigation = navigation,
    createdAt = createdAt,
    updatedAt = updatedAt,
    locationType = locationType
)

fun Route.locationRoutes(database: MagavDatabase) {
    authenticate("auth-bearer") {
        route("/api/locations") {

            // GET /api/locations?type=Vehicle|General|All (default Vehicle). Filter the RESPONSE only;
            // getAll() stays untouched for the id-keyed consumers (§6c parity with scheduler-config).
            get {
                call.requireRole("Admin", "SystemManager")
                val type = call.request.queryParameters["type"]?.takeIf { it.isNotBlank() } ?: LocationTypes.VEHICLE
                if (type != LocationTypes.VEHICLE && type != LocationTypes.GENERAL && type != "All") {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("סוג מיקום לא תקין"))
                    return@get
                }
                val locations = database.locationDao().getAll()
                    .let { all -> if (type == "All") all else all.filter { it.locationType == type } }
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

                // POST default = Vehicle (old clients creating patrol locations keep working).
                val type = request.type?.takeIf { it.isNotBlank() } ?: LocationTypes.VEHICLE
                if (type != LocationTypes.VEHICLE && type != LocationTypes.GENERAL) {
                    throw IllegalArgumentException("סוג מיקום לא תקין")
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
                    updatedAt = now,
                    locationType = type
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

                // PUT default = the row's EXISTING type (preserve-on-omit) — NOT Vehicle, or an
                // omitted field would silently flip a General row. Explicit type is honored.
                val type = request.type?.takeIf { it.isNotBlank() } ?: existing.locationType
                if (type != LocationTypes.VEHICLE && type != LocationTypes.GENERAL) {
                    throw IllegalArgumentException("סוג מיקום לא תקין")
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
                    updatedAt = now,
                    locationType = type
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
