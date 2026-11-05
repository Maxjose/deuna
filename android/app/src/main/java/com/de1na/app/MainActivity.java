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
    private String pendingLiveTrip;
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
        // Passkeys: el WebView usa el administrador de credenciales de Android (mismas passkeys que Chrome / Google).
        if (androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.WEB_AUTHENTICATION)) {
            androidx.webkit.WebSettingsCompat.setWebAuthenticationSupport(s, androidx.webkit.WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP);
        }
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
    @Override protected void onResume() { super.onResume(); web.onResume(); }

    private void openStore() {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
        catch (ActivityNotFoundException e) { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + getPackageName()))); }
    }
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
        if (requestCode == 55 && pendingLiveTrip != null) {
            String trip = pendingLiveTrip; pendingLiveTrip = null;
            if (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) beginLiveTrip(trip);
        }
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

    private void beginLiveTrip(String trip) {
        try { ContextCompat.startForegroundService(this, new Intent(this, TripLiveService.class).putExtra("trip", trip)); }
        catch (RuntimeException error) { android.widget.Toast.makeText(this,"Abre el viaje y vuelve a activar su notificación.",android.widget.Toast.LENGTH_LONG).show(); }
    }

    private static final int PLAY_UPDATE_REQUEST = 54;

    /** Actualizaciones solo por Google Play (In-App Updates). */
    private com.google.android.play.core.appupdate.AppUpdateManager playUpdates() {
        return com.google.android.play.core.appupdate.AppUpdateManagerFactory.create(this);
    }

    private void fetchPushToken(String id) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            resolve(id, null); return;
        }
        PushService.ensureChannels(this);
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> resolve(id, task.isSuccessful() ? task.getResult() : null));
    }

    /** Puente expuesto a la web. Solo responde si la página es del propio sitio. */
    private class Bridge {
        @JavascriptInterface public String liveTripStatus(String trip) {
            if(!trusted())return "inactive";
            android.app.NotificationManager manager=getSystemService(android.app.NotificationManager.class);
            if(!manager.areNotificationsEnabled())return "blocked";
            if(Build.VERSION.SDK_INT>=26){
                android.app.NotificationChannel channel=manager.getNotificationChannel("live-trip");
                if(channel!=null&&channel.getImportance()==android.app.NotificationManager.IMPORTANCE_NONE)return "blocked";
            }
            return trip!=null&&trip.equals(TripLiveService.activeTripId)?"active":"inactive";
        }
        @JavascriptInterface public void openNotificationSettings() {
            if(!trusted())return;
            main.post(()->{
                Intent settings=Build.VERSION.SDK_INT>=26
                    ?new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,getPackageName())
                    :new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName()));
                startActivity(settings);
            });
        }
        @JavascriptInterface public void startLiveTrip(String trip) {
            if (!trusted() || trip == null || !trip.matches("[0-9a-fA-F-]{36}")) return;
            main.post(() -> {
                if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    pendingLiveTrip = trip;
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 55);
                } else beginLiveTrip(trip);
            });
        }
        @JavascriptInterface public void stopLiveTrip() {
            if (trusted()) main.post(() -> stopService(new Intent(MainActivity.this, TripLiveService.class)));
        }
        private boolean trusted() {
            final String[] url = new String[1];
            // getUrl() debe leerse en el hilo principal; los métodos del puente corren en otro hilo.
            java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
            main.post(() -> { url[0] = web.getUrl(); latch.countDown(); });
            try { latch.await(); } catch (InterruptedException e) { return false; }
            return url[0] != null && isOwnHost(Uri.parse(url[0]));
        }

        @JavascriptInterface public int appVersion() { return BuildConfig.APP_VERSION; }

        /** Identificador del teléfono para esta app (limita la prueba gratis a una por dispositivo). */
        @JavascriptInterface public String deviceId() {
            if (!trusted()) return "";
            String id = android.provider.Settings.Secure.getString(getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);
            return id == null ? "" : "android:" + id;
        }

        /** Consulta en Google Play si hay una versión nueva: responde el versionCode disponible o "none". */
        @JavascriptInterface public void checkPlayUpdate(String id) {
            if (!trusted()) { resolve(id, "none"); return; }
            main.post(() -> playUpdates().getAppUpdateInfo()
                .addOnSuccessListener(info -> resolve(id, info.updateAvailability() == com.google.android.play.core.install.model.UpdateAvailability.UPDATE_AVAILABLE ? String.valueOf(info.availableVersionCode()) : "none"))
                .addOnFailureListener(e -> resolve(id, "none")));
        }

        /** Abre la actualización de Google Play dentro de la app; si no se puede, abre la ficha de la tienda. */
        @JavascriptInterface public void startPlayUpdate() {
            if (!trusted()) return;
            main.post(() -> playUpdates().getAppUpdateInfo().addOnSuccessListener(info -> {
                boolean ok = false;
                if (info.updateAvailability() == com.google.android.play.core.install.model.UpdateAvailability.UPDATE_AVAILABLE
                    && info.isUpdateTypeAllowed(com.google.android.play.core.install.model.AppUpdateType.IMMEDIATE)) {
                    try { ok = playUpdates().startUpdateFlowForResult(info, com.google.android.play.core.install.model.AppUpdateType.IMMEDIATE, MainActivity.this, PLAY_UPDATE_REQUEST); }
                    catch (Exception ignored) { ok = false; }
                }
                if (!ok) openStore();
            }).addOnFailureListener(e -> openStore()));
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

        @JavascriptInterface public void startDriverTracking(String token, String url, String key, String trip) {
            if (!trusted() || !LocationService.validParams(token,url,key) || trip == null || !trip.matches("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")) return;
            Uri data = Uri.parse("de1na-tracking://start").buildUpon().appendQueryParameter("token",token).appendQueryParameter("url",url).appendQueryParameter("key",key).appendQueryParameter("trip",trip).build();
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
