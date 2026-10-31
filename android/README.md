# De1na Pruebas (TWA)

App Android de pruebas que abre https://deuna-five.vercel.app a pantalla completa (Trusted Web Activity).
Paquete `com.de1na.app.pruebas`. No es la app oficial: la versión oficial tendrá su propio dominio, paquete y clave.

## Compilación

GitHub Actions (`.github/workflows/android-pruebas.yml`) compila y firma el APK al cambiar `android/` o al
ejecutarlo a mano desde la pestaña Actions. El APK queda en la versión **apk-pruebas** de GitHub (Releases).

Secretos del repositorio necesarios (Settings → Secrets and variables → Actions):

- `TWA_PRUEBAS_KEYSTORE_B64`: el archivo de firma `.jks` en base64.
- `TWA_PRUEBAS_KEYSTORE_PASSWORD`: su contraseña (alias `pruebas`).

La huella SHA-256 de esa clave está en `public/.well-known/assetlinks.json`; el flujo comprueba que coincidan.
Sin esa verificación Android muestra la barra de direcciones.

## Incluye

- Notificaciones web delegadas a la app y delegación de ubicación (permiso de ubicación de Android).
- Pantalla de inicio con el icono y colores de la marca.
- La web se abre con `?source=twa` para poder distinguirla del navegador.

## Ubicación en segundo plano

`LocationService` es un servicio en primer plano (aviso fijo "Compartiendo tu ubicación") que envía la
posición del conductor a `share_location_token` aunque la app esté minimizada o la pantalla apagada.
La web, dentro de la TWA, muestra el botón "Mantener ubicación activa": pide un token ligado al viaje
(`issue_tracking_token`) y abre `de1na-tracking://start` (`TrackingActivity`), que solicita los permisos
y arranca el servicio. El servicio se detiene solo cuando el viaje termina, se cancela o se reasigna
(el servidor rechaza el token), o con el botón "Detener" del aviso.
