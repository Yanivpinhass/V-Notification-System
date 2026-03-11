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
