package com.magav.app.auth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys

class SessionManager(context: Context) {

    companion object {
        private const val PREFS_NAME = "magav_secure_prefs"
        private const val KEY_REFRESH_TOKEN = "session_refresh_token"
        private const val KEY_USER_JSON = "session_user_json"
        private const val KEY_LAST_ACTIVITY = "last_activity_ts"
        private const val BIOMETRIC_THRESHOLD_MS = 15 * 60 * 1000L // 15 minutes
    }

    private val prefs = EncryptedSharedPreferences.create(
        PREFS_NAME,
        MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC),
        context,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun saveSession(refreshToken: String, userJson: String) {
        prefs.edit()
            .putString(KEY_REFRESH_TOKEN, refreshToken)
            .putString(KEY_USER_JSON, userJson)
            .putLong(KEY_LAST_ACTIVITY, System.currentTimeMillis())
            .apply()
    }

    fun updateRefreshToken(newRefreshToken: String) {
        prefs.edit()
            .putString(KEY_REFRESH_TOKEN, newRefreshToken)
            .apply()
    }

    fun updateLastActivity() {
        prefs.edit()
            .putLong(KEY_LAST_ACTIVITY, System.currentTimeMillis())
            .apply()
    }

    fun getRefreshToken(): String? {
        return prefs.getString(KEY_REFRESH_TOKEN, null)
    }

    fun getUserJson(): String? {
        return prefs.getString(KEY_USER_JSON, null)
    }

    fun hasValidSession(): Boolean {
        return getRefreshToken() != null
    }

    fun needsBiometric(): Boolean {
        if (!hasValidSession()) return false
        val lastActivity = prefs.getLong(KEY_LAST_ACTIVITY, 0L)
        if (lastActivity == 0L) return true
        return System.currentTimeMillis() - lastActivity > BIOMETRIC_THRESHOLD_MS
    }

    fun clearSession() {
        prefs.edit()
            .remove(KEY_REFRESH_TOKEN)
            .remove(KEY_USER_JSON)
            .remove(KEY_LAST_ACTIVITY)
            .apply()
    }
}
