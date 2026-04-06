package com.magav.app.db

import at.favre.lib.crypto.bcrypt.BCrypt
import com.magav.app.db.entity.AppSettingEntity
import com.magav.app.db.entity.MessageTemplateEntity
import com.magav.app.db.entity.SchedulerConfigEntity
import com.magav.app.db.entity.UserEntity
import com.magav.app.util.ReminderTypes
import java.time.Instant

class DatabaseInitializer(private val database: MagavDatabase) {

    suspend fun initialize() {
        seedAdminUser()
        seedMessageTemplates()
        seedSchedulerConfigs()
        seedAppSettings()
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
                dayGroup = "SunThu",
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
                dayGroup = "SunThu",
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
                dayGroup = "Fri",
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
                dayGroup = "Fri",
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
                dayGroup = "Sat",
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
                dayGroup = "Sat",
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
}
