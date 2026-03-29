package com.magav.app.api.routes

import android.content.Context
import io.ktor.http.ContentType
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant

fun Route.healthRoutes(context: Context) {
    get("/api/health") {
        val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        val json = buildJsonObject {
            put("status", "healthy")
            put("timestamp", Instant.now().toString())
            put("version", packageInfo.versionName ?: "unknown")
            put("versionCode", packageInfo.longVersionCode)
        }
        call.respondText(json.toString(), ContentType.Application.Json)
    }
}
