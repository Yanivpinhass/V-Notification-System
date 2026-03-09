package com.magav.app.api.routes

import com.magav.app.api.getUserId
import com.magav.app.api.models.ApiResponse
import com.magav.app.api.models.ChangePasswordRequest
import com.magav.app.api.models.LoginRequest
import com.magav.app.api.models.RefreshTokenRequest
import com.magav.app.db.MagavDatabase
import com.magav.app.service.AuthService
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.authRoutes(database: MagavDatabase) {

    post("/api/auth/login") {
        val request = call.receive<LoginRequest>()

        if (request.username.isBlank() || request.password.isBlank()) {
            call.respond(
                HttpStatusCode.BadRequest,
                ApiResponse.fail<Unit>("שם משתמש וסיסמה נדרשים")
            )
            return@post
        }

        try {
            val authService = AuthService(database.userDao())
            val response = authService.login(request.username, request.password)
            call.respond(ApiResponse.ok(response))
        } catch (ex: IllegalArgumentException) {
            call.respond(
                HttpStatusCode.Unauthorized,
                ApiResponse.fail<Unit>(ex.message ?: "שגיאת התחברות")
            )
        }
    }

    post("/api/auth/refresh") {
        val request = call.receive<RefreshTokenRequest>()

        if (request.refreshToken.isBlank()) {
            call.respond(
                HttpStatusCode.BadRequest,
                ApiResponse.fail<Unit>("טוקן נדרש")
            )
            return@post
        }

        try {
            val authService = AuthService(database.userDao())
            val response = authService.refreshToken(request.refreshToken)
            call.respond(ApiResponse.ok(response))
        } catch (ex: IllegalArgumentException) {
            call.respond(
                HttpStatusCode.Unauthorized,
                ApiResponse.fail<Unit>(ex.message ?: "טוקן לא תקף")
            )
        }
    }

    authenticate("auth-bearer") {
        post("/api/auth/logout") {
            val userId = call.getUserId()
            if (userId == null) {
                call.respond(
                    HttpStatusCode.Unauthorized,
                    ApiResponse.fail<Unit>("משתמש לא מזוהה")
                )
                return@post
            }

            val authService = AuthService(database.userDao())
            authService.logout(userId)
            call.respond(ApiResponse.ok("התנתקת בהצלחה"))
        }

        post("/api/auth/change-password") {
            val userId = call.getUserId()
            if (userId == null) {
                call.respond(
                    HttpStatusCode.Unauthorized,
                    ApiResponse.fail<Unit>("משתמש לא מזוהה")
                )
                return@post
            }

            val request = call.receive<ChangePasswordRequest>()

            try {
                val authService = AuthService(database.userDao())
                authService.changePassword(userId, request.newPassword)
                call.respond(ApiResponse.ok("הסיסמה שונתה בהצלחה"))
            } catch (ex: IllegalArgumentException) {
                call.respond(
                    HttpStatusCode.BadRequest,
                    ApiResponse.fail<Unit>(ex.message ?: "שגיאה בשינוי סיסמה")
                )
            }
        }
    }
}
