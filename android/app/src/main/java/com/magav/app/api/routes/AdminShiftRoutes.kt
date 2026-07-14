package com.magav.app.api.routes

import android.content.Context
import com.magav.app.api.models.ApiResponse
import com.magav.app.api.requireRole
import com.magav.app.db.MagavDatabase
import com.magav.app.db.entity.MessageTemplateEntity
import com.magav.app.db.entity.ShiftEntity
import com.magav.app.db.entity.SmsLogEntity
import com.magav.app.db.entity.VolunteerEntity
import com.magav.app.service.SmsReminderService
import com.magav.app.sms.AndroidSmsProvider
import com.magav.app.util.AppSettingsKeys
import com.magav.app.util.ReminderTypes
import com.magav.app.util.ShiftTypes
import com.magav.app.util.SmsStatuses
import com.magav.app.util.toIsoInstant
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

// Mirrors the .NET administrative-shifts endpoints in Program.cs (/api/shifts/administrative/*).
// Strictly isolated from operational shifts. Reads = Admin/SystemManager; mutations = Admin/SystemManager
// (same as the operational shift routes). ShiftName is kept == Description (NOT NULL). One row per volunteer.

@Serializable
data class AdminShiftDto(
    val id: Int,
    val shiftDate: String,
    val shiftName: String,
    val carId: String,
    val description: String?,
    val shiftTime: String?,
    val address: String?,
    val vehicleLocation: String?,
    val volunteerId: Int?,
    val locationId: Int?,
    val volunteerName: String?,
    val volunteerPhone: String?,
    val volunteerApproved: Boolean,
    val locationName: String?,
    val locationNavigation: String?,
    val locationCity: String?,
    val vehicleLocationId: Int?,
    val vehicleLocationName: String?,
    val vehicleLocationNavigation: String?,
    val vehicleLocationCity: String?
)

@Serializable
data class CreateAdminShiftRequest(
    val description: String,
    val date: String,
    val shiftTime: String,
    val address: String? = null,
    val vehicleLocation: String? = null,
    val carId: String? = null,
    val locationId: Int? = null,
    val customLocationName: String? = null,
    val customLocationNavigation: String? = null,
    val vehicleLocationId: Int? = null,
    val volunteerIds: List<Int> = emptyList(),
    val sendSms: Boolean = false
)

@Serializable
data class UpdateAdminShiftGroupRequest(
    val date: String,
    val oldShiftTime: String,
    val oldDescription: String,
    val newDescription: String,
    val newShiftTime: String,
    val address: String? = null,
    val vehicleLocation: String? = null,
    val carId: String? = null,
    val locationId: Int? = null,
    val customLocationName: String? = null,
    val customLocationNavigation: String? = null,
    val vehicleLocationId: Int? = null
)

@Serializable
data class CancelAdminShiftGroupRequest(
    val date: String,
    val shiftTime: String,
    val description: String
)

@Serializable
data class AdminCreateResult(val created: Int, val smsSent: Int, val smsFailed: Int)

private val ISRAEL_TZ = ZoneId.of("Asia/Jerusalem")

fun Route.adminShiftRoutes(database: MagavDatabase, context: Context) {
    authenticate("auth-bearer") {
        route("/api/shifts/administrative") {

            // GET /api/shifts/administrative/by-week?weekStart=YYYY-MM-DD
            get("/by-week") {
                call.requireRole("Admin", "SystemManager")

                val weekStartStr = call.request.queryParameters["weekStart"]
                val weekStart = try {
                    LocalDate.parse(weekStartStr)
                } catch (_: Exception) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("פורמט תאריך תחילת שבוע לא תקין"))
                    return@get
                }

                val from = weekStart.toIsoInstant()
                val to = weekStart.plusDays(7).toIsoInstant()

                val shifts = database.shiftDao().getByDateRangeAndType(from, to, ShiftTypes.ADMINISTRATIVE)
                val volunteerMap = database.volunteerDao().getAll().associateBy { it.id }
                val locationMap = database.locationDao().getAll().associateBy { it.id }

                val dtos = shifts.map { shift ->
                    val vol = shift.volunteerId?.let { volunteerMap[it] }
                    val loc = shift.locationId?.let { locationMap[it] }
                    val vehLoc = shift.vehicleLocationId?.let { locationMap[it] }
                    AdminShiftDto(
                        id = shift.id,
                        shiftDate = shift.shiftDate,
                        shiftName = shift.shiftName,
                        carId = shift.carId,
                        description = shift.description,
                        shiftTime = shift.shiftTime,
                        address = shift.address,
                        vehicleLocation = shift.vehicleLocation,
                        volunteerId = shift.volunteerId,
                        locationId = shift.locationId,
                        volunteerName = vol?.mappingName ?: shift.volunteerName,
                        volunteerPhone = vol?.mobilePhone,
                        volunteerApproved = vol?.approveToReceiveSms == 1,
                        locationName = loc?.name ?: shift.customLocationName,
                        locationNavigation = loc?.navigation ?: shift.customLocationNavigation,
                        locationCity = loc?.city,
                        vehicleLocationId = shift.vehicleLocationId,
                        vehicleLocationName = vehLoc?.name ?: shift.vehicleLocation,
                        vehicleLocationNavigation = vehLoc?.navigation,
                        vehicleLocationCity = vehLoc?.city
                    )
                }.sortedWith(compareBy({ it.shiftDate }, { it.shiftTime }, { it.description }, { it.volunteerName }))

                call.respond(ApiResponse.ok(dtos))
            }

            // POST /api/shifts/administrative - create a group (one row per volunteer)
            post {
                call.requireRole("Admin", "SystemManager")

                val request = call.receive<CreateAdminShiftRequest>()

                // Description REQUIRED — it also becomes ShiftName (NOT NULL); empty would violate the constraint.
                if (request.description.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("תיאור המשימה נדרש"))
                    return@post
                }
                val shiftDateIso = try {
                    LocalDate.parse(request.date).toIsoInstant()
                } catch (_: Exception) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("פורמט תאריך לא תקין"))
                    return@post
                }
                val shiftTime = normalizeShiftTime(request.shiftTime)
                if (shiftTime.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("שעת המשמרת נדרשת"))
                    return@post
                }
                val volunteerIds = request.volunteerIds.distinct()
                if (volunteerIds.isEmpty()) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("יש לבחור לפחות מתנדב אחד"))
                    return@post
                }

                val description = request.description.trim()
                val now = Instant.now().toString()

                // Vehicle location: id wins — a picked Vehicle location nulls the free text.
                val vehicleLocationId = request.vehicleLocationId
                val vehicleLocationText = if (vehicleLocationId != null) null
                    else request.vehicleLocation?.trim()?.ifBlank { null }

                // Dup-volunteer guard (enables add-volunteers-in-edit, which re-POSTs the group): skip
                // volunteers already ACTIVE in this exact (Date, ShiftTime, Description) admin group.
                val existingVolunteerIds = database.shiftDao()
                    .getAdminGroupVolunteerIds(shiftDateIso, LocalDate.parse(request.date).plusDays(1).toIsoInstant(), shiftTime, description)
                    .toHashSet()

                // Pair each created shift with the volunteer we already fetched, so the send loop below
                // never re-queries the volunteer.
                val created = mutableListOf<Pair<ShiftEntity, VolunteerEntity>>()

                for (volunteerId in volunteerIds) {
                    if (volunteerId in existingVolunteerIds) continue   // already in the group — idempotent

                    val volunteer = database.volunteerDao().getById(volunteerId)
                    if (volunteer == null) {
                        call.respond(HttpStatusCode.NotFound, ApiResponse.fail<Unit>("מתנדב $volunteerId לא נמצא"))
                        return@post
                    }
                    val entity = ShiftEntity(
                        shiftDate = shiftDateIso,
                        shiftName = description,          // ShiftName == Description (NOT NULL, non-empty)
                        carId = request.carId?.trim() ?: "",
                        volunteerId = volunteerId,
                        locationId = request.locationId,
                        customLocationName = request.customLocationName?.trim(),
                        customLocationNavigation = request.customLocationNavigation?.trim(),
                        createdAt = now,
                        updatedAt = now,
                        shiftType = ShiftTypes.ADMINISTRATIVE,
                        description = description,
                        shiftTime = shiftTime,
                        address = request.address?.trim()?.ifBlank { null },
                        vehicleLocation = vehicleLocationText,
                        vehicleLocationId = vehicleLocationId
                    )
                    val newId = database.shiftDao().insert(entity).toInt()
                    created.add(entity.copy(id = newId) to volunteer)
                }

                var smsSent = 0
                var smsFailed = 0
                if (request.sendSms) {
                    // Save+send uses the ASSIGNMENT template. Logs Manual, no dedup.
                    val template = resolveAdminTemplate(database, AppSettingsKeys.ADMIN_ASSIGNMENT_TEMPLATE_ID)
                    if (template == null) {
                        call.respond(ApiResponse.ok(AdminCreateResult(created.size, 0, 0)))
                        return@post
                    }
                    for ((shift, volunteer) in created) {
                        if (volunteer.mobilePhone.isNullOrBlank() || volunteer.approveToReceiveSms != 1) continue
                        try {
                            if (sendAdminSms(database, context, shift, volunteer, template)) smsSent++ else smsFailed++
                        } catch (_: Exception) {
                            smsFailed++
                        }
                    }
                }

                call.respond(ApiResponse.ok(AdminCreateResult(created.size, smsSent, smsFailed)))
            }

            // PUT /api/shifts/administrative/update-group - keyed on old (Date, Time, Description)
            put("/update-group") {
                call.requireRole("Admin", "SystemManager")

                val request = call.receive<UpdateAdminShiftGroupRequest>()
                if (request.newDescription.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("תיאור המשימה נדרש"))
                    return@put
                }
                val date = try {
                    LocalDate.parse(request.date)
                } catch (_: Exception) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("פורמט תאריך לא תקין"))
                    return@put
                }
                val newShiftTime = normalizeShiftTime(request.newShiftTime)
                if (newShiftTime.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("שעת המשמרת נדרשת"))
                    return@put
                }

                // Vehicle location: id wins — a picked Vehicle location nulls the free text.
                val vehicleLocationId = request.vehicleLocationId
                val vehicleLocationText = if (vehicleLocationId != null) null
                    else request.vehicleLocation?.trim()?.ifBlank { null }

                val from = date.toIsoInstant()
                val to = date.plusDays(1).toIsoInstant()
                val updated = database.shiftDao().updateAdminGroup(
                    newDescription = request.newDescription.trim(),
                    newShiftTime = newShiftTime,
                    address = request.address?.trim()?.ifBlank { null },
                    locationId = request.locationId,
                    customName = request.customLocationName?.trim(),
                    customNav = request.customLocationNavigation?.trim(),
                    carId = request.carId?.trim() ?: "",
                    vehicleLocation = vehicleLocationText,
                    vehicleLocationId = vehicleLocationId,
                    updatedAt = Instant.now().toString(),
                    from = from,
                    to = to,
                    oldShiftTime = normalizeShiftTime(request.oldShiftTime),
                    oldDescription = request.oldDescription.trim()
                )

                if (updated == 0) {
                    call.respond(HttpStatusCode.NotFound, ApiResponse.fail<Unit>("לא נמצאו שיבוצים לעדכון"))
                    return@put
                }
                call.respond(ApiResponse.ok("המשמרת המנהלית עודכנה בהצלחה"))
            }

            // POST /api/shifts/administrative/cancel-group - soft-cancel (Date, Time, Description)
            post("/cancel-group") {
                call.requireRole("Admin", "SystemManager")

                val request = call.receive<CancelAdminShiftGroupRequest>()
                if (request.description.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("תיאור המשימה נדרש"))
                    return@post
                }
                val date = try {
                    LocalDate.parse(request.date)
                } catch (_: Exception) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("פורמט תאריך לא תקין"))
                    return@post
                }

                val from = date.toIsoInstant()
                val to = date.plusDays(1).toIsoInstant()
                val now = Instant.now().toString()
                val canceled = database.shiftDao().cancelAdminGroup(
                    canceledAt = now, updatedAt = now, from = from, to = to,
                    shiftTime = normalizeShiftTime(request.shiftTime), description = request.description.trim()
                )

                if (canceled == 0) {
                    call.respond(HttpStatusCode.NotFound, ApiResponse.fail<Unit>("לא נמצאו שיבוצים לביטול"))
                    return@post
                }
                call.respond(ApiResponse.ok("המשמרת המנהלית בוטלה"))
            }

            // POST /api/shifts/administrative/{id}/send-sms - per-volunteer admin send (today template on
            // the shift's own day, else the assignment template — D6). Logs Manual, no dedup.
            post("/{id}/send-sms") {
                call.requireRole("Admin", "SystemManager")

                val id = call.parameters["id"]?.toIntOrNull()
                    ?: throw IllegalArgumentException("מזהה לא תקין")

                val shift = database.shiftDao().getById(id)
                if (shift == null || shift.shiftType != ShiftTypes.ADMINISTRATIVE) {
                    call.respond(HttpStatusCode.NotFound, ApiResponse.fail<Unit>("משמרת מנהלית לא נמצאה"))
                    return@post
                }
                if (shift.isCanceled == 1) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("לא ניתן לשלוח SMS למשמרת מבוטלת"))
                    return@post
                }
                val volId = shift.volunteerId ?: run {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("לא ניתן לשלוח SMS למתנדב לא מזוהה"))
                    return@post
                }
                val volunteer = database.volunteerDao().getById(volId) ?: run {
                    call.respond(HttpStatusCode.NotFound, ApiResponse.fail<Unit>("מתנדב לא נמצא"))
                    return@post
                }
                if (volunteer.mobilePhone.isNullOrBlank()) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("למתנדב אין מספר טלפון"))
                    return@post
                }
                if (volunteer.approveToReceiveSms != 1) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("המתנדב לא אישר קבלת הודעות SMS"))
                    return@post
                }

                val shiftDate = Instant.parse(shift.shiftDate).atZone(ISRAEL_TZ).toLocalDate()
                val today = LocalDate.now(ISRAEL_TZ)
                val key = if (shiftDate == today) AppSettingsKeys.ADMIN_TODAY_TEMPLATE_ID
                          else AppSettingsKeys.ADMIN_ASSIGNMENT_TEMPLATE_ID
                val template = resolveAdminTemplate(database, key) ?: run {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("תבנית ההודעה המנהלית לא הוגדרה"))
                    return@post
                }

                val ok = sendAdminSms(database, context, shift, volunteer, template)
                if (!ok) {
                    call.respond(HttpStatusCode.InternalServerError, ApiResponse.fail<Unit>("שליחת SMS נכשלה"))
                    return@post
                }
                call.respond(ApiResponse.ok("הודעת SMS נשלחה בהצלחה"))
            }
        }
    }
}

// Zero-pad to HH:mm so "8:00" and "08:00" bucket together (D3). Mirrors .NET AdminSendHelpers.NormalizeShiftTime.
private fun normalizeShiftTime(raw: String?): String {
    val trimmed = (raw ?: "").trim()
    val parts = trimmed.split(":")
    if (parts.size >= 2) {
        val h = parts[0].toIntOrNull()
        val m = parts[1].toIntOrNull()
        if (h != null && m != null && h in 0..23 && m in 0..59) return "%02d:%02d".format(h, m)
    }
    return trimmed
}

private suspend fun resolveAdminTemplate(database: MagavDatabase, appSettingKey: String): MessageTemplateEntity? {
    val id = database.appSettingDao().getByKey(appSettingKey)?.value?.toIntOrNull() ?: return null
    return database.messageTemplateDao().getById(id)
}

// One-shot administrative send: builds the message from an explicit template, sends via the configured
// SIM, logs ReminderType=Manual (no dedup). Mirrors .NET SmsReminderService.SendAdminSmsAsync.
private suspend fun sendAdminSms(
    database: MagavDatabase,
    context: Context,
    shift: ShiftEntity,
    volunteer: VolunteerEntity,
    template: MessageTemplateEntity
): Boolean {
    val shiftDate = Instant.parse(shift.shiftDate).atZone(ISRAEL_TZ).toLocalDate()
    val location = shift.locationId?.let { database.locationDao().getById(it) }
    val locName = location?.name ?: shift.customLocationName
    val vehLoc = shift.vehicleLocationId?.let { database.locationDao().getById(it) }

    // Placeholders substitute via buildMessage; then append the full location blocks (mission + vehicle,
    // incl. Waze) to EVERY admin send (V2-D1). Mirrors .NET SendAdminSmsAsync.
    val message = SmsReminderService.buildMessage(
        template.content, shift.shiftName, shift.carId, volunteer.mappingName, shiftDate,
        description = shift.description,
        shiftTime = shift.shiftTime,
        locationName = locName,
        address = shift.address,
        vehicleLocation = shift.vehicleLocation
    ) + SmsReminderService.buildAdminSmsBlocks(
        missionName = locName,
        missionAddress = shift.address,
        missionNav = location?.navigation ?: shift.customLocationNavigation,
        vehicleLocationId = shift.vehicleLocationId,
        vehicleName = vehLoc?.name ?: shift.vehicleLocation,
        vehicleCity = vehLoc?.city,
        vehicleNav = vehLoc?.navigation
    )

    val subscriptionId = database.appSettingDao().getByKey("sms_sim_subscription_id")?.value?.toIntOrNull() ?: -1
    val smsProvider = AndroidSmsProvider(context, subscriptionId)
    val result = smsProvider.sendSms(volunteer.mobilePhone!!, message)

    database.smsLogDao().insert(
        SmsLogEntity(
            shiftId = shift.id,
            sentAt = Instant.now().toString(),
            status = if (result.success) SmsStatuses.SUCCESS else SmsStatuses.FAIL,
            error = result.error,
            reminderType = ReminderTypes.MANUAL
        )
    )
    if (result.success) {
        database.shiftDao().update(shift.copy(smsSentAt = Instant.now().toString()))
    }
    return result.success
}
