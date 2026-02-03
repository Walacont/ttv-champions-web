# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Keep line numbers for better crash reports in Play Console
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Capacitor - keep all plugin classes and WebView bridge
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }

# Keep WebView JavaScript interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# OneSignal
-keep class com.onesignal.** { *; }
-dontwarn com.onesignal.**

# AndroidX
-keep class androidx.core.splashscreen.** { *; }

# Keep Capacitor plugin classes referenced by name
-keep class * extends com.getcapacitor.Plugin { *; }
