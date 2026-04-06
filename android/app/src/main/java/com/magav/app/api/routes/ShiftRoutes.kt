package com.magav.app.api.routes

import android.content.Context
import com.magav.app.api.models.ApiResponse
import com.magav.app.api.models.CreateShiftRequest
import com.magav.app.api.models.DateShiftInfo
import com.magav.app.api.models.DeleteGroupResult
import com.magav.app.api.models.DeleteShiftGroupRequest
import com.magav.app.api.models.SendLocationUpdateRequest
import com.magav.app.api.models.SendShiftSmsRequest
import com.magav.app.api.models.ShiftWithVolunteerDto
import com.magav.app.api.models.UpdateGroupLocationRequest
import com.magav.app.api.models.UpdateShiftGroupRequest
import com.magav.app.api.requireRole
import com.magav.app.db.MagavDatabase
import com.magav.app.db.entity.ShiftEntity
import com.magav.app.db.entity.SmsLogEntity
import com.magav.app.service.ShiftsImportService
import com.magav.app.service.SmsReminderService
import com.magav.app.sms.AndroidSmsProvider
import io.ktor.http.*
import io.ktor.http.content.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import com.magav.app.util.ReminderTypes
import com.magav.app.util.SmsStatuses
import com.magav.app.util.toIsoInstant
import com.magav.app.util.toIsoRange

fun Route.shiftRoutes(database: MagavDatabase, context: Context) {
    authenticate("auth-bearer") {
        route("/api/shifts") {

            // GET /api/shifts/by-date?date=YYYY-MM-DD
            get("/by-date") {
                call.requireRole("Admin", "SystemManager")

                val dateStr = call.request.queryParameters["date"]
                if (dateStr.isNullOrBlank()) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("פרמטר תאריך נדרש")
                    )
                    return@get
                }

                val date = try {
                    LocalDate.parse(dateStr)
                } catch (_: Exception) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("פורמט תאריך לא תקין")
                    )
                    return@get
                }

                val (from, to) = date.toIsoRange()

                val shifts = database.shiftDao().getByDateRange(from, to)
                val volunteers = database.volunteerDao().getAll()
                val volunteerMap = volunteers.associateBy { it.id }
                val locations = database.locationDao().getAll().associateBy { it.id }

                val dtos = shifts.map { shift ->
                    val vol = shift.volunteerId?.let { volunteerMap[it] }
                    val loc = shift.locationId?.let { locations[it] }
                    ShiftWithVolunteerDto(
                        id = shift.id,
                        shiftDate = shift.shiftDate,
                        shiftName = shift.shiftName,
                        carId = shift.carId,
                        volunteerId = shift.volunteerId,
                        volunteerName = if (shift.volunteerId != null) (vol?.mappingName ?: "מתנדב לא ידוע") else (shift.volunteerName ?: "?"),
                        volunteerPhone = vol?.mobilePhone,
                        volunteerApproved = vol?.approveToReceiveSms == 1,
                        isUnresolved = shift.volunteerId == null,
                        locationId = shift.locationId,
                        locationName = loc?.name ?: shift.customLocationName,
                        locationNavigation = loc?.navigation ?: shift.customLocationNavigation,
                        locationCity = loc?.city
                    )
                }

                call.respond(ApiResponse.ok(dtos))
            }

            // GET /api/shifts/dates-with-shifts?from=YYYY-MM-DD&to=YYYY-MM-DD
            get("/dates-with-shifts") {
                call.requireRole("Admin", "SystemManager")

                val fromStr = call.request.queryParameters["from"]
                val toStr = call.request.queryParameters["to"]

                if (fromStr.isNullOrBlank() || toStr.isNullOrBlank()) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("פרמטרי תאריך נדרשים")
                    )
                    return@get
                }

                val fromDate = try { LocalDate.parse(fromStr) } catch (_: Exception) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("פורמט תאריך לא תקין"))
                    return@get
                }
                val toDate = try { LocalDate.parse(toStr) } catch (_: Exception) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("פורמט תאריך לא תקין"))
                    return@get
                }

                val from = fromDate.toIsoInstant()
                val to = toDate.plusDays(1).toIsoInstant()

                val rawDates = database.shiftDao().getDistinctDatesByRange(from, to)
                val rawUnresolved = database.shiftDao().getDistinctDatesWithUnresolved(from, to)

                val israelTz = ZoneId.of("Asia/Jerusalem")
                val unresolvedSet = rawUnresolved.map { isoDate ->
                    Instant.parse(isoDate).atZone(israelTz).toLocalDate().toString()
                }.toSet()

                val dateInfos = rawDates.map { isoDate ->
                    val dateStr = Instant.parse(isoDate).atZone(israelTz).toLocalDate().toString()
                    DateShiftInfo(date = dateStr, hasUnresolved = dateStr in unresolvedSet)
                }.distinctBy { it.date }

                call.respond(ApiResponse.ok(dateInfos))
            }

            // DELETE /api/shifts/{id}
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

                val existing = database.shiftDao().getById(id)
                if (existing == null) {
                    call.respond(
                        HttpStatusCode.NotFound,
                        ApiResponse.fail<Unit>("שיבוץ לא נמצא")
                    )
                    return@delete
                }

                // Cascade: delete SMS logs first, then the shift
                database.smsLogDao().deleteByShiftId(id)
                database.shiftDao().deleteById(id)

                call.respond(ApiResponse.ok("השיבוץ נמחק בהצלחה"))
            }

            // POST /api/shifts/delete-group - delete all shifts in a group, optionally notify volunteers
            post("/delete-group") {
                call.requireRole("Admin", "SystemManager")

                val request = call.receive<DeleteShiftGroupRequest>()

                if (request.shiftName.isBlank()) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("שם משמרת נדרש"))
                    return@post
                }

                val date = try {
                    LocalDate.parse(request.date)
                } catch (_: Exception) {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("פורמט תאריך לא תקין"))
                    return@post
                }

                val (from, to) = date.toIsoRange()

                val allShifts = database.shiftDao().getByDateRange(from, to)
                val carId = request.carId.ifBlank { "" }
                val matching = allShifts.filter { it.shiftName == request.shiftName && it.carId == carId }

                if (matching.isEmpty()) {
                    call.respond(HttpStatusCode.NotFound, ApiResponse.fail<Unit>("לא נמצאו שיבוצים למחיקה"))
                    return@post
                }

                var smsSent = 0
                var smsFailed = 0

                if (request.sendNotifications) {
                    val template = database.messageTemplateDao().getById(3)
                    if (template != null) {
                        val subIdSetting = database.appSettingDao().getByKey("sms_sim_subscription_id")
                        val subscriptionId = subIdSetting?.value?.toIntOrNull() ?: -1
                        val smsProvider = AndroidSmsProvider(context, subscriptionId)
                        val israelTz = ZoneId.of("Asia/Jerusalem")
                        val volunteers = database.volunteerDao().getAll()
                        val volunteerMap = volunteers.associateBy { it.id }

                        for (shift in matching) {
                            if (shift.volunteerId == null) continue

                            try {
                                val volunteer = volunteerMap[shift.volunteerId] ?: continue
                                if (volunteer.mobilePhone.isNullOrBlank() || volunteer.approveToReceiveSms != 1) continue

                                val shiftDate = Instant.parse(shift.shiftDate).atZone(israelTz).toLocalDate()
                                val message = SmsReminderService.buildMessage(
                                    template.content, shift.shiftName, shift.carId,
                                    volunteer.mappingName, shiftDate
                                )
                                val result = smsProvider.sendSms(volunteer.mobilePhone, message)

                                if (result.success) smsSent++ else smsFailed++
                            } catch (_: Exception) {
                                smsFailed++
                            }
                        }
                    }
                }

                for (shift in matching) {
                    database.smsLogDao().deleteByShiftId(shift.id)
                    database.shiftDao().deleteById(shift.id)
                }

                call.respond(ApiResponse.ok(DeleteGroupResult(matching.size, smsSent, smsFailed)))
            }

            // POST /api/shifts/{id}/send-sms - send SMS to a shift volunteer
            post("/{id}/send-sms") {
                call.requireRole("Admin", "SystemManager")

                val id = call.parameters["id"]?.toIntOrNull()
                    ?: throw IllegalArgumentException("מזהה לא תקין")

                val shift = database.shiftDao().getById(id) ?: run {
                    call.respond(HttpStatusCode.NotFound, ApiResponse.fail<Unit>("שיבוץ לא נמצא"))
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

                val request = call.receive<SendShiftSmsRequest>()

                val israelTz = ZoneId.of("Asia/Jerusalem")
                val shiftDate = Instant.parse(shift.shiftDate).atZone(israelTz).toLocalDate()
                val today = LocalDate.now(israelTz)

                val templateId = request.templateId ?: run {
                    if (shiftDate.isBefore(today)) {
                        call.respond(
                            HttpStatusCode.BadRequest,
                            ApiResponse.fail<Unit>("לא ניתן לשלוח תזכורת למשמרת שעברה")
                        )
                        return@post
                    }
                    if (shiftDate == today) 1 else 2
                }

                val template = database.messageTemplateDao().getById(templateId) ?: run {
                    call.respond(HttpStatusCode.BadRequest, ApiResponse.fail<Unit>("תבנית הודעה לא נמצאה"))
                    return@post
                }

                var message = SmsReminderService.buildMessage(
                    template.content, shift.shiftName, shift.carId, volunteer.mappingName, shiftDate
                )

                if (templateId == 1) {
                    val location = shift.locationId?.let { database.locationDao().getById(it) }
                    val locName = location?.name ?: shift.customLocationName
                    val locCity = location?.city
                    val locNav = location?.navigation ?: shift.customLocationNavigation
                    message += SmsReminderService.buildLocationText(locName, locCity, locNav)
                }

                val subIdSetting = database.appSettingDao().getByKey("sms_sim_subscription_id")
                val subscriptionId = subIdSetting?.value?.toIntOrNull() ?: -1
                val smsProvider = AndroidSmsProvider(context, subscriptionId)
                val result = smsProvider.sendSms(volunteer.mobilePhone, message)

                val reminderType = when (templateId) { 1 -> ReminderTypes.SAME_DAY; 2 -> ReminderTypes.ADVANCE; else -> ReminderTypes.MANUAL }
                database.smsLogDao().insert(
                    SmsLogEntity(
                        shiftId = shift.id,
                        sentAt = Instant.now().toString(),
                        status = if (result.success) SmsStatuses.SUCCESS else SmsStatuses.FAIL,
                        error = result.error,
                        reminderType = reminderType
                    )
                )

                if (result.success) {
                    database.shiftDao().update(shift.copy(smsSentAt = Instant.now().toString()))
                }

                if (!result.success) {
                    call.respond(
                        HttpStatusCode.InternalServerError,
                        ApiResponse.fail<Unit>(result.error ?: "שליחת SMS נכשלה")
                    )
                    return@post
                }

                call.respond(ApiResponse.ok("הודעת SMS נשלחה בהצלחה"))
            }

            // POST /api/shifts - create a new shift assignment
            post {
                call.requireRole("Admin", "SystemManager")

                val request = call.receive<CreateShiftRequest>()

                if (request.shiftName.isBlank()) {
                    throw IllegalArgumentException("שם משמרת נדרש")
                }

                // Verify volunteer exists
                val volunteer = database.volunteerDao().getById(request.volunteerId)
                if (volunteer == null) {
                    call.respond(
                        HttpStatusCode.NotFound,
                        ApiResponse.fail<Unit>("המתנדב לא נמצא")
                    )
                    return@post
                }

                // Convert date to ISO_INSTANT format (matching import format)
                val shiftDateIso = try {
                    LocalDate.parse(request.shiftDate).toIsoInstant()
                } catch (_: Exception) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("פורמט תאריך לא תקין")
                    )
                    return@post
                }

                // Check for duplicates
                val from = shiftDateIso
                val to = LocalDate.parse(request.shiftDate).plusDays(1).toIsoInstant()
                val existingShifts = database.shiftDao().getByDateRange(from, to)
                val isDuplicate = existingShifts.any {
                    it.shiftName == request.shiftName &&
                    it.carId == request.carId &&
                    it.volunteerId == request.volunteerId
                }
                if (isDuplicate) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("המתנדב כבר משובץ למשמרת זו")
                    )
                    return@post
                }

                val now = Instant.now().toString()
                val entity = ShiftEntity(
                    shiftDate = shiftDateIso,
                    shiftName = request.shiftName,
                    carId = request.carId,
                    volunteerId = request.volunteerId,
                    locationId = request.locationId,
                    customLocationName = request.customLocationName?.trim(),
                    customLocationNavigation = request.customLocationNavigation?.trim(),
                    createdAt = now,
                    updatedAt = now
                )

                val newId = database.shiftDao().insert(entity)

                val loc = request.locationId?.let { database.locationDao().getById(it) }
                val dto = ShiftWithVolunteerDto(
                    id = newId.toInt(),
                    shiftDate = shiftDateIso,
                    shiftName = request.shiftName,
                    carId = request.carId,
                    volunteerId = request.volunteerId,
                    volunteerName = volunteer.mappingName,
                    volunteerPhone = volunteer.mobilePhone,
                    volunteerApproved = volunteer.approveToReceiveSms == 1,
                    isUnresolved = false,
                    locationId = request.locationId,
                    locationName = loc?.name ?: request.customLocationName?.trim(),
                    locationNavigation = loc?.navigation ?: request.customLocationNavigation?.trim(),
                    locationCity = loc?.city
                )

                call.respond(HttpStatusCode.Created, ApiResponse.ok(dto))
            }

            // PUT /api/shifts/update-group - update shift name, car, and location for a group
            put("/update-group") {
                call.requireRole("Admin", "SystemManager")

                val request = call.receive<UpdateShiftGroupRequest>()

                if (request.newShiftName.isBlank()) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("שם משמרת נדרש")
                    )
                    return@put
                }

                val date = try {
                    LocalDate.parse(request.date)
                } catch (_: Exception) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("פורמט תאריך לא תקין")
                    )
                    return@put
                }

                val newShiftName = request.newShiftName.trim()
                val newCarId = request.newCarId.trim()

                val (from, to) = date.toIsoRange()

                val nameCarChanged = request.oldShiftName != newShiftName || request.oldCarId != newCarId

                // Check if location changed by comparing against first existing shift
                val existingShifts = database.shiftDao().getByDateRange(from, to)
                val groupShifts = existingShifts.filter { it.shiftName == request.oldShiftName && it.carId == request.oldCarId }
                val firstShift = groupShifts.firstOrNull()
                val locationChanged = firstShift != null && (
                    firstShift.locationId != request.locationId ||
                    firstShift.customLocationName != request.customLocationName?.trim() ||
                    firstShift.customLocationNavigation != request.customLocationNavigation?.trim()
                )

                // No-op if nothing changed
                if (!nameCarChanged && !locationChanged) {
                    call.respond(ApiResponse.ok(mapOf("alreadySentSms" to false), "לא בוצעו שינויים"))
                    return@put
                }

                // Conflict check only when name/car changed
                if (nameCarChanged) {
                    val existingCount = database.shiftDao().countShiftGroup(newShiftName, newCarId, from, to)
                    if (existingCount > 0) {
                        call.respond(
                            HttpStatusCode.BadRequest,
                            ApiResponse.fail<Unit>("קבוצת משמרת עם שם ורכב זהים כבר קיימת לתאריך זה")
                        )
                        return@put
                    }

                    database.shiftDao().updateShiftGroup(
                        newShiftName, newCarId, Instant.now().toString(), from, to,
                        request.oldShiftName, request.oldCarId
                    )
                }

                // Always update location
                val shiftNameForLocation = if (nameCarChanged) newShiftName else request.oldShiftName
                val carIdForLocation = if (nameCarChanged) newCarId else request.oldCarId
                database.shiftDao().updateShiftGroupLocation(
                    request.locationId, request.customLocationName?.trim(), request.customLocationNavigation?.trim(),
                    Instant.now().toString(), from, to, shiftNameForLocation, carIdForLocation
                )

                // Check alreadySentSms: if date is today and location changed
                var alreadySentSms = false
                val israelTz = ZoneId.of("Asia/Jerusalem")
                val today = LocalDate.now(israelTz)
                if (locationChanged && date == today) {
                    for (shift in groupShifts) {
                        val existingLog = database.smsLogDao().getByShiftIdAndReminderType(shift.id, ReminderTypes.SAME_DAY)
                        if (existingLog != null) {
                            alreadySentSms = true
                            break
                        }
                    }
                }

                call.respond(ApiResponse.ok(mapOf("alreadySentSms" to alreadySentSms)))
            }

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

            // PUT /api/shifts/update-group-location - update only location for a shift group
            put("/update-group-location") {
                call.requireRole("Admin", "SystemManager")

                val request = call.receive<UpdateGroupLocationRequest>()

                val date = try {
                    LocalDate.parse(request.date)
                } catch (_: Exception) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("פורמט תאריך לא תקין")
                    )
                    return@put
                }

                val (from, to) = date.toIsoRange()

                database.shiftDao().updateShiftGroupLocation(
                    request.locationId, request.customLocationName?.trim(), request.customLocationNavigation?.trim(),
                    Instant.now().toString(), from, to, request.shiftName, request.carId
                )

                // Check alreadySentSms
                var alreadySentSms = false
                val israelTz = ZoneId.of("Asia/Jerusalem")
                val today = LocalDate.now(israelTz)
                if (date == today) {
                    val allShifts = database.shiftDao().getByDateRange(from, to)
                    val groupShifts = allShifts.filter { it.shiftName == request.shiftName && it.carId == request.carId }
                    for (shift in groupShifts) {
                        val existingLog = database.smsLogDao().getByShiftIdAndReminderType(shift.id, ReminderTypes.SAME_DAY)
                        if (existingLog != null) {
                            alreadySentSms = true
                            break
                        }
                    }
                }

                call.respond(ApiResponse.ok(mapOf("alreadySentSms" to alreadySentSms)))
            }

            // POST /api/shifts/send-location-update - send location update SMS to shift group volunteers
            post("/send-location-update") {
                call.requireRole("Admin", "SystemManager")

                val request = call.receive<SendLocationUpdateRequest>()

                val date = try {
                    LocalDate.parse(request.date)
                } catch (_: Exception) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("פורמט תאריך לא תקין")
                    )
                    return@post
                }

                val israelTz = ZoneId.of("Asia/Jerusalem")
                val today = LocalDate.now(israelTz)
                if (date != today) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("ניתן לשלוח עדכון מיקום רק למשמרות של היום")
                    )
                    return@post
                }

                val (from, to) = date.toIsoRange()

                val allShifts = database.shiftDao().getByDateRange(from, to)
                val groupShifts = allShifts.filter { it.shiftName == request.shiftName && it.carId == request.carId }

                if (groupShifts.isEmpty()) {
                    call.respond(HttpStatusCode.NotFound, ApiResponse.fail<Unit>("לא נמצאו שיבוצים"))
                    return@post
                }

                // Resolve location from first shift
                val firstShift = groupShifts.first()
                val loc = firstShift.locationId?.let { database.locationDao().getById(it) }
                val locName = loc?.name ?: firstShift.customLocationName
                val locCity = loc?.city
                val locNav = loc?.navigation ?: firstShift.customLocationNavigation
                val locationText = SmsReminderService.buildLocationText(locName, locCity, locNav)

                if (locationText.isBlank()) {
                    call.respond(
                        HttpStatusCode.BadRequest,
                        ApiResponse.fail<Unit>("לא הוגדר מיקום למשמרת")
                    )
                    return@post
                }

                val message = "עדכון מיקום הניידת:\n${locationText.trimStart('\n')}\nמשמרת נעימה"

                val subIdSetting = database.appSettingDao().getByKey("sms_sim_subscription_id")
                val subscriptionId = subIdSetting?.value?.toIntOrNull() ?: -1
                val smsProvider = AndroidSmsProvider(context, subscriptionId)

                val volunteers = database.volunteerDao().getAll()
                val volunteerMap = volunteers.associateBy { it.id }
                var smsSent = 0
                var smsFailed = 0

                for (shift in groupShifts) {
                    val volId = shift.volunteerId ?: continue
                    val volunteer = volunteerMap[volId] ?: continue
                    if (volunteer.mobilePhone.isNullOrBlank() || volunteer.approveToReceiveSms != 1) continue

                    try {
                        val result = smsProvider.sendSms(volunteer.mobilePhone, message)
                        val now = Instant.now().toString()
                        database.smsLogDao().insert(
                            SmsLogEntity(
                                shiftId = shift.id,
                                sentAt = now,
                                status = if (result.success) SmsStatuses.SUCCESS else SmsStatuses.FAIL,
                                error = result.error,
                                reminderType = ReminderTypes.LOCATION_UPDATE
                            )
                        )
                        if (result.success) smsSent++ else smsFailed++
                    } catch (e: Exception) {
                        android.util.Log.e("ShiftRoutes", "Error sending location update SMS for shift ${shift.id}", e)
                        smsFailed++
                    }
                }

                call.respond(ApiResponse.ok(mapOf("smsSent" to smsSent, "smsFailed" to smsFailed)))
            }
        }
    }
}
