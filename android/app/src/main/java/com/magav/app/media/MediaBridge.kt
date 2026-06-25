package com.magav.app.media

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import androidx.core.content.FileProvider
import java.io.File

/**
 * JS↔native bridge for saving/sharing the "יומן הפעלה" (Duty Log) PNG.
 * Exposed to the WebView as window.NativeMedia (see MainActivity).
 *
 * Methods run on a WebView binder thread, return synchronously, and never touch
 * the UI thread. This feature persists NOTHING in the app database — the Room
 * schema is untouched, so existing user data is never migrated or wiped on update.
 */
class MediaBridge(private val context: Context) {

    /** Decode base64 and verify the PNG magic (0x89 50 4E 47). Returns null if invalid. */
    private fun decodePng(base64: String): ByteArray? {
        val bytes = try {
            Base64.decode(base64, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            return null
        }
        if (bytes.size < 4 ||
            (bytes[0].toInt() and 0xFF) != 0x89 ||
            (bytes[1].toInt() and 0xFF) != 0x50 ||
            (bytes[2].toInt() and 0xFF) != 0x4E ||
            (bytes[3].toInt() and 0xFF) != 0x47
        ) {
            return null
        }
        return bytes
    }

    private fun safeName(filename: String): String {
        val cleaned = filename.replace(Regex("[\\\\/:*?\"<>|]"), "_").trim()
        val withExt = if (cleaned.endsWith(".png", ignoreCase = true)) cleaned else "$cleaned.png"
        return if (withExt.length <= 4) "duty-log.png" else withExt
    }

    /**
     * Save the PNG to the shared gallery under Pictures/Magav via MediaStore
     * (scoped storage — no runtime permission needed on minSdk 29+).
     * Returns true on success, false on any failure (pending row is cleaned up).
     */
    @JavascriptInterface
    fun saveImageToGallery(base64: String, filename: String): Boolean {
        val bytes = decodePng(base64) ?: return false
        val name = safeName(filename)
        val resolver = context.contentResolver
        val collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, name)
            put(MediaStore.Images.Media.MIME_TYPE, "image/png")
            put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Magav")
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        var uri: Uri? = null
        return try {
            uri = resolver.insert(collection, values) ?: return false
            val ok = resolver.openOutputStream(uri)?.use { out ->
                out.write(bytes)
                true
            } ?: false
            if (!ok) {
                resolver.delete(uri, null, null)
                return false
            }
            values.clear()
            values.put(MediaStore.Images.Media.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            true
        } catch (e: Exception) {
            uri?.let { try { resolver.delete(it, null, null) } catch (_: Exception) {} }
            false
        }
    }

    /**
     * Write the PNG to cacheDir/shared/ and fire an ACTION_SEND chooser via
     * FileProvider. Best-effort — failures are swallowed (non-fatal).
     */
    @JavascriptInterface
    fun shareImage(base64: String, filename: String) {
        val bytes = decodePng(base64) ?: return
        val name = safeName(filename)
        try {
            val dir = File(context.cacheDir, "shared").apply { mkdirs() }
            val file = File(dir, name)
            file.outputStream().use { it.write(bytes) }
            val uri = FileProvider.getUriForFile(context, "com.magav.app.fileprovider", file)
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "image/png"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent.createChooser(send, "שיתוף יומן הפעלה").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(chooser)
        } catch (e: Exception) {
            // sharing is best-effort; ignore failures
        }
    }
}
