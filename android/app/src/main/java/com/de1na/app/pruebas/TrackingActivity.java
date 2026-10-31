package com.de1na.app.pruebas;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.widget.Toast;

import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.List;

/**
 * Recibe de la web (dentro de la TWA) la orden de iniciar o detener el envío de ubicación en segundo plano:
 * de1na-tracking://start?token=...&url=...&key=...  ·  de1na-tracking://stop
 * Pide los permisos que falten, arranca el servicio y se cierra al instante.
 */
public class TrackingActivity extends Activity {
    private static final int PERMISSIONS_REQUEST = 41;
    private Uri pending;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handle(getIntent() != null ? getIntent().getData() : null);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handle(intent.getData());
    }

    private void handle(Uri data) {
        if (data == null || !"de1na-tracking".equals(data.getScheme())) { finish(); return; }
        if ("stop".equals(data.getHost())) {
            stopService(new Intent(this, LocationService.class));
            finish();
            return;
        }
        if (!"start".equals(data.getHost()) || !LocationService.validParams(data.getQueryParameter("token"), data.getQueryParameter("url"), data.getQueryParameter("key"))) {
            Toast.makeText(this, "No se pudo activar la ubicación en segundo plano.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        List<String> missing = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.ACCESS_FINE_LOCATION);
            missing.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (missing.isEmpty()) { start(data); return; }
        pending = data;
        requestPermissions(missing.toArray(new String[0]), PERMISSIONS_REQUEST);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != PERMISSIONS_REQUEST || pending == null) { finish(); return; }
        boolean location = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (location) start(pending);
        else {
            Toast.makeText(this, "Sin permiso de ubicación no podemos compartir tu posición con el pasajero.", Toast.LENGTH_LONG).show();
            finish();
        }
        pending = null;
    }

    private void start(Uri data) {
        Intent service = new Intent(this, LocationService.class)
            .setAction(LocationService.ACTION_START)
            .putExtra(LocationService.EXTRA_TOKEN, data.getQueryParameter("token"))
            .putExtra(LocationService.EXTRA_URL, data.getQueryParameter("url"))
            .putExtra(LocationService.EXTRA_KEY, data.getQueryParameter("key"));
        ContextCompat.startForegroundService(this, service);
        Toast.makeText(this, "Ubicación del viaje activa también con la pantalla apagada.", Toast.LENGTH_SHORT).show();
        finish();
    }
}
