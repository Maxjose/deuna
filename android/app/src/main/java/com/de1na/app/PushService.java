package com.de1na.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Recibe las notificaciones de De1na (FCM, mensajes de datos) y las muestra aunque la app esté cerrada. */
public class PushService extends FirebaseMessagingService {
    static final String TRIPS = "trips", PROMOS = "promotions";

    static void ensureChannels(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel trips = new NotificationChannel(TRIPS, "Viajes", NotificationManager.IMPORTANCE_HIGH);
        trips.setDescription("Solicitudes y cambios de tus viajes");
        manager.createNotificationChannel(trips);
        manager.createNotificationChannel(new NotificationChannel(PROMOS, "Promociones", NotificationManager.IMPORTANCE_DEFAULT));
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        String title = data.containsKey("title") ? data.get("title") : "De1na";
        String body = data.containsKey("body") ? data.get("body") : "";
        String tag = data.containsKey("tag") ? data.get("tag") : "de1na";
        String url = data.containsKey("url") ? data.get("url") : "/dashboard#home";
        ensureChannels(this);
        Intent open = new Intent(this, MainActivity.class).putExtra("url", url).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(this, tag.hashCode(), open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        boolean promo = tag.startsWith("promotion");
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, promo ? PROMOS : TRIPS)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(getColor(R.color.ink))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(promo ? NotificationCompat.PRIORITY_DEFAULT : NotificationCompat.PRIORITY_HIGH)
            .setCategory(promo ? NotificationCompat.CATEGORY_PROMO : NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(pending);
        try { NotificationManagerCompat.from(this).notify(tag, 1, builder.build()); } catch (SecurityException ignored) { /* sin permiso */ }
    }

    @Override public void onNewToken(@NonNull String token) { /* la web vuelve a registrar el token al abrir la app */ }
}
