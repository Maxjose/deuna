package com.de1na.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Scanner;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Servicio en primer plano que envía la posición del conductor a Supabase (share_location_token)
 * aunque la app esté minimizada o la pantalla apagada. Se detiene solo cuando el viaje termina.
 */
public class LocationService extends Service implements LocationListener {
    static final String ACTION_START = "com.de1na.app.TRACKING_START";
    static final String ACTION_STOP = "com.de1na.app.TRACKING_STOP";
    static final String EXTRA_TOKEN = "token";
    static final String EXTRA_URL = "url";
    static final String EXTRA_KEY = "key";
    private static final String CHANNEL = "trip_location";
    private static final int NOTIFICATION_ID = 4101;
    private static final long MIN_INTERVAL_MS = 4000;
    private static final long HEARTBEAT_MS = 15000;
    private static final float MIN_DISTANCE_M = 10f;
    private static final float MAX_ACCURACY_M = 1000f;

    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private LocationManager locations;
    private String token, endpoint, apiKey;
    private Location latest, lastSent;
    private long lastSentAt;
    private boolean sending;
    private String tripId, tripTitle = "Compartiendo tu ubicación", tripBody = "El pasajero ve tu posición durante el viaje.", tripChip;
    private boolean refreshing;
    private long lastStateAt;

    private final Runnable heartbeat = new Runnable() {
        @Override public void run() {
            if (latest != null && SystemClock.elapsedRealtime() - lastSentAt >= HEARTBEAT_MS) send(latest);
            refreshTrip();
            handler.postDelayed(this, HEARTBEAT_MS);
        }
    };

    static boolean validParams(String token, String url, String key) {
        if (token == null || !token.matches("^[0-9a-f]{64}$") || key == null || key.isEmpty() || url == null) return false;
        Uri parsed = Uri.parse(url);
        return "https".equals(parsed.getScheme()) && parsed.getHost() != null && parsed.getHost().endsWith(".supabase.co");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) { stopTracking(); return START_NOT_STICKY; }
        String newToken = intent.getStringExtra(EXTRA_TOKEN), url = intent.getStringExtra(EXTRA_URL), key = intent.getStringExtra(EXTRA_KEY);
        if (!validParams(newToken, url, key)) { stopTracking(); return START_NOT_STICKY; }
        token = newToken;
        tripId = intent.getStringExtra("trip");
        if(tripId!=null&&!tripId.matches("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}"))tripId=null;
        tripTitle="Compartiendo tu ubicación";tripBody="Consultando el estado de tu viaje…";tripChip=null;lastStateAt=0;
        endpoint = url.replaceAll("/+$", "") + "/rest/v1/rpc/share_location_token";
        apiKey = key;
        lastSent = null;
        lastSentAt = 0;
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        else startForeground(NOTIFICATION_ID, notification());
        requestUpdates();
        refreshTrip();
        handler.removeCallbacks(heartbeat);
        handler.postDelayed(heartbeat, HEARTBEAT_MS);
        return START_NOT_STICKY;
    }

    @SuppressLint("MissingPermission")
    private void requestUpdates() {
        boolean fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) { stopTracking(); return; }
        if (locations == null) locations = (LocationManager) getSystemService(LOCATION_SERVICE);
        locations.removeUpdates(this);
        boolean any = false;
        if (fine && locations.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, MIN_INTERVAL_MS, 0f, this, Looper.getMainLooper());
            any = true;
        }
        if (locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            locations.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, MIN_INTERVAL_MS, 0f, this, Looper.getMainLooper());
            any = true;
        }
        if (!any) { stopTracking(); return; }
        for (String provider : new String[] { LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER }) {
            try {
                Location known = locations.getLastKnownLocation(provider);
                if (known != null && (latest == null || known.getTime() > latest.getTime())) latest = known;
            } catch (SecurityException ignored) { }
        }
    }

    @Override
    public void onLocationChanged(Location location) {
        if (location == null || !location.hasAccuracy() || location.getAccuracy() > MAX_ACCURACY_M) return;
        // Preferir el GPS: ignora una posición de red peor que la última reciente.
        if (latest != null && location.getAccuracy() > latest.getAccuracy() * 2 && location.getTime() - latest.getTime() < 10000) return;
        latest = location;
        long elapsed = SystemClock.elapsedRealtime() - lastSentAt;
        boolean moved = lastSent == null || lastSent.distanceTo(location) >= MIN_DISTANCE_M;
        if (lastSentAt == 0 || elapsed >= HEARTBEAT_MS || (elapsed >= MIN_INTERVAL_MS && moved)) send(location);
    }

    private void send(Location location) {
        if (sending || token == null) return;
        sending = true;
        lastSentAt = SystemClock.elapsedRealtime();
        lastSent = location;
        final String body;
        try {
            JSONObject json = new JSONObject()
                .put("token", token)
                .put("latitude", location.getLatitude())
                .put("longitude", location.getLongitude())
                .put("accuracy", Math.round(location.getAccuracy() * 10) / 10.0);
            if (location.hasBearing() && location.getBearing() >= 0 && location.getBearing() < 360) json.put("heading", location.getBearing());
            if (location.hasSpeed() && location.getSpeed() >= 0 && location.getSpeed() <= 100) json.put("speed", location.getSpeed());
            body = json.toString();
        } catch (Exception e) { sending = false; return; }
        final String url = endpoint, key = apiKey;
        network.execute(() -> {
            boolean finished = false;
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setRequestProperty("apikey", key);
                try (OutputStream out = connection.getOutputStream()) { out.write(body.getBytes(StandardCharsets.UTF_8)); }
                int code = connection.getResponseCode();
                if (code >= 400) {
                    InputStream error = connection.getErrorStream();
                    String text = "";
                    if (error != null) { try (Scanner scanner = new Scanner(error, "UTF-8").useDelimiter("\\A")) { text = scanner.hasNext() ? scanner.next() : ""; } }
                    // Viaje terminado/cancelado o token caducado: dejar de enviar.
                    finished = text.contains("ya no comparte") || text.contains("Token inv");
                }
            } catch (Exception ignored) {
                // Sin conexión: se reintenta con la siguiente posición o el latido.
            } finally {
                if (connection != null) connection.disconnect();
            }
            final boolean stop = finished;
            handler.post(() -> { sending = false; if (stop) stopTracking(); });
        });
    }

    private void refreshTrip() {
        if(token==null||tripId==null||refreshing)return;
        if(lastStateAt>0&&SystemClock.elapsedRealtime()-lastStateAt>60000){
            tripTitle="Tu viaje en De1na";tripBody="Sin estado reciente. Abre la app para comprobar el viaje.";tripChip=null;
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION_ID,notification());
        }
        refreshing=true;
        final String current=tripId;
        network.execute(()->{
            HttpURLConnection connection=null;
            try{
                String origin="https://"+getString(R.string.site_host);
                String cookies=android.webkit.CookieManager.getInstance().getCookie(origin);
                if(cookies==null||cookies.isEmpty())throw new java.io.IOException("No session");
                connection=(HttpURLConnection)new URL(origin+"/api/trip-live?id="+current+"&viewer=driver").openConnection();
                connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(8000);connection.setReadTimeout(8000);
                connection.setRequestProperty("Cookie",cookies);connection.setRequestProperty("Cache-Control","no-cache");
                int code=connection.getResponseCode();
                if(code==401||code==403||code==404){handler.post(()->{if(current.equals(tripId))stopTracking();});return;}
                if(code!=200)throw new java.io.IOException("State unavailable");
                java.io.ByteArrayOutputStream buffer=new java.io.ByteArrayOutputStream();
                try(InputStream stream=connection.getInputStream()){
                    byte[] chunk=new byte[1024];int count;
                    while((count=stream.read(chunk))!=-1){buffer.write(chunk,0,count);if(buffer.size()>8192)throw new java.io.IOException("Response too large");}
                }
                JSONObject state=new JSONObject(new String(buffer.toByteArray(),StandardCharsets.UTF_8));
                for(java.util.Map.Entry<String,java.util.List<String>> header:connection.getHeaderFields().entrySet())
                    if("Set-Cookie".equalsIgnoreCase(header.getKey()))for(String cookie:header.getValue())android.webkit.CookieManager.getInstance().setCookie(origin,cookie);
                handler.post(()->{
                    if(token==null||!current.equals(tripId))return;
                    String status=state.optString("status");
                    if(!status.equals("assigned")&&!status.equals("arrived")&&!status.equals("ongoing")){stopTracking();return;}
                    tripTitle=state.optString("title");tripBody=state.optString("body");
                    tripChip=status.equals("arrived")?"Llegó":state.isNull("eta")?"En viaje":state.optInt("eta")+" min";
                    lastStateAt=SystemClock.elapsedRealtime();
                    ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION_ID,notification());
                });
            }catch(Exception ignored){ /* El siguiente latido reintenta sin interrumpir el envío GPS. */ }
            finally{if(connection!=null)connection.disconnect();handler.post(()->refreshing=false);}
        });
    }

    private Notification notification() {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && manager.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Viaje en curso", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Aviso mientras compartes tu ubicación con el pasajero");
            manager.createNotificationChannel(channel);
        }
        int flags = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        Intent open = new Intent(this,MainActivity.class).putExtra("url","/dashboard#home").addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openApp = open == null ? null : PendingIntent.getActivity(this, 0, open, flags);
        PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, LocationService.class).setAction(ACTION_STOP), flags);
        Bundle extras=new Bundle();
        extras.putBoolean("android.requestPromotedOngoing",lastStateAt>0&&SystemClock.elapsedRealtime()-lastStateAt<=60000);
        Notification result = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(tripTitle)
            .setContentText(tripBody)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(tripBody))
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setShowWhen(false).addExtras(extras)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openApp)
            .addAction(0, "Detener", stop)
            .build();
        if(Build.VERSION.SDK_INT>=36&&tripChip!=null)result=Notification.Builder.recoverBuilder(this,result).setShortCriticalText(tripChip).build();
        return result;
    }

    private void stopTracking() {
        handler.removeCallbacks(heartbeat);
        if (locations != null) locations.removeUpdates(this);
        token = null;
        tripId = null;
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
        stopSelf();
    }

    @Override public void onDestroy() { token=null;tripId=null;handler.removeCallbacks(heartbeat); if (locations != null) locations.removeUpdates(this); network.shutdownNow();stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy(); }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
    @Override public void onProviderEnabled(String provider) { if (token != null) requestUpdates(); }
    @Override public void onProviderDisabled(String provider) { }
    @Override public IBinder onBind(Intent intent) { return null; }
}
