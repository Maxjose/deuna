# App Android de De1na (nativa, WebView)

## Seguimiento nativo del pasajero

Después de la asignación, «Seguir viaje desde las notificaciones» solicita permiso e inicia una sincronización temporal del viaje. Cada 20 segundos consulta `/api/trip-live` con la sesión del WebView; el servidor verifica al pasajero y usa RLS. No guarda tokens ni obtiene GPS del pasajero. Muestra una sola notificación que abre el viaje y ofrece «Dejar de seguir».

En Android compatible solicita Live Updates mediante el extra público de Android 36.1; el fabricante y las preferencias del usuario deciden su promoción (incluido Now Bar). En los demás equipos permanece la notificación convencional. El tiempo es aproximado y solo se muestra con GPS del conductor de hasta 30 segundos y precisión de hasta 100 m. Tras un minuto sin respuesta, retira el tiempo y avisa que no hay actualización.

Se detiene al terminar/cancelar, perder autorización, cerrar sesión, por petición del usuario o por el límite del sistema. Usa un servicio `dataSync`, limitado a cinco horas por activación (Android impone además su presupuesto de ejecución). Debe declararse este uso en la sección de servicios en primer plano de Play Console. No se promete supervivencia a «Forzar detención», ahorro agresivo de batería o ausencia de conexión.

GitHub Actions genera APK y AAB del mismo commit/versionCode, comprueba ambas firmas y adjunta SHA256SUMS. En ramas de revisión solo sube artefactos; la publicación de la release queda restringida a main.

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

## Live Updates del conductor
Al pulsar Mantener ubicación activa, las versiones nuevas pasan el ID del viaje al servicio LOCATION existente y este actualiza su misma notificación con Recoger al pasajero, En la recogida o Llevar al pasajero. No inicia un segundo servicio ni añade permisos. El servidor exige sesión y coincidencia con driver_id; pasajeros siguen limitados a passenger_id. La notificación abre el viaje, ofrece Detener y deja de promoverse tras un minuto sin estado reciente. Finalización, cancelación, pérdida de autorización y cierre de sesión detienen el seguimiento. Mantiene compatibilidad con APK anteriores sin el puente nuevo.

Para Play Console: declarar DATA_SYNC para la sincronización del pasajero y LOCATION para ubicación/seguimiento del conductor. Incluir demostraciones separadas de activación voluntaria, funcionamiento al minimizar, notificación y detención. La aparición en Now Bar depende del equipo, Android y permisos. Probar ambos roles en un teléfono antes de presentar la versión en Play.
