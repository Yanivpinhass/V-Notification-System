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
    private suspend fun seedJewishHolidays() {
        val existing = database.jewishHolidayDao().getAll()
        if (existing.isNotEmpty()) return

        // Israeli Yom Tov dates (Shabbat-like work restrictions) for 2025-2030
        val holidays = listOf(
            // 5786 (2025-2026)
            "2025-09-23" to "ראש השנה א׳",
            "2025-09-24" to "ראש השנה ב׳",
            "2025-10-02" to "יום כיפור",
            "2025-10-07" to "סוכות",
            "2025-10-14" to "שמיני עצרת / שמחת תורה",
            "2026-04-02" to "פסח יום א׳",
            "2026-04-08" to "פסח יום ז׳",
            "2026-05-22" to "שבועות",
            // 5787 (2026-2027)
            "2026-09-12" to "ראש השנה א׳",
            "2026-09-13" to "ראש השנה ב׳",
            "2026-09-21" to "יום כיפור",
            "2026-09-26" to "סוכות",
            "2026-10-03" to "שמיני עצרת / שמחת תורה",
            "2027-04-22" to "פסח יום א׳",
            "2027-04-28" to "פסח יום ז׳",
            "2027-06-11" to "שבועות",
            // 5788 (2027-2028)
            "2027-10-02" to "ראש השנה א׳",
            "2027-10-03" to "ראש השנה ב׳",
            "2027-10-11" to "יום כיפור",
            "2027-10-16" to "סוכות",
            "2027-10-23" to "שמיני עצרת / שמחת תורה",
            "2028-04-11" to "פסח יום א׳",
            "2028-04-17" to "פסח יום ז׳",
            "2028-05-31" to "שבועות",
            // 5789 (2028-2029)
            "2028-09-21" to "ראש השנה א׳",
            "2028-09-22" to "ראש השנה ב׳",
            "2028-09-30" to "יום כיפור",
            "2028-10-05" to "סוכות",
            "2028-10-12" to "שמיני עצרת / שמחת תורה",
            "2029-03-31" to "פסח יום א׳",
            "2029-04-06" to "פסח יום ז׳",
            "2029-05-20" to "שבועות",
            // 5790 (2029-2030)
            "2029-09-10" to "ראש השנה א׳",
            "2029-09-11" to "ראש השנה ב׳",
            "2029-09-19" to "יום כיפור",
            "2029-09-24" to "סוכות",
            "2029-10-01" to "שמיני עצרת / שמחת תורה",
            "2030-04-18" to "פסח יום א׳",
            "2030-04-24" to "פסח יום ז׳",
            "2030-06-07" to "שבועות",
            // 5791 (2030-2031) — Tishrei only
            "2030-09-28" to "ראש השנה א׳",
            "2030-09-29" to "ראש השנה ב׳",
            "2030-10-07" to "יום כיפור",
            "2030-10-12" to "סוכות",
            "2030-10-19" to "שמיני עצרת / שמחת תורה",
        )

        holidays.forEach { (date, name) ->
            database.jewishHolidayDao().insert(
                JewishHolidayEntity(date = date, name = name)
            )
        }
    }
}
