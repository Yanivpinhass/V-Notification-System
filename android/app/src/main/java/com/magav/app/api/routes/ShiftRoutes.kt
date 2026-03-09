package com.magav.app.api.routes

import android.content.Context
import com.magav.app.api.models.ApiResponse
import com.magav.app.api.requireRole
import com.magav.app.db.MagavDatabase
import com.magav.app.service.ShiftsImportService
import io.ktor.http.*
import io.ktor.http.content.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.shiftRoutes(database: MagavDatabase, context: Context) {
    authenticate("auth-bearer") {
        route("/api/shifts") {

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
