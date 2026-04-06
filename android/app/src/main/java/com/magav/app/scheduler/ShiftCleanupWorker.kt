package com.magav.app.scheduler

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.magav.app.MagavApplication
import java.time.LocalDate
import java.time.ZoneId
import com.magav.app.util.toIsoInstant

class ShiftCleanupWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    private val israelTz = ZoneId.of("Asia/Jerusalem")

    override suspend fun doWork(): Result {
        if (!MagavApplication.isDatabaseReady) {
            android.util.Log.e("ShiftCleanup", "Database not ready, retrying")
            return Result.retry()
        }

        val today = LocalDate.now(israelTz)

        if (today.dayOfMonth != 1) {
            return Result.success()
        }

        val database = MagavApplication.database
        val cutoffDate = today.minusMonths(1)

        val shiftCutoff = cutoffDate.toIsoInstant()
        val runLogCutoff = cutoffDate.toString()

        return try {
            val shiftsDeleted = database.shiftDao().deleteOlderThan(shiftCutoff)
            val runLogsDeleted = database.schedulerRunLogDao().deleteOlderThan(runLogCutoff)

            android.util.Log.i(
                "ShiftCleanup",
                "Monthly cleanup completed: $shiftsDeleted shifts, $runLogsDeleted run logs deleted (cutoff: $runLogCutoff)"
            )
            Result.success()
        } catch (e: Exception) {
            android.util.Log.e("ShiftCleanup", "Cleanup failed", e)
            Result.retry()
        }
    }
}
