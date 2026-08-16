package com.magav.app.sms

import com.magav.app.util.SmsStatuses

interface SmsProvider {
    // CONFIRMED: sent-broadcast reported OK (all parts). FAILED: definitively not sent
    // (error broadcast, or exception before anything reached the radio). UNKNOWN: dispatched
    // to the radio but no confirmation inside the wait window — most likely delivered.
    enum class Outcome { CONFIRMED, FAILED, UNKNOWN }

    data class SmsResult(
        val success: Boolean,
        val error: String? = null,
        val outcome: Outcome = if (success) Outcome.CONFIRMED else Outcome.FAILED
    )

    suspend fun sendSms(phoneNumber: String, message: String): SmsResult
}

// The single definition of the outcome→status contract — every send site maps through these.
// UNKNOWN = dispatched, most likely delivered: logged 'Dispatched', counted as sent, never
// surfaced as an error (a red badge/toast for a delivered message is what drove the
// Messages-app resend incident). [dup-sms 3.5]
val SmsProvider.Outcome.logStatus: String
    get() = when (this) {
        SmsProvider.Outcome.CONFIRMED -> SmsStatuses.SUCCESS
        SmsProvider.Outcome.UNKNOWN -> SmsStatuses.DISPATCHED
        SmsProvider.Outcome.FAILED -> SmsStatuses.FAIL
    }

val SmsProvider.Outcome.countsAsSent: Boolean
    get() = this != SmsProvider.Outcome.FAILED
