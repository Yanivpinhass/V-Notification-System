package com.magav.app.api.routes

import android.content.Context
import android.content.pm.PackageManager
import android.telephony.SubscriptionManager
import com.magav.app.api.models.ApiResponse
import com.magav.app.api.requireRole
import com.magav.app.db.MagavDatabase
import com.magav.app.db.entity.AppSettingEntity
import com.magav.app.sms.AndroidSmsProvider
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable

@Serializable
data class SimInfoDto(
    val subscriptionId: Int,
    val displayName: String,
    val slotIndex: Int
)

@Serializable
data class SmsSimSettingsDto(
    val subscriptionId: Int,
    val availableSims: List<SimInfoDto>
)

@Serializable
data class UpdateSmsSimDto(
    val subscriptionId: Int
)

@Serializable
data class TestSmsDto(
    val phoneNumber: String,
    val message: String = "הודעת בדיקה ממערכת מגב"
)

@Serializable
data class TestSmsResultDto(
    val success: Boolean,
    val error: String? = null
)

fun Route.settingsRoutes(database: MagavDatabase, context: Context) {
    authenticate("auth-bearer") {
        route("/api/settings") {

            // GET /api/settings/sms-sim - get current SIM setting + available SIMs
            get("/sms-sim") {
                call.requireRole("Admin")

                val setting = database.appSettingDao().getByKey("sms_sim_subscription_id")
                val currentSubId = setting?.value?.toIntOrNull() ?: -1
                val availableSims = getAvailableSims(context)

                call.respond(ApiResponse.ok(SmsSimSettingsDto(
                    subscriptionId = currentSubId,
                    availableSims = availableSims
                )))
            }

            // PUT /api/settings/sms-sim - update SIM selection
            put("/sms-sim") {
                call.requireRole("Admin")

                val update = call.receive<UpdateSmsSimDto>()

                // Validate: -1 (default) or a valid subscription ID
                if (update.subscriptionId != -1) {
                    val availableSims = getAvailableSims(context)
                    val valid = availableSims.any { it.subscriptionId == update.subscriptionId }
                    if (!valid) {
                        call.respond(
                            HttpStatusCode.BadRequest,
                            ApiResponse.fail<Unit>("כרטיס SIM שנבחר אינו זמין")
                        )
                        return@put
                    }
                }

                database.appSettingDao().upsert(
                    AppSettingEntity(
                        key = "sms_sim_subscription_id",
                        value = update.subscriptionId.toString()
                    )
                )

                val availableSims = getAvailableSims(context)
                call.respond(ApiResponse.ok(SmsSimSettingsDto(
                    subscriptionId = update.subscriptionId,
                    availableSims = availableSims
                )))
            }

            // POST /api/settings/test-sms - send a test SMS
            post("/test-sms") {
                call.requireRole("Admin")

                val request = call.receive<TestSmsDto>()

                // Validate phone number
                val phone = request.phoneNumber.trim()
                if (phone.length < 9 || !phone.matches(Regex("^[0-9+\\-]+$"))) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("מספר טלפון לא תקין")
                    )
                    return@post
                }

                android.util.Log.d("SettingsRoutes", "Test SMS: phone=$phone")

                val smsProvider = AndroidSmsProvider(context)
                val result = smsProvider.sendSms(phone, request.message)
                android.util.Log.d("SettingsRoutes", "Test SMS result: success=${result.success}, error=${result.error}")

                call.respond(ApiResponse.ok(TestSmsResultDto(
                    success = result.success,
                    error = result.error
                )))
            }
        }
    }
}

private fun getAvailableSims(context: Context): List<SimInfoDto> {
    if (context.checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE)
        != PackageManager.PERMISSION_GRANTED
    ) {
        android.util.Log.w("SettingsRoutes", "READ_PHONE_STATE permission not granted")
        return emptyList()
    }

    return try {
        val subscriptionManager = context.getSystemService(SubscriptionManager::class.java)
        val subscriptions = subscriptionManager.activeSubscriptionInfoList ?: emptyList()

        // Log detailed diagnostics
        val defaultSmsSubId = SubscriptionManager.getDefaultSmsSubscriptionId()
        val defaultSubId = SubscriptionManager.getDefaultSubscriptionId()
        android.util.Log.d("SettingsRoutes", "Default SMS subId=$defaultSmsSubId, default subId=$defaultSubId")
        android.util.Log.d("SettingsRoutes", "Active subscriptions: ${subscriptions.size}")

        subscriptions.map { info ->
            android.util.Log.d("SettingsRoutes",
                "SIM slot=${info.simSlotIndex}: subId=${info.subscriptionId}, " +
                "displayName=${info.displayName}, carrierName=${info.carrierName}, " +
                "number=${info.number}, isEmbedded=${info.isEmbedded}, " +
                "isOpportunistic=${info.isOpportunistic}")
            SimInfoDto(
                subscriptionId = info.subscriptionId,
                displayName = info.displayName?.toString() ?: "SIM ${info.simSlotIndex + 1}",
                slotIndex = info.simSlotIndex
            )
        }
    } catch (e: Exception) {
        android.util.Log.e("SettingsRoutes", "Error reading SIM info", e)
        emptyList()
    }
}
