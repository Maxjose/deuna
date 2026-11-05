package com.de1na.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.webkit.CookieManager;
import androidx.core.app.NotificationCompat;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/** Sincronización iniciada por el pasajero; no obtiene ubicación ni guarda credenciales. */
public class TripLiveService extends Service {
    private static final int ID = 4202;
    private static final String CHANNEL = "live-trip";
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private volatile String trip;
    private volatile boolean stopped;
    private long lastSuccess;
    private long started;
    private String origin;

    @Override public void onCreate() {
        super.onCreate();
        origin = "https://" + getString(R.string.site_host);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Seguimiento de tu viaje", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setSound(null, null);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "stop".equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        String next = intent == null ? null : intent.getStringExtra("trip");
        if (next == null || !next.matches("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")) { stopSelf(); return START_NOT_STICKY; }
        boolean first = trip == null;
        trip = next;
        started = System.currentTimeMillis();
        lastSuccess = 0;
        startForeground(ID, notification("Consultando tu viaje", "Conectando con De1na…", null, false));
        if (first) worker.scheduleWithFixedDelay(this::refresh, 0, 20, TimeUnit.SECONDS);
        return START_NOT_STICKY;
    }

    private void refresh() {
        String current = trip;
        if (stopped || current == null) return;
        // El seguimiento es temporal: no mantiene una sincronización indefinida en segundo plano.
        if (System.currentTimeMillis() - started > TimeUnit.HOURS.toMillis(5)) { stopSelf(); return; }
        HttpURLConnection connection = null;
        try {
            String cookies = CookieManager.getInstance().getCookie(origin);
            if (cookies == null || cookies.isEmpty()) { stopSelf(); return; }
            connection = (HttpURLConnection) new URL(origin + "/api/trip-live?id=" + current).openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(8000); connection.setReadTimeout(8000);
            connection.setRequestProperty("Cookie", cookies);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cache-Control", "no-cache");
            int code = connection.getResponseCode();
            if (code == 401 || code == 403 || code == 404) { stopSelf(); return; }
            if (code != 200) throw new java.io.IOException("state unavailable");
            byte[] bytes;
            try (java.io.InputStream stream = connection.getInputStream(); java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream()) {
                byte[] chunk = new byte[1024]; int count;
                while ((count = stream.read(chunk)) != -1) {
                    buffer.write(chunk, 0, count);
                    if (buffer.size() > 8192) throw new java.io.IOException("response too large");
                }
                bytes = buffer.toByteArray();
            }
            if (bytes.length > 8192) throw new java.io.IOException("response too large");
            JSONObject state = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            if (stopped || !current.equals(trip)) return;
            String status = state.optString("status");
            if (!status.equals("assigned") && !status.equals("arrived") && !status.equals("ongoing")) { stopSelf(); return; }
            // Conserva las renovaciones de sesión emitidas por el servidor.
            for (java.util.Map.Entry<String, java.util.List<String>> header : connection.getHeaderFields().entrySet()) {
                if ("Set-Cookie".equalsIgnoreCase(header.getKey()))
                    for (String cookie : header.getValue()) CookieManager.getInstance().setCookie(origin, cookie);
            }
            lastSuccess = System.currentTimeMillis();
            String chip = status.equals("arrived") ? "Llegó" : state.isNull("eta") ? "En viaje" : state.optInt("eta") + " min";
            show(notification(state.getString("title"), state.getString("body"), chip, true));
        } catch (Exception ignored) {
            if (!stopped && current.equals(trip) && System.currentTimeMillis() - lastSuccess > 60000)
                show(notification("Tu viaje en De1na", "Sin actualización reciente. Abre la app para comprobar el viaje.", null, false));
        } finally { if (connection != null) connection.disconnect(); }
    }

    private Notification notification(String title, String body, String chip, boolean live) {
        Intent open = new Intent(this, MainActivity.class).putExtra("url", "/dashboard#home")
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(this, ID, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stop = PendingIntent.getService(this, ID, new Intent(this, TripLiveService.class).setAction("stop"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Bundle extras = new Bundle();
        // Clave pública de Android 36.1: compatible con compileSdk 36 y equipos anteriores.
        extras.putBoolean("android.requestPromotedOngoing", live);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification).setContentTitle(title).setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(content).addAction(0, "Dejar de seguir", stop).addExtras(extras);
        Notification notification = builder.build();
        if (Build.VERSION.SDK_INT >= 36 && chip != null) {
            notification = Notification.Builder.recoverBuilder(this, notification).setShortCriticalText(chip).build();
        }
        return notification;
    }

    private void show(Notification notification) {
        if (!stopped) getSystemService(NotificationManager.class).notify(ID, notification);
    }
    @Override public void onTimeout(int startId, int fgsType) { stopSelf(); }
    @Override public void onDestroy() {
        stopped = true;
        worker.shutdownNow();
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
