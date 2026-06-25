package com.magav.app.license

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface

/**
 * JS<->native bridge exposed to the block page as window.NativeClip (see MainActivity.setupWebView).
 *
 * Reads ANDROID_ID natively so the copied value is identical to what DeviceAllowlist.isAllowed()
 * checks. @JavascriptInterface methods run on a WebView binder thread (NOT the UI thread), so the
 * clipboard write is marshalled to the main looper and wrapped in try/catch so an OEM / device-policy
 * exception can NEVER crash the block page (the only screen a blocked device can see).
 */
class DeviceClipboardBridge(private val context: Context) {

    @JavascriptInterface
    fun copyDeviceId(): String {
        val id = DeviceAllowlist.deviceId(context)?.trim() ?: ""
        if (id.isNotEmpty()) {
            Handler(Looper.getMainLooper()).post {
                try {
                    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    cm.setPrimaryClip(ClipData.newPlainText("Device ID", id))
                } catch (_: Exception) {
                    // best-effort; the id is also shown in a selectable box on the page
                }
            }
        }
        return id
    }
}
