package com.magav.app.api

import android.content.Context
import com.auth0.jwt.interfaces.DecodedJWT
import com.magav.app.api.auth.JwtConfig
import com.magav.app.api.models.ApiResponse
import com.magav.app.api.routes.*
import com.magav.app.db.MagavDatabase
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.cio.*
import io.ktor.server.engine.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.plugins.statuspages.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.util.*
import kotlinx.serialization.json.Json

val JwtAttributeKey = AttributeKey<DecodedJWT>("jwt")

fun createKtorServer(database: MagavDatabase, context: Context): ApplicationEngine {
    return embeddedServer(CIO, port = 5015, host = "127.0.0.1") {
        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
                encodeDefaults = true
            })
        }

        install(CORS) {
            anyHost()
            allowHeader(HttpHeaders.ContentType)
            allowHeader(HttpHeaders.Authorization)
            allowHeader("X-Requested-With")
            allowNonSimpleContentTypes = true
            HttpMethod.DefaultMethods.forEach { allowMethod(it) }
        }

        install(StatusPages) {
            exception<IllegalArgumentException> { call, cause ->
                call.respond(
                    HttpStatusCode.BadRequest,
                    ApiResponse.fail<Unit>(cause.message ?: "בקשה לא תקינה")
                )
            }
            exception<Exception> { call, cause ->
                android.util.Log.e("KtorServer", "Unhandled exception on ${call.request.uri}", cause)
                call.respond(
                    HttpStatusCode.InternalServerError,
                    ApiResponse.fail<Unit>("אירעה שגיאה")
                )
            }
        }

        install(Authentication) {
            bearer("auth-bearer") {
                authenticate { tokenCredential ->
                    val decoded = JwtConfig.verifyAccessToken(tokenCredential.token)
                    if (decoded != null) {
                        attributes.put(JwtAttributeKey, decoded)
                        val subject = decoded.subject
                        if (subject != null) UserIdPrincipal(subject) else null
                    } else {
                        null
                    }
                }
            }
        }

        routing {
            healthRoutes(context)
            authRoutes(database)
            userRoutes(database)
            volunteerRoutes(database)
            shiftRoutes(database, context)
            smsLogRoutes(database)
            schedulerRoutes(database, context)
            messageTemplateRoutes(database)
            settingsRoutes(database, context)

            // Static file serving from assets/web/ for non-API paths
            get("{...}") {
                val path = call.request.uri.trimStart('/')
                if (path.startsWith("api/")) return@get

                val assetPath = if (path.isEmpty()) "web/index.html" else "web/$path"

                try {
                    val inputStream = context.assets.open(assetPath)
                    val bytes = inputStream.use { it.readBytes() }
                    val contentType = ContentType.defaultForFilePath(assetPath)
                    call.respondBytes(bytes, contentType)
                } catch (_: Exception) {
                    // SPA fallback: serve index.html for unmatched paths
                    try {
                        val inputStream = context.assets.open("web/index.html")
                        val bytes = inputStream.use { it.readBytes() }
                        call.respondBytes(bytes, ContentType.Text.Html)
                    } catch (_: Exception) {
                        call.respond(HttpStatusCode.NotFound)
                    }
                }
            }
        }
    }
}

fun ApplicationCall.getUserId(): Int? {
    return attributes.getOrNull(JwtAttributeKey)?.subject?.toIntOrNull()
}

fun ApplicationCall.getUserRole(): String? {
    return attributes.getOrNull(JwtAttributeKey)?.getClaim("role")?.asString()
}

fun ApplicationCall.getUserName(): String? {
    return attributes.getOrNull(JwtAttributeKey)?.getClaim("name")?.asString()
}

fun ApplicationCall.requireRole(vararg roles: String) {
    val userRole = getUserRole()
    if (userRole == null || userRole !in roles) {
        throw IllegalArgumentException("אין הרשאה מתאימה")
    }
}
