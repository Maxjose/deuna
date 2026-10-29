# De1na · WebApp

Next.js App Router + React + TypeScript. Supabase Auth, PostgreSQL con RLS y Supabase Realtime. Despliegue previsto en Vercel.

## Estado

La aplicación fue migrada desde el prototipo estático. El servidor anterior, la simulación en localStorage y sus pruebas se eliminaron. El proyecto de Vercel `deuna` está creado; todavía no se ha publicado. La conexión con Supabase está pendiente porque se usará otra cuenta.

El código contiene registro, acceso, recuperación de contraseña, sesiones SSR, dashboard por rol, solicitud/aceptación/progreso/cancelación de viajes de prueba y administración de conductores, zonas y horarios. Estas funciones requieren aplicar y verificar el esquema en un proyecto nuevo de Supabase. No se presentan como integración probada hasta completar esa conexión.

## Preparación

Requiere Node.js 24 y npm. En PowerShell usar `npm.cmd` si la política de ejecución bloquea npm.ps1:

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
```

Completar `.env.local` con la URL y la clave **publicable** del proyecto de Supabase elegido. Nunca usar `service_role` ni claves secretas en variables `NEXT_PUBLIC_`.

Antes del primer arranque conectado:

1. Seleccionar o crear el proyecto DeUna en la nueva cuenta. No reutilizar bases de otras aplicaciones.
2. Revisar `supabase/schema.sql`, convertirlo en una migración mediante la CLI de Supabase y aplicarlo al proyecto nuevo. Actualmente es un esquema candidato, no una migración ejecutada. Verificar permisos, RLS y funciones con usuarios de prueba antes del piloto.
3. Habilitar confirmación de correo. Configurar Site URL y redirects exactos `/auth/callback` y `/auth/callback?next=/reset-password` para localhost y el dominio Vercel que se asigne. Configurar SMTP para correos reales.
4. Crear un usuario verificado y asignar el primer administrador por SQL mediante su UUID; el registro público siempre crea pasajeros. No usar metadatos editables para autorizar roles.
5. Configurar las dos variables en los entornos correspondientes de Vercel. Usar un proyecto Supabase separado para pruebas y producción.

```powershell
npm.cmd run dev
```

Abrir http://127.0.0.1:3000. Sin variables configuradas, `/login` muestra el estado de preparación y no ofrece acceso simulado.

## Comprobaciones

```powershell
npm.cmd run build
npm.cmd run typecheck
npm.cmd test
```

La prueba de arranque requiere un build sin variables Supabase y usa el puerto 3187. Comprueba la pantalla sin configuración, redirecciones de acceso y 404. Las pruebas con cuentas reales, RLS, aceptación concurrente, correo y Realtime quedan pendientes de conectar la nueva cuenta.

## Base de datos y seguridad

Tablas: profiles, service_settings y trips. Roles de aplicación no editables desde el registro. Las tablas expuestas tienen RLS y solo lectura autorizada; las mutaciones pasan por una operación transaccional que valida identidad, rol y estado. Índices únicos impiden dos viajes activos por pasajero o conductor. La primera aceptación válida obtiene el viaje.

El esquema serializa las mutaciones del piloto con un bloqueo de transacción. Antes de ampliar carga, medir concurrencia y sustituir el bloqueo global por bloqueos por entidad conservando las restricciones y probando carreras. El esquema todavía necesita ejecución y pruebas contra PostgreSQL.

## Pendientes para operación real

Tarifa y moneda, mapas/geolocalización y cobertura geográfica real, identidad visible del conductor, contactos/soporte, reglas de incidentes, auditoría de eventos, requisitos de incorporación, retención de datos y notificaciones con el teléfono bloqueado. El horario actual es diario en America/Caracas; no hay calendario semanal ni excepciones. La interfaz se identifica como piloto técnico y no ofrece transporte real ni procesa pagos.

Documentación funcional: PLAN_DE_DESARROLLO.md y De1na_Manual_de_Marca.md.
