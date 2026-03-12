package com.magav.app

import android.app.AlarmManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.magav.app.auth.BiometricAuthHelper
import com.magav.app.auth.NativeAuthBridge
import com.magav.app.auth.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.koin.android.ext.android.inject

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var loadingSpinner: View
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

    private val sessionManager: SessionManager by inject()
    private val biometricHelper = BiometricAuthHelper()

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        fileChooserCallback?.onReceiveValue(uris)
        fileChooserCallback = null
    }

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { /* granted or not */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        loadingSpinner = findViewById(R.id.loadingSpinner)

        setupWebView()
        startServerService()
        requestPermissions()
        waitForServerAndLoad()
    }

    override fun onResume() {
        super.onResume()
        if (sessionManager.hasValidSession()) {
            sessionManager.updateLastActivity()
        }
    }

    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            @Suppress("DEPRECATION")
            databaseEnabled = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                if (url.startsWith("tel:")) {
                    val intent = Intent(Intent.ACTION_DIAL, Uri.parse(url))
                    startActivity(intent)
                    return true
                }
                return false
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = callback
                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_MIME_TYPES, arrayOf(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "application/vnd.ms-excel",
                        "application/octet-stream"
                    ))
                }
                fileChooserLauncher.launch(Intent.createChooser(intent, "בחר קובץ Excel"))
                return true
            }
        }
        webView.addJavascriptInterface(NativeAuthBridge(sessionManager), "NativeAuth")
    }

    private fun startServerService() {
        val intent = Intent(this, MagavServerService::class.java)
        startForegroundService(intent)
    }

    private fun requestPermissions() {
        val needed = mutableListOf<String>()
        if (checkSelfPermission(android.Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
            needed.add(android.Manifest.permission.SEND_SMS)
        }
        if (checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            needed.add(android.Manifest.permission.READ_PHONE_STATE)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                needed.add(android.Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        if (needed.isNotEmpty()) {
            permissionLauncher.launch(needed.toTypedArray())
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val alarmManager = getSystemService(AlarmManager::class.java)
            if (!alarmManager.canScheduleExactAlarms()) {
                startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM))
            }
        }
    }

    private fun waitForServerAndLoad() {
        lifecycleScope.launch {
            var ready = false
            var attempts = 0
            val maxAttempts = 60 // 30 seconds at 500ms intervals
            while (!ready && attempts < maxAttempts) {
                attempts++
                ready = withContext(Dispatchers.IO) {
                    try {
                        val url = java.net.URL("http://localhost:5015/api/health")
                        val conn = url.openConnection() as java.net.HttpURLConnection
                        conn.connectTimeout = 1000
                        conn.readTimeout = 1000
                        conn.requestMethod = "GET"
                        val code = conn.responseCode
                        conn.disconnect()
                        code == 200
                    } catch (_: Exception) {
                        false
                    }
                }
                if (!ready) delay(500)
            }
            if (ready) {
                handleSessionAwareStartup()
            } else {
                showWebView()
                webView.loadDataWithBaseURL(null,
                    "<html dir='rtl'><body style='text-align:center;padding:40px;font-family:sans-serif'>" +
                    "<h2>שגיאה בהפעלת השרת</h2><p>יש לסגור ולהפעיל מחדש את האפליקציה</p></body></html>",
                    "text/html", "UTF-8", null)
            }
        }
    }

    private fun handleSessionAwareStartup() {
        if (!sessionManager.hasValidSession()) {
            // No session — show login screen
            showWebView()
            webView.loadUrl("http://localhost:5015")
        } else if (!sessionManager.needsBiometric()) {
            // Recent activity — silent refresh (spinner stays visible)
            silentRefreshAndLoad()
        } else if (biometricHelper.isBiometricAvailable(this)) {
            // Stale activity + biometric available — show prompt (spinner stays visible behind dialog)
            biometricHelper.showBiometricPrompt(
                activity = this,
                onSuccess = { silentRefreshAndLoad() },
                onFailure = {
                    sessionManager.clearSession()
                    showWebView()
                    webView.loadUrl("http://localhost:5015")
                }
            )
        } else {
            // Stale activity + no biometric — silent refresh anyway
            silentRefreshAndLoad()
        }
    }

    private fun silentRefreshAndLoad() {
        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) {
                refreshTokenViaHttp()
            }
            if (result != null) {
                sessionManager.updateRefreshToken(result.refreshToken)
                sessionManager.updateLastActivity()
                showWebView()
                injectTokensAndLoad(result.accessToken, result.refreshToken, result.userJson)
            } else {
                sessionManager.clearSession()
                showWebView()
                webView.loadUrl("http://localhost:5015")
            }
        }
    }

    private fun refreshTokenViaHttp(): RefreshResult? {
        val storedToken = sessionManager.getRefreshToken() ?: return null
        return try {
            val url = java.net.URL("http://localhost:5015/api/auth/refresh")
            val conn = url.openConnection() as java.net.HttpURLConnection
            conn.connectTimeout = 5000
            conn.readTimeout = 5000
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.doOutput = true

            val body = JSONObject().put("refreshToken", storedToken).toString()
            conn.outputStream.use { it.write(body.toByteArray()) }

            if (conn.responseCode != 200) {
                conn.disconnect()
                return null
            }

            val responseText = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()

            val json = JSONObject(responseText)
            if (!json.optBoolean("success", false)) return null

            val data = json.getJSONObject("data")
            RefreshResult(
                accessToken = data.getString("accessToken"),
                refreshToken = data.getString("refreshToken"),
                userJson = data.getJSONObject("user").toString()
            )
        } catch (e: Exception) {
            android.util.Log.e("MainActivity", "Silent refresh failed", e)
            null
        }
    }

    private fun injectTokensAndLoad(accessToken: String, refreshToken: String, userJson: String) {
        // Escape for JavaScript single-quote string context
        val safeUserJson = userJson
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", "\\n")
            .replace("\r", "")
        val html = """
            <html><body><script>
            localStorage.setItem('accessToken', '${accessToken}');
            localStorage.setItem('refreshToken', '${refreshToken}');
            localStorage.setItem('user', '${safeUserJson}');
            window.location.replace('/');
            </script></body></html>
        """.trimIndent()
        webView.loadDataWithBaseURL("http://localhost:5015", html, "text/html", "UTF-8", null)
    }

    private fun showWebView() {
        loadingSpinner.visibility = View.GONE
        webView.visibility = View.VISIBLE
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack()
        else @Suppress("DEPRECATION") super.onBackPressed()
    }

    private data class RefreshResult(
        val accessToken: String,
        val refreshToken: String,
        val userJson: String
    )
}
