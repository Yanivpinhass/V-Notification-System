package com.magav.app.license

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SubscriptionManager
import com.magav.app.BuildConfig
import java.time.LocalDate
import java.time.ZoneId

object LicenseValidator {

    fun isValid(context: Context): Boolean {
        val phones = BuildConfig.LICENSE_PHONES.trim()
        val expiry = BuildConfig.LICENSE_EXPIRY_DATE.trim()

        if (phones.isEmpty() && expiry.isEmpty()) return true

        if (expiry.isNotEmpty()) {
            try {
                val expiryDate = LocalDate.parse(expiry)
                val today = LocalDate.now(ZoneId.of("Asia/Jerusalem"))
                if (today.isAfter(expiryDate)) return false
            } catch (_: Exception) {
                return false
            }
        }

        if (phones.isNotEmpty()) {
            val allowedPhones = phones.split(",").map { normalize(it) }.filter { it.isNotEmpty() }
            if (allowedPhones.isEmpty()) return true

            if (!hasPhonePermission(context)) return true

            try {
                val subscriptionManager = context.getSystemService(SubscriptionManager::class.java)
                val subscriptions = subscriptionManager.activeSubscriptionInfoList ?: return true

                val simNumbers = subscriptions.mapNotNull { info ->
                    val number = info.number
                    if (number.isNullOrBlank()) null else normalize(number)
                }.filter { it.isNotEmpty() }

                if (simNumbers.isEmpty()) return true

                if (simNumbers.none { sim -> allowedPhones.any { it == sim } }) return false
            } catch (_: Exception) {
                return true
            }
        }

        return true
    }

    private fun normalize(phone: String): String {
        val digits = phone.filter { it.isDigit() }
        return if (digits.length >= 9) digits.takeLast(9) else digits
    }

    private fun hasPhonePermission(context: Context): Boolean {
        if (context.checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE)
            != PackageManager.PERMISSION_GRANTED
        ) return false

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (context.checkSelfPermission(android.Manifest.permission.READ_PHONE_NUMBERS)
                != PackageManager.PERMISSION_GRANTED
            ) return false
        }

        return true
    }
}
