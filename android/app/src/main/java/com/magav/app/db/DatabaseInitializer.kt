package com.magav.app.db

import at.favre.lib.crypto.bcrypt.BCrypt
import com.magav.app.db.entity.AppSettingEntity
import com.magav.app.db.entity.MessageTemplateEntity
import com.magav.app.db.entity.SchedulerConfigEntity
import com.magav.app.db.entity.JewishHolidayEntity
import com.magav.app.db.entity.UserEntity
import com.magav.app.util.DayGroups
import com.magav.app.util.ReminderTypes
import java.time.Instant

class DatabaseInitializer(private val database: MagavDatabase) {

    suspend fun initialize() {
        seedAdminUser()
        seedMessageTemplates()
        seedSchedulerConfigs()
        seedAppSettings()
        seedJewishHolidays()
    }

    private suspend fun seedAdminUser() {
        val existing = database.userDao().getByUserName("Admin")
        if (existing != null) return

        val now = Instant.now().toString()
        val passwordHash = BCrypt.withDefaults().hashToString(10, "12345".toCharArray())

        val admin = UserEntity(
            id = 0,
            fullName = "נאור טויטו",
            userName = "Admin",
            passwordHash = passwordHash,
            isActive = 1,
            role = "Admin",
            mustChangePassword = 1,
            failedLoginAttempts = 0,
            lockoutUntil = null,
            refreshTokenHash = null,
            refreshTokenExpiry = null,
            lastConnected = null,
            createdAt = now,
            updatedAt = now
        )

        try {
            database.userDao().insert(admin)
        } catch (_: Exception) {
            // Ignore duplicate insert from concurrent initialization
        }
    }

    private suspend fun seedMessageTemplates() {
        val existing = database.messageTemplateDao().getAll()
        if (existing.isNotEmpty()) return

        val now = Instant.now().toString()

        database.messageTemplateDao().insert(
            MessageTemplateEntity(
                id = 0,
                name = "תזכורת ליום המשמרת",
                content = "שלום {שם},\nתזכורת למשמרת היום ({יום}, {תאריך}),\nמשמרת {משמרת}, רכב {רכב}.",
                createdAt = now,
                updatedAt = now
            )
        )
        database.messageTemplateDao().insert(
            MessageTemplateEntity(
                id = 0,
                name = "תזכורת מוקדמת",
                content = "שלום {שם},\nתזכורת למשמרת ביום {יום} {תאריך},\nמשמרת {משמרת}.",
                createdAt = now,
                updatedAt = now
            )
        )
        database.messageTemplateDao().insert(
            MessageTemplateEntity(
                id = 0,
                name = "ביטול משמרת",
                content = "שלום {שם},\nהמשמרת שלך ביום {יום} {תאריך} בוטלה.",
                createdAt = now,
                updatedAt = now
            )
        )
    }

    private suspend fun seedSchedulerConfigs() {
        val existing = database.schedulerConfigDao().getAll()
        if (existing.isNotEmpty()) return

        val now = Instant.now().toString()

        val configs = listOf(
            SchedulerConfigEntity(
                id = 0,
                dayGroup = DayGroups.SUN_THU,
                reminderType = ReminderTypes.SAME_DAY,
                time = "13:00",
                daysBeforeShift = 0,
                isEnabled = 1,
                messageTemplateId = 1,
                updatedAt = now,
                updatedBy = null
            ),
            SchedulerConfigEntity(
                id = 0,
                dayGroup = DayGroups.SUN_THU,
                reminderType = ReminderTypes.ADVANCE,
                time = "18:30",
                daysBeforeShift = 2,
                isEnabled = 1,
                messageTemplateId = 2,
                updatedAt = now,
                updatedBy = null
            ),
            SchedulerConfigEntity(
                id = 0,
                dayGroup = DayGroups.FRI,
                reminderType = ReminderTypes.SAME_DAY,
                time = "10:00",
                daysBeforeShift = 0,
                isEnabled = 1,
                messageTemplateId = 1,
                updatedAt = now,
                updatedBy = null
            ),
            SchedulerConfigEntity(
                id = 0,
                dayGroup = DayGroups.FRI,
                reminderType = ReminderTypes.ADVANCE,
                time = "12:00",
                daysBeforeShift = 2,
                isEnabled = 1,
                messageTemplateId = 2,
                updatedAt = now,
                updatedBy = null
            ),
            SchedulerConfigEntity(
                id = 0,
                dayGroup = DayGroups.SAT,
                reminderType = ReminderTypes.SAME_DAY,
                time = "10:00",
                daysBeforeShift = 0,
                isEnabled = 1,
                messageTemplateId = 1,
                updatedAt = now,
                updatedBy = null
            ),
            SchedulerConfigEntity(
                id = 0,
                dayGroup = DayGroups.SAT,
                reminderType = ReminderTypes.ADVANCE,
                time = "12:00",
                daysBeforeShift = 2,
                isEnabled = 1,
                messageTemplateId = 2,
                updatedAt = now,
                updatedBy = null
            )
        )

        configs.forEach { config ->
            database.schedulerConfigDao().insert(config)
        }
    }

    private suspend fun seedAppSettings() {
        val existing = database.appSettingDao().getByKey("sms_sim_subscription_id")
        if (existing != null) return

        database.appSettingDao().upsert(
            AppSettingEntity(key = "sms_sim_subscription_id", value = "-1")
        )
    }

    // IMPORTANT: Keep holiday dates in sync with web/server/Magav.Server/Services/DbInitializer.cs SeedJewishHolidaysAsync()
    // Uses insertOrIgnore so this is safe to call on every startup — duplicates are skipped
    private suspend fun seedJewishHolidays() {
        // Israeli holidays for 2025-2030
        val holidays = listOf(
            // 2025
            "2025-02-13" to "ט\"ו בשבט",
            "2025-03-14" to "פורים",
            "2025-04-24" to "יום השואה",
            "2025-04-30" to "יום הזיכרון",
            "2025-05-01" to "יום העצמאות",
            "2025-05-16" to "ל\"ג בעומר",
            "2025-08-03" to "ט' באב",
            "2025-09-23" to "ראש השנה א׳",
            "2025-09-24" to "ראש השנה ב׳",
            "2025-10-02" to "יום כיפור",
            "2025-10-07" to "סוכות",
            "2025-10-14" to "שמיני עצרת / שמחת תורה",
            // 2026
            "2026-02-02" to "ט\"ו בשבט",
            "2026-03-03" to "פורים",
            "2026-04-02" to "פסח יום א׳",
            "2026-04-08" to "פסח יום ז׳",
            "2026-04-14" to "יום השואה",
            "2026-04-21" to "יום הזיכרון",
            "2026-04-22" to "יום העצמאות",
            "2026-05-05" to "ל\"ג בעומר",
            "2026-05-22" to "שבועות",
            "2026-07-23" to "ט' באב",
            "2026-09-12" to "ראש השנה א׳",
            "2026-09-13" to "ראש השנה ב׳",
            "2026-09-21" to "יום כיפור",
            "2026-09-26" to "סוכות",
            "2026-10-03" to "שמיני עצרת / שמחת תורה",
            // 2027
            "2027-01-23" to "ט\"ו בשבט",
            "2027-03-23" to "פורים",
            "2027-04-22" to "פסח יום א׳",
            "2027-04-28" to "פסח יום ז׳",
            "2027-05-04" to "יום השואה",
            "2027-05-11" to "יום הזיכרון",
            "2027-05-12" to "יום העצמאות",
            "2027-05-25" to "ל\"ג בעומר",
            "2027-06-11" to "שבועות",
            "2027-08-12" to "ט' באב",
            "2027-10-02" to "ראש השנה א׳",
            "2027-10-03" to "ראש השנה ב׳",
            "2027-10-11" to "יום כיפור",
            "2027-10-16" to "סוכות",
            "2027-10-23" to "שמיני עצרת / שמחת תורה",
            // 2028
            "2028-02-12" to "ט\"ו בשבט",
            "2028-03-12" to "פורים",
            "2028-04-11" to "פסח יום א׳",
            "2028-04-17" to "פסח יום ז׳",
            "2028-04-24" to "יום השואה",
            "2028-05-01" to "יום הזיכרון",
            "2028-05-02" to "יום העצמאות",
            "2028-05-14" to "ל\"ג בעומר",
            "2028-05-31" to "שבועות",
            "2028-08-01" to "ט' באב",
            "2028-09-21" to "ראש השנה א׳",
            "2028-09-22" to "ראש השנה ב׳",
            "2028-09-30" to "יום כיפור",
            "2028-10-05" to "סוכות",
            "2028-10-12" to "שמיני עצרת / שמחת תורה",
            // 2029
            "2029-01-31" to "ט\"ו בשבט",
            "2029-03-01" to "פורים",
            "2029-03-31" to "פסח יום א׳",
            "2029-04-06" to "פסח יום ז׳",
            "2029-04-12" to "יום השואה",
            "2029-04-18" to "יום הזיכרון",
            "2029-04-19" to "יום העצמאות",
            "2029-05-03" to "ל\"ג בעומר",
            "2029-05-20" to "שבועות",
            "2029-07-22" to "ט' באב",
            "2029-09-10" to "ראש השנה א׳",
            "2029-09-11" to "ראש השנה ב׳",
            "2029-09-19" to "יום כיפור",
            "2029-09-24" to "סוכות",
            "2029-10-01" to "שמיני עצרת / שמחת תורה",
            // 2030
            "2030-01-19" to "ט\"ו בשבט",
            "2030-03-19" to "פורים",
            "2030-04-18" to "פסח יום א׳",
            "2030-04-24" to "פסח יום ז׳",
            "2030-04-30" to "יום השואה",
            "2030-05-07" to "יום הזיכרון",
            "2030-05-08" to "יום העצמאות",
            "2030-05-21" to "ל\"ג בעומר",
            "2030-06-07" to "שבועות",
            "2030-08-08" to "ט' באב",
            "2030-09-28" to "ראש השנה א׳",
            "2030-09-29" to "ראש השנה ב׳",
            "2030-10-07" to "יום כיפור",
            "2030-10-12" to "סוכות",
            "2030-10-19" to "שמיני עצרת / שמחת תורה",
        )

        holidays.forEach { (date, name) ->
            database.jewishHolidayDao().insertOrIgnore(
                JewishHolidayEntity(date = date, name = name)
            )
        }
    }
}
