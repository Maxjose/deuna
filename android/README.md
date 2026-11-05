# App Android de De1na (nativa, WebView)

App propia (com.de1na.app) que muestra https://de1na.app en un WebView a pantalla completa.

- Pantalla de inicio nativa y puente window.De1naNative para portapapeles, permisos, notificaciones FCM y mantener la pantalla encendida.
- Ubicación del conductor en segundo plano durante el viaje mediante LocationService, con aviso fijo y opción Detener. Se activa desde Mantener ubicación activa.
- Notificaciones convencionales mediante Firebase Cloud Messaging (PushService).
- Enlaces externos abiertos en sus aplicaciones correspondientes.

El manifiesto conserva los permisos de notificaciones convencionales, ubicación y servicio en primer plano de ubicación que necesita el seguimiento original del conductor. No incluye permiso de notificaciones promovidas ni servicio de sincronización de datos para el pasajero.

GitHub Actions genera y firma APK y AAB del mismo commit/versionCode, verifica ambas firmas y genera SHA256SUMS. La release apk-pruebas publica de1na.apk y de1na.aab solo desde main. Usa los secretos TWA_PRUEBAS_KEYSTORE_B64 y TWA_PRUEBAS_KEYSTORE_PASSWORD. app/google-services.json contiene la configuración pública de Firebase.

En modo subscription (pago directo al conductor), Cuenta no muestra Mi saldo ni su panel. En modo commission, desactivar recargas conserva el acceso a fondos existentes.