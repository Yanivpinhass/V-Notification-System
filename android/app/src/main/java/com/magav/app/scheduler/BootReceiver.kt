package com.magav.app.scheduler

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val pendingResult = goAsync()
            GlobalScope.launch(Dispatchers.IO) {
                try {
                    AlarmScheduler(context).scheduleAllAlarms()
                } finally {
                    pendingResult.finish()
                }
            }
        }
    }
}
