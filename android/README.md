# App Android de De1na (nativa, WebView)

App propia (`com.de1na.app`) que muestra https://de1na.app en un WebView a pantalla completa:

- Pantalla de inicio nativa (SplashScreen API) que se mantiene hasta que la web cargó; sin avisos ni barras de Chrome.
- Puente `window.De1naNative` (ver `src/lib/native.ts`): GPS en segundo plano durante el viaje (`LocationService`),
  token de notificaciones FCM, portapapeles y mantener la pantalla encendida. Solo responde a páginas de de1na.app.
- Notificaciones por Firebase Cloud Messaging (`PushService`). El servidor envía por FCM a los dispositivos
  `fcm:<token>` con la cuenta de servicio de la variable `FIREBASE_SERVICE_ACCOUNT` (Vercel) y por web push al resto.
- Enlaces externos (WhatsApp, teléfono, Binance, Google Maps, descargas) se abren en su app.

Se compila y firma en GitHub Actions (`.github/workflows/android-pruebas.yml`) con los secretos
`TWA_PRUEBAS_KEYSTORE_B64` y `TWA_PRUEBAS_KEYSTORE_PASSWORD`, y se publica en la versión `apk-pruebas` como `de1na.apk`.
`app/google-services.json` es la configuración pública del proyecto de Firebase `de1na-app`.
