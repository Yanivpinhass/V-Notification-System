package com.magav.app.scheduler

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.Data
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

class SmsAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val configId = intent.getIntExtra("configId", -1)
        if (configId == -1) return

        val workData = Data.Builder()
            .putInt("configId", configId)
            .build()

        val workRequest = OneTimeWorkRequestBuilder<SmsSchedulerWorker>()
            .setInputData(workData)
            .build()

        WorkManager.getInstance(context).enqueue(workRequest)

        // Re-schedule alarm for next occurrence
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
