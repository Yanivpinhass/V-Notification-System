package com.magav.app

import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.magav.app.db.DatabaseInitializer
import com.magav.app.api.auth.JwtConfig
import com.magav.app.api.createKtorServer
import com.magav.app.scheduler.AlarmScheduler
import com.magav.app.scheduler.ShiftCleanupWorker
import io.ktor.server.engine.ApplicationEngine
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class MagavServerService : Service() {
    private var server: ApplicationEngine? = null
    @Volatile
    private var serverStarting = false
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val appIcon = BitmapFactory.decodeResource(resources, R.mipmap.ic_launcher)
        val notification = NotificationCompat.Builder(this, "magav_server_channel")
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.server_running))
            .setSmallIcon(R.drawable.ic_notification)
            .setLargeIcon(appIcon)
            .setOngoing(true)
            .build()

        startForeground(1, notification)

        if (server == null && !serverStarting) {
            // Check if database is available before attempting server start
            if (!MagavApplication.isDatabaseReady) {
                android.util.Log.e("MagavServer", "Database not initialized, cannot start server")
                updateNotification("שגיאה: מסד הנתונים לא אותחל - יש להפעיל מחדש")
                return START_STICKY
            }

            serverStarting = true
            scope.launch {
                try {
                    android.util.Log.i("MagavServer", "Starting server initialization...")
                    val database = MagavApplication.database
                    android.util.Log.i("MagavServer", "Running database initializer...")
                    DatabaseInitializer(database).initialize()
                    android.util.Log.i("MagavServer", "Database initialized successfully")
                    val jwtKey = getOrCreateJwtKey()
                    JwtConfig.initialize(jwtKey)
                    android.util.Log.i("MagavServer", "JWT initialized, starting Ktor server...")
                    // Schedule SMS alarms based on saved configs
                    android.util.Log.i("MagavServer", "Scheduling SMS alarms...")
                    AlarmScheduler(applicationContext).scheduleAllAlarms()
                    android.util.Log.i("MagavServer", "SMS alarms scheduled")

                    // Schedule monthly shift cleanup
                    scheduleMonthlyCleanup()

                    server = createKtorServer(database, applicationContext)
                    server?.start(wait = true)
                } catch (e: Exception) {
                    android.util.Log.e("MagavServer", "Server failed to start", e)
                    server = null
                    serverStarting = false // Reset so server can be restarted on next onStartCommand
                    updateNotification("שגיאה: השרת לא פעיל - יש להפעיל מחדש")
                }
            }
        }

        return START_STICKY
    }

    private fun updateNotification(text: String) {
        try {
            val appIcon = BitmapFactory.decodeResource(resources, R.mipmap.ic_launcher)
            val notification = NotificationCompat.Builder(this, "magav_server_channel")
                .setContentTitle(getString(R.string.app_name))
                .setContentText(text)
                .setSmallIcon(R.drawable.ic_notification)
                .setLargeIcon(appIcon)
                .setOngoing(true)
                .build()
            val manager = getSystemService(NotificationManager::class.java)
            manager.notify(1, notification)
        } catch (e: Exception) {
            android.util.Log.e("MagavServer", "Failed to update notification", e)
        }
    }

    private fun getOrCreateJwtKey(): String {
        val prefs = EncryptedSharedPreferences.create(
            "magav_secure_prefs",
            MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
            this,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
        val key = prefs.getString("jwt_secret_key", null)
        if (key != null) return key
        val newKey = java.security.SecureRandom().let { r ->
            ByteArray(64).also { r.nextBytes(it) }.joinToString("") { "%02x".format(it) }
        }
        prefs.edit().putString("jwt_secret_key", newKey).apply()
        return newKey
    }

    private fun scheduleMonthlyCleanup() {
        val cleanupRequest = androidx.work.PeriodicWorkRequestBuilder<ShiftCleanupWorker>(
            1, java.util.concurrent.TimeUnit.DAYS
        ).build()

        androidx.work.WorkManager.getInstance(applicationContext).enqueueUniquePeriodicWork(
            "shift_monthly_cleanup",
            androidx.work.ExistingPeriodicWorkPolicy.KEEP,
            cleanupRequest
        )
        android.util.Log.i("MagavServer", "Monthly shift cleanup worker scheduled")
    }

    override fun onDestroy() {
        server?.stop(1000, 2000)
        server = null
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
