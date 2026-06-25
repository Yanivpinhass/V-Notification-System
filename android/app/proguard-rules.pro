# Keep Ktor
-keep class io.ktor.** { *; }
-dontwarn io.ktor.**

# Keep Room entities
-keep class com.magav.app.db.entity.** { *; }

# Keep Kotlin serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.magav.app.**$$serializer { *; }
-keepclassmembers class com.magav.app.** { *** Companion; }
-keepclasseswithmembers class com.magav.app.** { kotlinx.serialization.KSerializer serializer(...); }

# Keep Apache POI (heavy - consider replacing with lighter xlsx parser)
-keep class org.apache.poi.** { *; }
-dontwarn org.apache.poi.**
-dontwarn org.apache.xmlbeans.**
-dontwarn org.apache.commons.**
-dontwarn org.openxmlformats.**
-dontwarn com.microsoft.**

# POI pulls in optional desktop/OSGi/logging integrations that are never exercised
# on Android. R8 (release only) treats their absent classes as hard errors unless
# suppressed — these -dontwarn lines do NOT change runtime behavior. (Surfaced the
# first time assembleRelease ran; POI classes themselves are kept above.)
-dontwarn aQute.bnd.annotation.**
-dontwarn com.google.j2objc.annotations.**
-dontwarn org.osgi.framework.**
-dontwarn org.slf4j.**
-dontwarn org.apache.logging.log4j.**
-dontwarn java.awt.**
-dontwarn com.graphbuilder.**

# Keep JWT
-keep class com.auth0.jwt.** { *; }

# Keep BCrypt
-keep class at.favre.lib.crypto.** { *; }

# Keep SQLCipher
-keep class net.sqlcipher.** { *; }
-dontwarn net.sqlcipher.**

# Keep JavaScript interface for WebView bridge
-keepclassmembers class com.magav.app.auth.NativeAuthBridge {
    @android.webkit.JavascriptInterface *;
}

# Keep ALL @JavascriptInterface methods (e.g. MediaBridge) — R8 in release would
# otherwise strip them and the WebView bridge would silently no-op.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep license validation
-keep class com.magav.app.license.** { *; }
