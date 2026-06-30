package com.magav.app.callback

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import com.magav.app.MagavApplication
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

/**
 * Fire receiver for the +20s callback alarm (manifest; exported=false — explicit-intent target, so
 * no external app can trigger reject+dial). The single authoritative gate: if the device is STILL
 * RINGING at +20s, reject the call and dial the Gate. Answered ⇒ OFFHOOK, caller hung up ⇒ IDLE,
 * busy line ⇒ OFFHOOK — only a still-ringing unanswered call passes, so no state machine is needed.
 */
class CallbackAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        GlobalScope.launch(Dispatchers.IO) {
            try {
                if (!MagavApplication.isDatabaseReady) return@launch
                val tm = context.getSystemService(TelephonyManager::class.java) ?: return@launch
                @Suppress("DEPRECATION")
                val stillRinging = tm.callState == TelephonyManager.CALL_STATE_RINGING
                if (stillRinging) {
                    CallbackLogic.rejectAndDialGate(context)
                }
            } catch (e: Exception) {
                android.util.Log.e("CallbackAlarm", "fire handling failed", e)
            } finally {
                pending.finish()
            }
        }
    }
}
