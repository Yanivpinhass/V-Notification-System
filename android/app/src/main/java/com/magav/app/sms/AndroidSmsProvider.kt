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
    private val context: Context
) : SmsProvider {

    companion object {
        private val requestCodeCounter = AtomicInteger(100)
        private val smsMutex = Mutex() // Ensure only one SMS sends at a time
    }

    override suspend fun sendSms(phoneNumber: String, message: String): SmsProvider.SmsResult {
        // Serialize SMS sending to avoid broadcast receiver collisions
        return smsMutex.withLock {
            val result = withTimeoutOrNull(15_000L) {
                sendSmsInternal(phoneNumber, message)
            }
            result ?: SmsProvider.SmsResult(success = false, error = "SMS send timed out")
        }
    }

    private suspend fun sendSmsInternal(phoneNumber: String, message: String): SmsProvider.SmsResult {
        return suspendCancellableCoroutine { continuation ->
            try {
                android.util.Log.d("AndroidSms", "Sending to $phoneNumber")
                // Use the system default SmsManager — sends from whichever SIM
                // the user has set as default for SMS in Android Settings.
                val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    context.getSystemService(SmsManager::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    SmsManager.getDefault()
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    android.util.Log.d("AndroidSms", "SmsManager subscriptionId=${smsManager.subscriptionId}")
                }

                val requestCode = requestCodeCounter.getAndIncrement()
                val sentAction = "com.magav.app.SMS_SENT_$requestCode"

                val sentIntent = PendingIntent.getBroadcast(
                    context, requestCode,
                    Intent(sentAction).setPackage(context.packageName),
                    PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
                )

                var resumed = false
                val receiver = object : BroadcastReceiver() {
                    override fun onReceive(ctx: Context?, intent: Intent?) {
                        if (resumed) return
                        resumed = true
                        try {
                            context.unregisterReceiver(this)
                        } catch (_: Exception) {}
                        if (resultCode == Activity.RESULT_OK) {
                            android.util.Log.d("AndroidSms", "SMS sent successfully to $phoneNumber")
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

                val parts = smsManager.divideMessage(message)
                if (parts.size == 1) {
                    smsManager.sendTextMessage(phoneNumber, null, message, sentIntent, null)
                } else {
                    // For multipart: only track the last part's sent intent
                    val sentIntents = ArrayList<PendingIntent>(parts.size)
                    for (i in parts.indices) {
                        if (i == parts.size - 1) {
                            sentIntents.add(sentIntent)
                        } else {
                            sentIntents.add(
                                PendingIntent.getBroadcast(
                                    context, requestCodeCounter.getAndIncrement(),
                                    Intent("com.magav.app.SMS_PART_${requestCode}_$i").setPackage(context.packageName),
                                    PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
                                )
                            )
                        }
                    }
                    smsManager.sendMultipartTextMessage(
                        phoneNumber, null, parts, sentIntents, null
                    )
                }

                continuation.invokeOnCancellation {
                    try {
                        context.unregisterReceiver(receiver)
                    } catch (_: Exception) {}
                }
            } catch (e: Exception) {
                android.util.Log.e("AndroidSms", "SMS send exception", e)
                continuation.resume(SmsProvider.SmsResult(success = false, error = e.message))
            }
        }
    }
}
