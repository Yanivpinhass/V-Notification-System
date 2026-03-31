package com.magav.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.graphics.BitmapFactory
import androidx.core.app.NotificationCompat
import androidx.room.Room
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.magav.app.db.MagavDatabase
import com.magav.app.auth.SessionManager
import com.magav.app.service.AuthService
import com.magav.app.sms.AndroidSmsProvider
import com.magav.app.sms.SmsProvider
import com.magav.app.service.SmsReminderService
import net.sqlcipher.database.SQLiteDatabase
import net.sqlcipher.database.SupportFactory
import org.koin.android.ext.koin.androidContext
import org.koin.core.context.startKoin
import org.koin.dsl.module

class MagavApplication : Application() {

    companion object {
        lateinit var database: MagavDatabase
            private set
        @Volatile
        var isDatabaseReady = false
            private set
    }

    override fun onCreate() {
        super.onCreate()
        try {
            android.util.Log.i("MagavApp", "Application onCreate starting...")
            createNotificationChannels()
            android.util.Log.i("MagavApp", "Notification channels created")
            initializeDatabase()
            isDatabaseReady = true
            android.util.Log.i("MagavApp", "Database initialized")
            initializeKoin()
            android.util.Log.i("MagavApp", "Koin initialized, application ready")
        } catch (e: Exception) {
            android.util.Log.e("MagavApp", "Application onCreate failed", e)
            showErrorNotification("שגיאה באתחול המערכת - יש להפעיל מחדש")
        }
    }

    private fun createNotificationChannels() {
        val manager = getSystemService(NotificationManager::class.java)

        // Main service channel (low importance - silent background notification)
        val serverChannel = NotificationChannel(
            "magav_server_channel",
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.notification_channel_description)
        }
        manager.createNotificationChannel(serverChannel)

        // Error channel (high importance - heads-up notification for critical errors)
        val errorChannel = NotificationChannel(
            "magav_error_channel",
            getString(R.string.error_notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = getString(R.string.error_notification_channel_description)
        }
        manager.createNotificationChannel(errorChannel)

        // SMS summary channel (default importance - icon in status bar + sound)
        val smsSummaryChannel = NotificationChannel(
            "magav_sms_summary_channel",
            getString(R.string.sms_summary_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = getString(R.string.sms_summary_channel_description)
        }
        manager.createNotificationChannel(smsSummaryChannel)
    }

    private fun showErrorNotification(message: String) {
        try {
            val appIcon = BitmapFactory.decodeResource(resources, R.mipmap.ic_launcher)
            val notification = NotificationCompat.Builder(this, "magav_error_channel")
                .setContentTitle(getString(R.string.app_name))
                .setContentText(message)
                .setSmallIcon(R.drawable.ic_notification)
                .setLargeIcon(appIcon)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .build()
            val manager = getSystemService(NotificationManager::class.java)
            manager.notify(2, notification)
        } catch (e: Exception) {
            android.util.Log.e("MagavApp", "Failed to show error notification", e)
        }
    }

    private fun initializeDatabase() {
        val dbPassword = getOrCreateDatabaseKey()
        val passphrase = SQLiteDatabase.getBytes(dbPassword.toCharArray())
        val factory = SupportFactory(passphrase)

        database = Room.databaseBuilder(this, MagavDatabase::class.java, "magav.db")
            .openHelperFactory(factory)
            .addMigrations(MagavDatabase.MIGRATION_3_4)
            .fallbackToDestructiveMigration()
            .build()

        // Verify DB can be opened (handles restored backup encrypted with old key)
        try {
            database.openHelper.writableDatabase
        } catch (e: Exception) {
            android.util.Log.w("MagavApp", "Database wrong key or corrupted, recreating: ${e.message}")
            try { database.close() } catch (_: Exception) {}
            val dbFile = getDatabasePath("magav.db")
            dbFile.delete()
            java.io.File(dbFile.path + "-wal").delete()
            java.io.File(dbFile.path + "-shm").delete()
            java.io.File(dbFile.path + "-journal").delete()
            database = Room.databaseBuilder(this, MagavDatabase::class.java, "magav.db")
                .openHelperFactory(factory)
                .addMigrations(MagavDatabase.MIGRATION_3_4)
                .fallbackToDestructiveMigration()
                .build()
        }
    }

    private fun getOrCreateDatabaseKey(): String {
        val prefs = try {
            EncryptedSharedPreferences.create(
                "magav_secure_prefs",
                MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
                this,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            // Corrupted EncryptedSharedPreferences (e.g. after uninstall/reinstall
            // where Android Keystore retains old master key but prefs file is gone).
            // Delete the corrupted prefs file and recreate.
            android.util.Log.w("MagavApp", "EncryptedSharedPreferences corrupted, recreating: ${e.message}")
            val prefsFile = java.io.File(applicationInfo.dataDir, "shared_prefs/magav_secure_prefs.xml")
            prefsFile.delete()
            EncryptedSharedPreferences.create(
                "magav_secure_prefs",
                MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
                this,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        }
        val key = prefs.getString("db_encryption_key", null)
        if (key != null) return key

        val newKey = java.security.SecureRandom().let { random ->
            ByteArray(32).also { random.nextBytes(it) }.joinToString("") { "%02x".format(it) }
        }
        prefs.edit().putString("db_encryption_key", newKey).apply()
        return newKey
    }

    private fun initializeKoin() {
        startKoin {
            androidContext(this@MagavApplication)
            modules(appModule)
        }
    }
}

val appModule = module {
    single { MagavApplication.database }
    single { get<MagavDatabase>().userDao() }
    single { get<MagavDatabase>().volunteerDao() }
    single { get<MagavDatabase>().shiftDao() }
    single { get<MagavDatabase>().smsLogDao() }
    single { get<MagavDatabase>().schedulerConfigDao() }
    single { get<MagavDatabase>().schedulerRunLogDao() }
    single<SmsProvider> { AndroidSmsProvider(androidContext()) }
    single { AuthService(get()) }
    single { SmsReminderService(get(), get()) }
    single { SessionManager(androidContext()) }
}
