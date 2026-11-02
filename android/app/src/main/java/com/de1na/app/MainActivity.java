package com.de1na.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;

import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

/**
 * App nativa de De1na: muestra la web (de1na.app) en un WebView a pantalla completa, sin barras de Chrome,
 * con pantalla de inicio propia y un puente (window.De1naNative) para GPS en segundo plano, notificaciones FCM,
 * portapapeles y mantener la pantalla encendida.
 */
public class MainActivity extends AppCompatActivity {
    private static final int LOCATION_REQUEST = 51, NOTIFICATION_REQUEST = 52, FILE_REQUEST = 53;
    private WebView web;
    private boolean ready = false, failed = false;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin, pendingPushId;
    private ValueCallback<Uri[]> fileCallback;
    private final Handler main = new Handler(Looper.getMainLooper());

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        // La pantalla de inicio se mantiene hasta que la web cargó (máximo 6 s).
        splash.setKeepOnScreenCondition(() -> !ready);
        main.postDelayed(() -> ready = true, 6000);

        web = new WebView(this);
        web.setBackgroundColor(ContextCompat.getColor(this, R.color.paper));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " De1naApp/" + BuildConfig.APP_VERSION);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.addJavascriptInterface(new Bridge(), "De1naNative");

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleExternal(request.getUrl());
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) { failed = false; }
            @Override public void onPageFinished(WebView view, String url) {
                if (!failed) main.postDelayed(() -> ready = true, 250);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame()) return;
                failed = true;
                view.loadUrl("file:///android_asset/offline.html");
                ready = true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!isOwnOrigin(origin)) { callback.invoke(origin, false, false); return; }
                if (hasLocation()) { callback.invoke(origin, true, false); return; }
                geoOrigin = origin; geoCallback = callback;
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_REQUEST);
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(params.createIntent(), FILE_REQUEST); }
                catch (ActivityNotFoundException e) { fileCallback = null; return false; }
                return true;
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (web.canGoBack()) web.goBack(); else moveTaskToBack(true);
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(startUrl(getIntent()));
    }

    /** URL de inicio, o la que trae una notificación/enlace (solo del propio sitio). */
    private String startUrl(Intent intent) {
        String base = getString(R.string.start_url);
        String target = intent != null ? intent.getStringExtra("url") : null;
        Uri data = intent != null ? intent.getData() : null;
        if (data != null && isOwnHost(data)) return data.toString();
        if (target != null && target.startsWith("/")) return "https://" + getString(R.string.site_host) + target;
        return base;
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent.getStringExtra("url") != null || intent.getData() != null) web.loadUrl(startUrl(intent));
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onResume() {
        super.onResume(); web.onResume();
        if (pendingInstall && (Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls())) { pendingInstall = false; installUpdate(); }
    }
    @Override protected void onDestroy() { if (updateReceiver != null) unregisterReceiver(updateReceiver); super.onDestroy(); }
    @Override protected void onPause() { web.onPause(); CookieManager.getInstance().flush(); super.onPause(); }

    private boolean isOwnHost(Uri uri) {
        String host = uri.getHost();
        return "https".equals(uri.getScheme()) && host != null && (host.equals(getString(R.string.site_host)) || host.equals("www." + getString(R.string.site_host)));
    }
    private boolean isOwnOrigin(String origin) { return origin != null && isOwnHost(Uri.parse(origin)); }

    /** Enlaces externos (WhatsApp, teléfono, Binance, mapas, GitHub…) se abren en su app; el sitio propio sigue en el WebView. */
    private boolean handleExternal(Uri uri) {
        if (isOwnHost(uri)) return false;
        String scheme = uri.getScheme();
        if ("about".equals(scheme) || "file".equals(scheme)) return false;
        try {
            Intent intent;
            if ("intent".equals(scheme)) {
                intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                intent.addCategory(Intent.CATEGORY_BROWSABLE).setComponent(null).setSelector(null);
            } else intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception ignored) { /* sin app para abrirlo */ }
        return true;
    }

    private boolean hasLocation() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == LOCATION_REQUEST && geoCallback != null) { geoCallback.invoke(geoOrigin, hasLocation(), false); geoCallback = null; }
        if (requestCode == NOTIFICATION_REQUEST && pendingPushId != null) { String id = pendingPushId; pendingPushId = null; fetchPushToken(id); }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_REQUEST && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    private void resolve(String id, String value) {
        String js = "window.__de1naNative&&window.__de1naNative.resolve(" + JSONObject.quote(id) + "," + (value == null ? "null" : JSONObject.quote(value)) + ")";
        main.post(() -> web.evaluateJavascript(js, null));
    }

    private long updateDownload = -1;
    private String updateRequest;
    private android.content.BroadcastReceiver updateReceiver;

    private java.io.File updateFile() { return new java.io.File(getExternalFilesDir("updates"), "de1na.apk"); }

    private void startUpdateDownload(String id, String url) {
        try {
            java.io.File file = updateFile();
            if (file.exists()) file.delete();
            android.app.DownloadManager manager = (android.app.DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            android.app.DownloadManager.Request request = new android.app.DownloadManager.Request(Uri.parse(url))
                .setTitle("Actualización de De1na")
                .setDescription("Descargando la nueva versión…")
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationInExternalFilesDir(this, "updates", "de1na.apk");
            updateRequest = id;
            updateDownload = manager.enqueue(request);
            if (updateReceiver == null) {
                updateReceiver = new android.content.BroadcastReceiver() {
                    @Override public void onReceive(Context context, Intent intent) {
                        long done = intent.getLongExtra(android.app.DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                        if (done != updateDownload) return;
                        boolean ok = false;
                        try (android.database.Cursor c = manager.query(new android.app.DownloadManager.Query().setFilterById(done))) {
                            ok = c != null && c.moveToFirst() && c.getInt(c.getColumnIndexOrThrow(android.app.DownloadManager.COLUMN_STATUS)) == android.app.DownloadManager.STATUS_SUCCESSFUL;
                        }
                        if (updateRequest != null) { resolve(updateRequest, ok ? "downloaded" : "error"); updateRequest = null; }
                        if (ok) installUpdate();
                    }
                };
                ContextCompat.registerReceiver(this, updateReceiver, new android.content.IntentFilter(android.app.DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED);
            }
        } catch (Exception e) { resolve(id, "error"); }
    }

    /** Abre el instalador de Android; si falta el permiso de «instalar apps desconocidas», lleva a ese ajuste primero. */
    private void installUpdate() {
        java.io.File file = updateFile();
        if (!file.exists()) return;
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            pendingInstall = true;
            startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            return;
        }
        Uri uri = androidx.core.content.FileProvider.getUriForFile(this, "com.de1na.app.fileprovider", file);
        Intent install = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(install);
    }
    private boolean pendingInstall = false;

    private void fetchPushToken(String id) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            resolve(id, null); return;
        }
        PushService.ensureChannels(this);
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> resolve(id, task.isSuccessful() ? task.getResult() : null));
    }

    /** Puente expuesto a la web. Solo responde si la página es del propio sitio. */
    private class Bridge {
        private boolean trusted() {
            final String[] url = new String[1];
            // getUrl() debe leerse en el hilo principal; los métodos del puente corren en otro hilo.
            java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
            main.post(() -> { url[0] = web.getUrl(); latch.countDown(); });
            try { latch.await(); } catch (InterruptedException e) { return false; }
            return url[0] != null && isOwnHost(Uri.parse(url[0]));
        }

        @JavascriptInterface public int appVersion() { return BuildConfig.APP_VERSION; }

        /** Descarga la actualización dentro de la app y abre el instalador al terminar (solo desde GitHub del proyecto). */
        @JavascriptInterface public void downloadUpdate(String id, String url) {
            if (!trusted() || url == null || !url.startsWith("https://github.com/Maxjose/deuna/releases/download/")) { resolve(id, "error"); return; }
            main.post(() -> startUpdateDownload(id, url));
        }

        /** Vibración táctil nativa al tocar botones (más suave y precisa que navigator.vibrate). */
        @JavascriptInterface public void haptic() {
            main.post(() -> web.performHapticFeedback(android.view.HapticFeedbackConstants.VIRTUAL_KEY));
        }

        @JavascriptInterface public void startTracking(String token, String url, String key) {
            if (!trusted() || !LocationService.validParams(token, url, key)) return;
            Uri data = Uri.parse("de1na-tracking://start").buildUpon().appendQueryParameter("token", token).appendQueryParameter("url", url).appendQueryParameter("key", key).build();
            main.post(() -> startActivity(new Intent(MainActivity.this, TrackingActivity.class).setData(data)));
        }

        @JavascriptInterface public void stopTracking() {
            if (!trusted()) return;
            main.post(() -> stopService(new Intent(MainActivity.this, LocationService.class)));
        }

        @JavascriptInterface public void requestPushToken(String id) {
            if (!trusted()) { resolve(id, null); return; }
            main.post(() -> {
                if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    pendingPushId = id;
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST);
                } else fetchPushToken(id);
            });
        }

        @JavascriptInterface public void readClipboard(String id) {
            if (!trusted()) { resolve(id, null); return; }
            main.post(() -> {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                ClipData clip = clipboard != null ? clipboard.getPrimaryClip() : null;
                CharSequence text = clip != null && clip.getItemCount() > 0 ? clip.getItemAt(0).coerceToText(MainActivity.this) : null;
                resolve(id, text != null ? text.toString() : null);
            });
        }

        @JavascriptInterface public void keepScreenOn(boolean on) {
            if (!trusted()) return;
            main.post(() -> { if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); });
        }
    }
}
