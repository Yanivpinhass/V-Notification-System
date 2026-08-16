package com.magav.app.sms

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.telephony.SmsManager
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.resume

class AndroidSmsProvider(
    private val context: Context,
    private val subscriptionId: Int = -1
) : SmsProvider {

    companion object {
        private val requestCodeCounter = AtomicInteger(100)
        private val smsMutex = Mutex() // Ensure only one SMS sends at a time

        // Sent-broadcast wait window. A timeout does NOT mean the SMS failed — it was already
        // handed to the radio and is most likely delivered (outcome UNKNOWN → SmsLog 'Dispatched').
        // Named constant so the forced-UNKNOWN certification test can shrink it. [dup-sms plan 2.4]
        private const val SEND_TIMEOUT_MS = 60_000L
    }

    override suspend fun sendSms(phoneNumber: String, message: String): SmsProvider.SmsResult {
        // Serialize SMS sending to avoid broadcast receiver collisions
        return smsMutex.withLock {
            val result = withTimeoutOrNull(SEND_TIMEOUT_MS) {
                sendSmsInternal(phoneNumber, message)
            }
            result ?: SmsProvider.SmsResult(
                success = false,
                error = "SMS send timed out",
                outcome = SmsProvider.Outcome.UNKNOWN
            )
        }
    }

    private suspend fun sendSmsInternal(phoneNumber: String, message: String): SmsProvider.SmsResult {
        return suspendCancellableCoroutine { continuation ->
            try {
                android.util.Log.d("AndroidSms", "Sending to $phoneNumber (subscriptionId=$subscriptionId)")
                @Suppress("DEPRECATION")
                val smsManager = when {
                    subscriptionId != -1 ->
                        SmsManager.getSmsManagerForSubscriptionId(subscriptionId)
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
                        context.getSystemService(SmsManager::class.java)
                    else ->
                        SmsManager.getDefault()
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    android.util.Log.d("AndroidSms", "SmsManager subscriptionId=${smsManager.subscriptionId}")
                }

                val requestCode = requestCodeCounter.getAndIncrement()
                val sentAction = "com.magav.app.SMS_SENT_$requestCode"

                val parts = smsManager.divideMessage(message)
                val totalParts = parts.size

                // EVERY part gets a tracked PendingIntent on the shared action (distinct request
                // codes); the single receiver counts completions. Success only when ALL parts
                // report RESULT_OK; first error resolves FAILED. [dup-sms plan 2.3]
                var resumed = false
                var partsOk = 0
                val receiver = object : BroadcastReceiver() {
                    override fun onReceive(ctx: Context?, intent: Intent?) {
                        if (resumed) return
                        val ok = resultCode == Activity.RESULT_OK
                        if (ok && ++partsOk < totalParts) return // wait for the remaining parts
                        resumed = true
                        try {
                            context.unregisterReceiver(this)
                        } catch (_: Exception) {}
                        if (ok) {
                            android.util.Log.d("AndroidSms", "SMS sent successfully to $phoneNumber ($totalParts part/s)")
                            continuation.resume(SmsProvider.SmsResult(success = true))
                        } else {
                            android.util.Log.w("AndroidSms", "SMS failed to $phoneNumber, code=$resultCode")
                            continuation.resume(
                                SmsProvider.SmsResult(
                                    success = false,
                                    error = "SMS send failed with code: $resultCode"
                                )
                            )
                        }
                    }
                }

                // Register receiver - use EXPORTED so system SMS broadcast can reach it
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    context.registerReceiver(
                        receiver,
                        IntentFilter(sentAction),
                        Context.RECEIVER_EXPORTED
                    )
                } else {
                    context.registerReceiver(receiver, IntentFilter(sentAction))
                }

                val sentIntents = ArrayList<PendingIntent>(totalParts)
                for (i in parts.indices) {
                    sentIntents.add(
                        PendingIntent.getBroadcast(
                            context, requestCodeCounter.getAndIncrement(),
                            Intent(sentAction).setPackage(context.packageName),
                            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
                        )
                    )
                }

                continuation.invokeOnCancellation {
                    try {
                        context.unregisterReceiver(receiver)
                    } catch (_: Exception) {}
                }

                // Dispatch LAST. SmsManager's send methods throw SYNCHRONOUSLY (argument
                // validation) before anything is handed to the radio, so an exception here —
                // like any exception above — is a definitive FAILED, never UNKNOWN. [dup-sms 2.2]
                try {
                    if (totalParts == 1) {
                        smsManager.sendTextMessage(phoneNumber, null, message, sentIntents[0], null)
                    } else {
                        smsManager.sendMultipartTextMessage(phoneNumber, null, parts, sentIntents, null)
                    }
                } catch (e: Exception) {
                    android.util.Log.e("AndroidSms", "SMS dispatch exception", e)
                    if (!resumed) {
                        resumed = true
                        try {
                            context.unregisterReceiver(receiver)
                        } catch (_: Exception) {}
                        continuation.resume(SmsProvider.SmsResult(success = false, error = e.message))
                    }
                }
            } catch (e: Exception) {
                // Pre-dispatch failure: nothing was handed to the radio — definitive FAILED.
                android.util.Log.e("AndroidSms", "SMS send exception (pre-dispatch)", e)
                continuation.resume(SmsProvider.SmsResult(success = false, error = e.message))
            }
        }
    }
}
