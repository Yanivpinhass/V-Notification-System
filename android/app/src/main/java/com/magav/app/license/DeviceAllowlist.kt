package com.magav.app.license

import android.content.Context
import android.provider.Settings

/**
 * Android-only device gate. DO NOT move into util/Constants.kt (parity-mirrored with .NET).
 *
 * Each entry is a device's Settings.Secure.ANDROID_ID (lowercase hex).
 *
 * *** EMPTY SET => EVERY DEVICE IS BLOCKED. ***  This is the OPPOSITE of LicenseValidator
 * (whose empty config ALLOWS all). The inversion is intentional: a device must be explicitly
 * approved here before it can use the app.
 *
 * KEYSTORE CAVEAT: an ANDROID_ID is scoped to the APK signing key. These IDs are valid ONLY for
 * builds signed with the SAME debug keystore (~/.android/debug.keystore on the build machine).
 * Regenerating that keystore, building on another machine, or switching to release signing changes
 * every device's ANDROID_ID and invalidates this whole list -> and because the gate is fail-CLOSED,
 * that would block every device. Keep / back up the keystore; always build the distributed APK on
 * the same machine.
 */
object DeviceAllowlist {

    // Entries normalized once (trim + lowercase) so a copy/pasted ID with stray case/whitespace
    // still matches (mirrors LicenseValidator.normalize() discipline).
    private val ALLOWED: Set<String> = setOf<String>(
        "de8d89ac0c456479",      // approved device
        "0cdb5063a0eef7da",      // approved device
        // "0123456789abcdef",   // <example only> add approved device ANDROID_IDs here
    ).map { it.trim().lowercase() }.toSet()

    /** Raw ANDROID_ID for this app+device. Null/blank only in pathological cases on minSdk 29. */
    fun deviceId(context: Context): String? =
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)

    /** Fail-CLOSED: an unreadable id => blocked. Never silently allows. */
    fun isAllowed(context: Context): Boolean {
        val id = deviceId(context)?.trim()?.lowercase()
        if (id.isNullOrBlank()) return false
        return ALLOWED.contains(id)
    }
}
