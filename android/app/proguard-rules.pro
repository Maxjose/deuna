# Called by JavaScript in the hosted WebView, outside R8's call graph.
-keepclassmembers class com.de1na.app.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
