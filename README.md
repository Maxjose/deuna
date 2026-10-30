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

## Experiencia móvil y PWA

Navegación inferior fija en teléfonos, cabecera compacta, áreas táctiles de 54 px, pantalla de cuenta, confirmación de cancelación en hoja modal, navegación compatible con Atrás y estados de carga/conexión. El historial del motorizado muestra únicamente sus viajes asignados.

El manifiesto y los iconos PNG de 192/512 px permiten instalación en navegadores compatibles; en iPhone usar Compartir → Agregar a inicio. La instalación depende del navegador. No se ofrece funcionamiento de viajes sin conexión ni seguimiento en segundo plano. No hay caché de páginas autenticadas en un service worker.

Verificación: build y TypeScript, prueba HTTP del manifiesto/iconos y rutas protegidas; revisión visual del acceso a 390 px. La revisión de todas las pantallas autenticadas y de instalación en dispositivos físicos queda pendiente.

## Identidad del icono

La referencia visual entregada por el usuario define el icono verde: fondo lima, D oscura, carretera curva y marcador de ubicación. La recreación vectorial editable está en public/brand/de1na-icon.svg; es una reconstrucción de la referencia, no el archivo maestro original.

Exportaciones en public/icons: favicon PNG de 16/32 px, iconos de 192/512 px, versión adaptable de Android y apple-touch-icon de 180 px sin transparencia. public/favicon.ico cubre el favicon del sitio. Regenerar con node scripts/generate-icons.mjs (usa sharp incluido en la instalación de Next.js).

PWA: manifiesto standalone, recursos para Android/iOS, registro de service worker y pantalla pública sin conexión. Solo se guarda offline.html; las páginas autenticadas y los datos de viajes no se almacenan en esa caché. En iOS usar Compartir → Agregar a pantalla de inicio; en Android usar Instalar De1na cuando el navegador lo ofrezca o el menú del navegador. La instalación en dispositivos físicos sigue pendiente de verificación.
