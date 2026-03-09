package com.magav.app.sms

interface SmsProvider {
    data class SmsResult(val success: Boolean, val error: String? = null)
    suspend fun sendSms(phoneNumber: String, message: String): SmsResult
}
