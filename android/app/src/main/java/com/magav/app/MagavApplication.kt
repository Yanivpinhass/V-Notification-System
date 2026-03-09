package com.magav.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.room.Room
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.magav.app.db.MagavDatabase
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
    }

    override fun onCreate() {
        super.onCreate()
        try {
            android.util.Log.i("MagavApp", "Application onCreate starting...")
            createNotificationChannel()
            android.util.Log.i("MagavApp", "Notification channel created")
            initializeDatabase()
            android.util.Log.i("MagavApp", "Database initialized")
            initializeKoin()
            android.util.Log.i("MagavApp", "Koin initialized, application ready")
        } catch (e: Exception) {
            android.util.Log.e("MagavApp", "Application onCreate failed", e)
        }
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            "magav_server_channel",
            getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.notification_channel_description)
        }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }

    private fun initializeDatabase() {
        val dbPassword = getOrCreateDatabaseKey()
        val passphrase = SQLiteDatabase.getBytes(dbPassword.toCharArray())
        val factory = SupportFactory(passphrase)

        database = Room.databaseBuilder(this, MagavDatabase::class.java, "magav.db")
            .openHelperFactory(factory)
            .build()
    }

    private fun getOrCreateDatabaseKey(): String {
        val prefs = EncryptedSharedPreferences.create(
            "magav_secure_prefs",
            MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
            this,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
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
}
