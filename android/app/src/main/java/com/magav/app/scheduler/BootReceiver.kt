package com.magav.app.scheduler

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.magav.app.MagavApplication
import com.magav.app.MagavServerService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            // Always start the service on boot - BOOT_COMPLETED is exempt from background start restrictions
            val serviceIntent = Intent(context, MagavServerService::class.java)
            context.startForegroundService(serviceIntent)

            // Also schedule alarms if DB is ready (service will do this too, but belt-and-suspenders)
            if (MagavApplication.isDatabaseReady) {
                val pendingResult = goAsync()
                GlobalScope.launch(Dispatchers.IO) {
                    try {
                        AlarmScheduler(context).scheduleAllAlarms()
                    } catch (e: Exception) {
                        android.util.Log.e("BootReceiver", "Failed to schedule alarms", e)
                    } finally {
                        pendingResult.finish()
                    }
                }
            }
        }
    }
}
