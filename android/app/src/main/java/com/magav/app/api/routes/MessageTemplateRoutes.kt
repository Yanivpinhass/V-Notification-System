package com.magav.app.api.routes

import com.magav.app.api.models.ApiResponse
import com.magav.app.api.models.CreateMessageTemplateRequest
import com.magav.app.api.models.UpdateMessageTemplateRequest
import com.magav.app.api.requireRole
import com.magav.app.db.MagavDatabase
import com.magav.app.db.entity.MessageTemplateEntity
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import java.time.Instant

@Serializable
data class MessageTemplateDto(
    val id: Int,
    val name: String,
    val content: String,
    val createdAt: String?,
    val updatedAt: String?
)

fun Route.messageTemplateRoutes(database: MagavDatabase) {
    authenticate("auth-bearer") {
        route("/api/message-templates") {

            // GET /api/message-templates
            get {
                call.requireRole("Admin", "SystemManager")

                val templates = database.messageTemplateDao().getAll()
                val response = templates.map { entity ->
                    MessageTemplateDto(
                        id = entity.id,
                        name = entity.name,
                        content = entity.content,
                        createdAt = entity.createdAt,
                        updatedAt = entity.updatedAt
                    )
                }

                call.respond(ApiResponse.ok(response))
            }

            // POST /api/message-templates
            post {
                call.requireRole("Admin")

                val request = call.receive<CreateMessageTemplateRequest>()

                if (request.name.isBlank()) {
                    throw IllegalArgumentException("שם התבנית הוא שדה חובה")
                }
                if (request.content.isBlank() || request.content.length > 500) {
                    throw IllegalArgumentException("תוכן התבנית חייב להכיל 1-500 תווים")
                }
                if ("{שם}" !in request.content) {
                    throw IllegalArgumentException("תבנית חייבת להכיל {שם}")
                }
                if ("{תאריך}" !in request.content) {
                    throw IllegalArgumentException("תבנית חייבת להכיל {תאריך}")
                }

                val now = Instant.now().toString()
                val entity = MessageTemplateEntity(
                    id = 0,
                    name = request.name.trim(),
                    content = request.content,
                    createdAt = now,
                    updatedAt = now
                )

                val id = database.messageTemplateDao().insert(entity)
                val created = database.messageTemplateDao().getById(id.toInt())!!

                call.respond(
                    HttpStatusCode.Created,
                    ApiResponse.ok(
                        MessageTemplateDto(
                            id = created.id,
                            name = created.name,
                            content = created.content,
                            createdAt = created.createdAt,
                            updatedAt = created.updatedAt
                        )
                    )
                )
            }

            // PUT /api/message-templates/{id}
            put("/{id}") {
                call.requireRole("Admin")

                val id = call.parameters["id"]?.toIntOrNull()
                    ?: throw IllegalArgumentException("מזהה לא תקין")

                val existing = database.messageTemplateDao().getById(id)
                    ?: run {
                        call.respond(
                            HttpStatusCode.NotFound,
                            ApiResponse.fail<Unit>("תבנית לא נמצאה")
                        )
                        return@put
                    }

                val request = call.receive<UpdateMessageTemplateRequest>()

                if (request.name.isBlank()) {
                    throw IllegalArgumentException("שם התבנית הוא שדה חובה")
                }
                if (request.content.isBlank() || request.content.length > 500) {
                    throw IllegalArgumentException("תוכן התבנית חייב להכיל 1-500 תווים")
                }
                if ("{שם}" !in request.content) {
                    throw IllegalArgumentException("תבנית חייבת להכיל {שם}")
                }
                if ("{תאריך}" !in request.content) {
                    throw IllegalArgumentException("תבנית חייבת להכיל {תאריך}")
                }

                val now = Instant.now().toString()
                val updated = existing.copy(
                    name = request.name.trim(),
                    content = request.content,
                    updatedAt = now
                )
                database.messageTemplateDao().update(updated)

                call.respond(
                    ApiResponse.ok(
                        MessageTemplateDto(
                            id = updated.id,
                            name = updated.name,
                            content = updated.content,
                            createdAt = updated.createdAt,
                            updatedAt = updated.updatedAt
                        )
                    )
                )
            }

            // DELETE /api/message-templates/{id}
            delete("/{id}") {
                call.requireRole("Admin")

                val id = call.parameters["id"]?.toIntOrNull()
                    ?: throw IllegalArgumentException("מזהה לא תקין")

                val existing = database.messageTemplateDao().getById(id)
                    ?: run {
                        call.respond(
                            HttpStatusCode.NotFound,
                            ApiResponse.fail<Unit>("תבנית לא נמצאה")
                        )
                        return@delete
                    }

                val totalCount = database.messageTemplateDao().count()
                if (totalCount <= 1) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("לא ניתן למחוק את התבנית האחרונה")
                    )
                    return@delete
                }

                val usageCount = database.messageTemplateDao().getUsageCount(id)
                if (usageCount > 0) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("לא ניתן למחוק תבנית שמשויכת להגדרות תזמון")
                    )
                    return@delete
                }

                database.messageTemplateDao().deleteById(id)
                call.respond(ApiResponse.ok("התבנית נמחקה בהצלחה"))
            }
        }
    }
}
