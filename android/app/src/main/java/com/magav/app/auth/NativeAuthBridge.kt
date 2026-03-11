package com.magav.app.auth

import android.webkit.JavascriptInterface

class NativeAuthBridge(private val sessionManager: SessionManager) {

    @JavascriptInterface
    fun onLoginSuccess(refreshToken: String, userJson: String) {
        sessionManager.saveSession(refreshToken, userJson)
        sessionManager.updateLastActivity()
    }

    @JavascriptInterface
    fun onLogout() {
        sessionManager.clearSession()
    }

    @JavascriptInterface
    fun onTokenRefresh(refreshToken: String) {
        sessionManager.updateRefreshToken(refreshToken)
    }
}
