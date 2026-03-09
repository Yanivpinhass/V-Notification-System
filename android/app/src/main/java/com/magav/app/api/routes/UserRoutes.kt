package com.magav.app.api.routes

import at.favre.lib.crypto.bcrypt.BCrypt
import com.magav.app.api.getUserId
import com.magav.app.api.models.ApiResponse
import com.magav.app.api.models.CreateUserRequest
import com.magav.app.api.models.UpdateUserRequest
import com.magav.app.api.models.UserDto
import com.magav.app.api.requireRole
import com.magav.app.db.MagavDatabase
import com.magav.app.db.entity.UserEntity
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.Instant

private val VALID_ROLES = setOf("Admin", "User", "SystemManager")
private val USERNAME_REGEX = Regex("^[\\u0590-\\u05FFa-zA-Z0-9_]{3,50}$")

private fun UserEntity.toDto() = UserDto(
    id = id,
    fullName = fullName,
    userName = userName,
    isActive = isActive == 1,
    role = role,
    mustChangePassword = mustChangePassword == 1,
    lastConnected = lastConnected,
    createdAt = createdAt,
    updatedAt = updatedAt
)

private fun validatePassword(password: String) {
    if (password.length < 6) {
        throw IllegalArgumentException("הסיסמה חייבת להכיל לפחות 6 תווים")
    }
    if (!password.any { it.isLetter() }) {
        throw IllegalArgumentException("הסיסמה חייבת להכיל לפחות אות אחת")
    }
    if (!password.any { it.isDigit() }) {
        throw IllegalArgumentException("הסיסמה חייבת להכיל לפחות ספרה אחת")
    }
}

fun Route.userRoutes(database: MagavDatabase) {
    authenticate("auth-bearer") {
        route("/api/users") {

            // GET /api/users - list all users
            get {
                call.requireRole("Admin")
                val users = database.userDao().getAll()
                call.respond(ApiResponse.ok(users.map { it.toDto() }))
            }

            // GET /api/users/{id} - get user by id
            get("/{id}") {
                call.requireRole("Admin")
                val id = call.parameters["id"]?.toIntOrNull()
                if (id == null) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("מזהה לא תקין")
                    )
                    return@get
                }

                val user = database.userDao().getById(id)
                if (user == null) {
                    call.respond(
                        HttpStatusCode.NotFound,
                        ApiResponse.fail<Unit>("משתמש לא נמצא")
                    )
                    return@get
                }

                call.respond(ApiResponse.ok(user.toDto()))
            }

            // POST /api/users - create user
            post {
                call.requireRole("Admin")
                val request = call.receive<CreateUserRequest>()
                val now = Instant.now().toString()

                if (request.fullName.isBlank()) {
                    throw IllegalArgumentException("שם מלא נדרש")
                }
                if (request.userName.isBlank()) {
                    throw IllegalArgumentException("שם משתמש נדרש")
                }
                if (!USERNAME_REGEX.matches(request.userName)) {
                    throw IllegalArgumentException("שם משתמש חייב להכיל 3-50 תווים: אותיות, ספרות או קו תחתון")
                }
                if (request.password.isBlank()) {
                    throw IllegalArgumentException("סיסמה נדרשת")
                }
                validatePassword(request.password)
                if (request.role !in VALID_ROLES) {
                    throw IllegalArgumentException("תפקיד לא תקין")
                }

                val existingCount = database.userDao().countByUserName(request.userName)
                if (existingCount > 0) {
                    throw IllegalArgumentException("שם משתמש כבר קיים")
                }

                val passwordHash = BCrypt.withDefaults().hashToString(10, request.password.toCharArray())

                val entity = UserEntity(
                    fullName = request.fullName,
                    userName = request.userName,
                    passwordHash = passwordHash,
                    isActive = if (request.isActive) 1 else 0,
                    role = request.role,
                    mustChangePassword = if (request.mustChangePassword) 1 else 0,
                    createdAt = now,
                    updatedAt = now
                )

                val newId = database.userDao().insert(entity)
                val created = database.userDao().getById(newId.toInt())!!
                call.respond(HttpStatusCode.Created, ApiResponse.ok(created.toDto()))
            }

            // PUT /api/users/{id} - update user
            put("/{id}") {
                call.requireRole("Admin")
                val id = call.parameters["id"]?.toIntOrNull()
                if (id == null) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("מזהה לא תקין")
                    )
                    return@put
                }

                val existing = database.userDao().getById(id)
                if (existing == null) {
                    call.respond(
                        HttpStatusCode.NotFound,
                        ApiResponse.fail<Unit>("משתמש לא נמצא")
                    )
                    return@put
                }

                val request = call.receive<UpdateUserRequest>()
                val now = Instant.now().toString()
                val currentUserId = call.getUserId()

                if (request.fullName.isBlank()) {
                    throw IllegalArgumentException("שם מלא נדרש")
                }
                if (request.userName.isBlank()) {
                    throw IllegalArgumentException("שם משתמש נדרש")
                }
                if (!USERNAME_REGEX.matches(request.userName)) {
                    throw IllegalArgumentException("שם משתמש חייב להכיל 3-50 תווים: אותיות, ספרות או קו תחתון")
                }
                if (request.role !in VALID_ROLES) {
                    throw IllegalArgumentException("תפקיד לא תקין")
                }

                // Prevent self-deactivation
                if (id == currentUserId && !request.isActive) {
                    throw IllegalArgumentException("לא ניתן לבטל את המשתמש שלך")
                }

                // Prevent self-role-removal
                if (id == currentUserId && request.role != existing.role) {
                    throw IllegalArgumentException("לא ניתן לשנות את התפקיד שלך")
                }

                // Check username uniqueness if changed
                if (request.userName != existing.userName) {
                    val existingCount = database.userDao().countByUserName(request.userName)
                    if (existingCount > 0) {
                        throw IllegalArgumentException("שם משתמש כבר קיים")
                    }
                }

                // Optional password update
                var passwordHash = existing.passwordHash
                if (!request.newPassword.isNullOrBlank()) {
                    validatePassword(request.newPassword)
                    passwordHash = BCrypt.withDefaults().hashToString(10, request.newPassword.toCharArray())
                }

                val updated = existing.copy(
                    fullName = request.fullName,
                    userName = request.userName,
                    passwordHash = passwordHash,
                    isActive = if (request.isActive) 1 else 0,
                    role = request.role,
                    mustChangePassword = if (request.mustChangePassword) 1 else 0,
                    updatedAt = now
                )

                database.userDao().update(updated)
                call.respond(ApiResponse.ok(updated.toDto()))
            }

            // DELETE /api/users/{id} - delete user
            delete("/{id}") {
                call.requireRole("Admin")
                val id = call.parameters["id"]?.toIntOrNull()
                if (id == null) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("מזהה לא תקין")
                    )
                    return@delete
                }

                val currentUserId = call.getUserId()
                if (id == currentUserId) {
                    throw IllegalArgumentException("לא ניתן למחוק את המשתמש שלך")
                }

                val existing = database.userDao().getById(id)
                if (existing == null) {
                    call.respond(
                        HttpStatusCode.NotFound,
                        ApiResponse.fail<Unit>("משתמש לא נמצא")
                    )
                    return@delete
                }

                // Prevent deleting last admin
                if (existing.role == "Admin") {
                    val adminCount = database.userDao().countByRole("Admin")
                    if (adminCount <= 1) {
                        throw IllegalArgumentException("לא ניתן למחוק את מנהל המערכת האחרון")
                    }
                }

                database.userDao().delete(existing)
                call.respond(ApiResponse.ok("המשתמש נמחק בהצלחה"))
            }
        }
    }
}
