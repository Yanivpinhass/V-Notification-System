package com.magav.app.callback

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

/**
 * Manifest receiver (exported=true; PHONE_STATE is a protected broadcast). On a RINGING incoming
 * call it checks eligibility and arms the one-shot +20s callback alarm; on OFFHOOK/IDLE it cancels
 * any pending alarm (a battery optimization — correctness rests on CallbackAlarmReceiver's
 * fire-time callState re-check, not on this cancel). Event-driven; ~zero idle cost.
 */
class CallbackPhoneStateReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return

        when (state) {
            TelephonyManager.EXTRA_STATE_RINGING -> {
                // EXTRA_INCOMING_NUMBER needs READ_CALL_LOG; empty/withheld ⇒ isEligible fail-safe skip.
                @Suppress("DEPRECATION")
                val number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
                val pending = goAsync()
                GlobalScope.launch(Dispatchers.IO) {
                    try {
                        if (CallbackLogic.isEligible(number)) {
                            CallbackLogic.armAlarm(context)
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("CallbackPhoneState", "RINGING handling failed", e)
                    } finally {
                        pending.finish()
                    }
                }
            }
            TelephonyManager.EXTRA_STATE_OFFHOOK, TelephonyManager.EXTRA_STATE_IDLE -> {
                // Cheap synchronous cancel (AlarmManager + PendingIntent); no goAsync needed.
                CallbackLogic.cancelAlarm(context)
            }
        }
    }
}
