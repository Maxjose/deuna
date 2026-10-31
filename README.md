# De1na · WebApp

Next.js 16, React 19 y TypeScript. Supabase Auth, PostgreSQL con RLS y Realtime. Vercel conectado a GitHub Maxjose/deuna.

## Estado

Supabase DeUna (yykdfvnihsmwhnpjmdpp) está conectado. La migración inicial fue aplicada a la base vacía. Variables URL y clave publicable configuradas localmente y en Vercel para producción/desarrollo. Preview queda sin credenciales hasta disponer de una base de pruebas separada.

Piloto técnico: solicitudes deshabilitadas por defecto. No hay tarifas, mapas reales ni pagos procesados. El prototipo estático anterior fue eliminado.

## Ejecutar

Node.js 24. Ejecutar npm.cmd ci y npm.cmd run dev. Abrir http://127.0.0.1:3000. En otra instalación, copiar .env.example a .env.local y configurar URL y clave publicable. Nunca usar claves secretas o service_role en variables NEXT_PUBLIC_.

## Configuración pendiente de Auth

Supabase → Authentication → URL Configuration:

- Site URL: https://deuna-five.vercel.app
- Redirect URLs: https://deuna-five.vercel.app/auth/callback y https://deuna-five.vercel.app/auth/callback?next=/reset-password
- Para desarrollo, agregar las mismas rutas bajo http://127.0.0.1:3000

Mantener confirmación de correo y configurar SMTP para usuarios reales. Crear un usuario verificado y asignar el primer administrador por SQL mediante su UUID tras confirmar su identidad. El registro público siempre crea pasajeros. El conector actual no permite editar estos ajustes de Auth.

## Base y comprobaciones

Migración aplicada: supabase/migrations/20261029234734_initial_deuna.sql. No repetirla en la base ya inicializada. Tablas: profiles, service_settings y trips. RLS restringe lectura; las mutaciones verifican identidad y permisos mediante una operación transaccional. Índices únicos limitan a un viaje activo por pasajero y conductor.

Comandos: npm.cmd run build, npm.cmd run typecheck, npm.cmd test.

supabase/tests/operation.sql prueba permisos, aislamiento, bloqueo de escritura directa, rechazo de aceptación repetida y flujo completo. Se ejecutó contra PostgreSQL con rollback de todos los datos temporales. No sustituye carreras simultáneas entre conexiones. La revisión de seguridad no reportó alertas.

La prueba de arranque verifica acceso público, redirecciones sin sesión y 404. Faltan navegador autenticado, confirmación/recuperación por correo y Realtime entre sesiones.

## Antes de operar

Definir tarifa, moneda, soporte, incorporación de conductores, identidad visible del conductor, cobertura geográfica real, auditoría, retención de datos y notificaciones en segundo plano. El horario es diario en America/Caracas. La operación usa un bloqueo transaccional global para el piloto; medir carga antes de ampliarlo.

Referencia funcional: PLAN_DE_DESARROLLO.md y De1na_Manual_de_Marca.md.

El administrador dispone de un control claro/oscuro en la cabecera, tanto en escritorio como en móvil. La preferencia se guarda localmente por usuario y navegador; no cambia el tema del acceso ni el de pasajeros o motorizados. Revisado en navegador: contraste de controles, recarga conservando la elección y retorno al modo claro.

## Catálogo propio de lugares

Administración → Servicio → Catálogo de lugares permite agregar o editar una ficha, fijar su punto en mapa, desactivarla e importar JSON. La búsqueda de viajes combina primero el catálogo activo con Photon, elimina duplicados cercanos del mismo nombre y permite elegir los resultados locales mientras termina la consulta externa. Si falla una fuente, la otra sigue disponible. Los lugares no modifican la red vial ni el cálculo firmado de tarifas.

El contrato está en public/catalog/places.schema.json; ejemplo en public/catalog/places.example.json y guía completa para el script en public/catalog/import-guide.md. No se cargan ejemplos en la base. Archivos de hasta 1.000 lugares/5 MB, bloques atómicos de 100 y reintentos idempotentes. Identidad estable: source + external_id. Los textos opcionales omitidos se vacían; active omitido conserva el estado existente. El panel permite continuar un fallo en el mismo archivo; tras recargar, reimportar con identificadores estables evita duplicados. Validar antes con npm run catalog:validate -- archivo.json (Node 24).

Los datos viven en tablas privadas sin acceso directo del navegador. catalog_admin comprueba el rol real de administrador; catalog_search requiere sesión y devuelve solo fichas activas del área de búsqueda del Zulia. Hay índices trigram para nombres, aliases y direcciones. Verificación transaccional: supabase/tests/catalog.sql; validación, combinación de resultados y CLI: tests/catalog.test.mjs.

## Notificaciones Web Push

Cuenta → Notificaciones registra este dispositivo al pulsar Activar y conceder el permiso del navegador. En iPhone requiere la PWA agregada a inicio (iOS 16.4+). La opción de promociones es independiente y comienza desactivada. Cerrar sesión cancela la suscripción de este dispositivo y cierra sus avisos visibles. No se envían direcciones precisas en avisos de viajes.

Administración → Avisos permite redactar título/mensaje, elegir clientes, motorizados o todos los suscritos y revisar la vista previa con número de usuarios/dispositivos. El envío ocurre solo al pulsar Enviar publicidad. El historial distingue pendientes, aceptadas por proveedor, fallidas y omitidas; no mide lectura ni garantiza entrega en el teléfono. Reintentar la misma confirmación no duplica la campaña. Retención: 30 días.

Los cambios de viajes generan trabajos dentro de la misma transacción: nueva solicitud a conductores aprobados/disponibles sin viaje activo; aceptación/llegada al pasajero; cancelación a la contraparte. Una cola privada comprueba otra vez consentimiento, usuario del dispositivo, estado del viaje y vencimiento antes de reclamar el envío. Hay hasta tres intentos, bloqueo de dos minutos y reintento por cron cada minuto. Los endpoints 404/410 se eliminan; los errores transitorios se reintentan. Pg_net despierta /api/push/dispatch; la cola durable permite recuperarse si la llamada HTTP falla. El service worker abre Inicio al tocar el aviso y el servidor limita endpoints a proveedores conocidos.

Configuración de producción: VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY se generan una sola vez; PUSH_WORKER_KEY debe coincidir con private.push_config.worker_key. Las claves privadas van como secretos exclusivos del servidor en Vercel, sin prefijo NEXT_PUBLIC_ ni copias en previews. El emisor comienza desactivado en private.push_config.enabled hasta provisionar las claves y verificar el despliegue. /api/push/config solo publica la clave VAPID pública. No se usa una clave administrativa de Supabase para enviar.

Pruebas: npm run build, npm test y supabase/tests/web_push.sql (rollback, sin mensajes reales: permisos, endpoint inválido, consentimiento, idempotencia, cambios de viaje, reintentos y suscripciones vencidas). La entrega real requiere una prueba autorizada desde Cuenta en Android/iPhone; no se enviaron promociones reales durante el desarrollo.

Los avisos de acciones se muestran flotantes durante tres segundos y pertenecen a la pantalla que los generó. Se descartan al navegar, incluidas respuestas tardías. Comprobado en navegador con un receptor aislado (ruta temporal eliminada). Servicio ya no solicita ni modifica zonas; conserva los valores históricos de la base sin usarlos como cobertura.

## Experiencia móvil y PWA

Navegación inferior fija en teléfonos, cabecera compacta, áreas táctiles de 54 px, pantalla de cuenta, confirmación de cancelación en hoja modal, navegación compatible con Atrás y estados de carga/conexión. El historial del motorizado muestra únicamente sus viajes asignados.

El manifiesto y los iconos PNG de 192/512 px permiten instalación en navegadores compatibles; en iPhone usar Compartir → Agregar a inicio. La instalación depende del navegador. No se ofrece funcionamiento de viajes sin conexión ni seguimiento en segundo plano. No hay caché de páginas autenticadas en un service worker.

Verificación: build y TypeScript, prueba HTTP del manifiesto/iconos y rutas protegidas; revisión visual del acceso a 390 px. La revisión de todas las pantallas autenticadas y de instalación en dispositivos físicos queda pendiente.

## Identidad del icono

La referencia visual entregada por el usuario define el icono verde: fondo lima, D oscura, carretera curva y marcador de ubicación. La recreación vectorial editable está en public/brand/de1na-icon.svg; es una reconstrucción de la referencia, no el archivo maestro original.

Exportaciones en public/icons: favicon PNG de 16/32 px, iconos de 192/512 px, versión adaptable de Android y apple-touch-icon de 180 px sin transparencia. public/favicon.ico cubre el favicon del sitio. Regenerar con node scripts/generate-icons.mjs (usa sharp incluido en la instalación de Next.js).

PWA: manifiesto standalone, recursos para Android/iOS, registro de service worker y pantalla pública sin conexión. Solo se guarda offline.html; las páginas autenticadas y los datos de viajes no se almacenan en esa caché. En iOS usar Compartir → Agregar a pantalla de inicio; en Android usar Instalar De1na cuando el navegador lo ofrezca o el menú del navegador. La instalación en dispositivos físicos sigue pendiente de verificación.

## Acceso rápido con passkeys

Implementado en Cuenta → Seguridad y acceso rápido: registro, listado y revocación de passkeys. El acceso muestra Entrar con passkey solo si el navegador soporta WebAuthn en contexto seguro y Supabase informa passkeys_enabled=true. El correo y contraseña se conservan. No hay redirección si el SDK no devuelve una sesión verificada.

Activación pendiente en Supabase → Authentication → Passkeys, proyecto yykdfvnihsmwhnpjmdpp:

- Enable Passkey authentication: activado
- Relying Party Display Name: De1na
- Relying Party ID: deuna-five.vercel.app
- Relying Party Origins: https://deuna-five.vercel.app

No usar vercel.app como RP ID ni incluir dominios de previews. Cambiar el RP ID en el futuro requerirá volver a registrar las passkeys. La API de Supabase es experimental. El conector no permite modificar la configuración Auth y el navegador de revisión no tiene sesión del panel de Supabase, por lo que esta activación debe hacerla el propietario.

El frontend detectará la activación al recargar o pulsar Comprobar disponibilidad. Registrar una credencial requiere usuario autenticado y correo confirmado. La biometría/PIN se gestiona en el dispositivo. La aplicación no almacena datos biométricos ni implementa un desbloqueo ficticio con localStorage. Probar registro, salida, entrada, cancelación y revocación en Android/iOS antes de habilitarlo al público.

## Flujo de solicitud por etapas

Viajar presenta una entrada sencilla «¿A dónde quieres ir?». Abre una pantalla con recogida y destino arriba, búsqueda de direcciones y elección opcional en mapa. Después: selección explícita de Moto, mapa de ruta con confirmación y espera de motorizado. La espera se muestra solo tras guardar la solicitud en Supabase; no es un temporizador simulado. Los pasos posteriores existentes no se amplían en esta entrega.

El mapa Leaflet se carga bajo demanda con mosaicos de OpenStreetMap y atribución visible. Photon busca al pulsar «Buscar dirección», sin consultas por cada tecla. Al entrar se intenta localizar la recogida con permiso del navegador; también se puede escribir o fijar en mapa. Las referencias y coordenadas confirmadas se guardan juntas en origen y destino dentro del límite actual de 150 caracteres. No hay selector de zona ni límites geográficos automáticos.

La búsqueda aplica país VE, una envolvente del Zulia y filtro del estado informado por Photon; prioriza la recogida y ordena por cercanía. Si la ubicación está fuera de la región o no está disponible usa El Moján como referencia. La envolvente no es un polígono administrativo exacto ni restringe los viajes elegidos manualmente en mapa. Si no hay coincidencias locales no se muestran alternativas de otros países.

La ruta se obtiene de OSRM con perfil driving y se identifica como ruta de referencia; no constituye navegación específica para motos. No se dibuja una ruta ficticia si el proveedor falla: se permite reintentar y la confirmación exige ruta disponible. Los servicios públicos de Photon, OSRM y mapas son para el concepto; antes de operar debe elegirse un proveedor con capacidad y condiciones adecuadas. NEXT_PUBLIC_GEOCODING_URL, NEXT_PUBLIC_ROUTING_URL y NEXT_PUBLIC_MAP_TILES_URL permiten sustituir los endpoints compatibles (revisar atribución/licencia). No se precargan mapas ni se ofrecen mapas offline.

Verificación: pruebas automatizadas de direcciones, coordenadas, rutas, acceso y destinos; revisión móvil en navegador con búsqueda de lugares, selección de moto y ruta real. La ruta temporal de revisión fue eliminada antes de publicar. La ubicación y experiencia en dispositivos físicos siguen pendientes de prueba.

## Tarifas por recorrido en USD

Servicio → Tarifas de Moto permite definir base, precio por kilómetro y mínimo en dólares. No se carga una tarifa arbitraria: per_km_cents comienza sin configurar y no se permiten solicitudes sin cotización. Fórmula en centavos: máximo de mínimo, 1 centavo y base + redondeo(metros × precio_por_km / 1000).

POST /api/quote requiere sesión verificada, consulta la ruta de OSRM desde el servidor y devuelve geometría, distancia, duración y precio. ROUTING_URL configura el proveedor del servidor; NEXT_PUBLIC_ROUTING_URL solo afecta mapas de seguimiento sin cotización. El perfil driving es una referencia por carretera, no navegación específica para motos. No se calculan cargos por tiempo ni se procesa un cobro electrónico.

Las cotizaciones se firman con HMAC y duran cinco minutos. FARE_SIGNING_KEY es exclusiva del servidor, coincide con private.fare_key y se configura como variable sensible en Vercel producción; nunca usar prefijo NEXT_PUBLIC_. No copiar esta clave a previews. La migración genera la clave privada; provisionarla de forma segura fuera de Git. Las solicitudes verifican firma, usuario y vencimiento. Un identificador único impide reutilizar una cotización. El importe, moneda, distancia y duración quedan guardados en el viaje y no cambian con nuevas tarifas. Los viajes anteriores conservan precios nulos.

Verificación: npm run build, npm test y supabase/tests/route_fares.sql (fixtures con rollback: firma alterada, otro pasajero, solicitud sin cotización, vencimiento, reutilización, importe guardado y permisos de tarifas). Falta una prueba completa con sesión de pasajero y tarifas reales en un teléfono.

## Ubicación en vivo del motorizado

Migración: supabase/migrations/20261031013000_trip_locations.sql. Tabla public.trip_locations con la última posición por viaje; solo se escribe con share_location (motorizado asignado, aprobado, viaje assigned/arrived/ongoing, validación de coordenadas y hora, máximo una escritura cada 2 s). RLS: lee el motorizado, el pasajero de ese viaje y la administración. La fila se borra al finalizar, cancelar o reasignar el viaje. Publicada en supabase_realtime.

El motorizado envía su posición mientras la app está abierta (cada 4 s con movimiento, latido cada 15 s). El pasajero ve el mapa en vivo, la antigüedad de la señal y un tiempo estimado aproximado. Si la migración no está aplicada, la interfaz oculta la función sin errores.

Verificación: tests/trip-locations.sql (rollback: permisos, escritura directa bloqueada, validación, frecuencia, realtime y borrado) y tests/live-location.test.mjs. Con la app minimizada el navegador detiene el envío; la ubicación en segundo plano requiere el servicio nativo del APK.
