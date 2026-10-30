# De1na — Plan inicial de desarrollo

Fecha: 29 de octubre de 2026.
Estado: plan inicial actualizado con las decisiones del usuario; reglas detalladas pendientes.

## Decisiones confirmadas por el usuario

- Plataforma inicial: WebApp.
- Acceso inicial: correo y contraseña, confirmado por el usuario.
- Cobertura y horarios configurables desde el panel de administración.
- Los conductores pueden aceptar solicitudes de viaje.
- Tarifas: se definirán más adelante a partir de una ruta previa; el cálculo automático queda para una etapa posterior. Aún no hay un mecanismo provisional de precio ni moneda acordados.
- Pago inicial directo al motorizado; las ampliaciones del sistema de pagos quedan para después. No se ha definido comisión.

### Siguiente entregable: especificación y prototipo del MVP

Propuesta: una WebApp adaptable a celulares con accesos por rol para pasajero, conductor y administrador.

Pantallas iniciales propuestas:

1. Pasajero: acceso, origen/destino con referencias, confirmación de solicitud, estado del viaje, conductor asignado e historial.
2. Conductor: acceso, disponibilidad, solicitudes disponibles, detalle del viaje y acciones de llegada, inicio y finalización.
3. Administrador: conductores y aprobaciones, cobertura, horarios, viajes y atención de incidencias.

Reglas propuestas para validar en el prototipo:

- La primera aceptación que el servidor confirme obtiene el viaje; las demás reciben aviso de que ya fue tomado.
- Solo conductores aprobados y disponibles pueden aceptar; un conductor no puede tener dos viajes activos.
- Fuera de cobertura u horario se informa la restricción antes de solicitar. Falta definir límites geográficos, días, excepciones y tratamiento de viajes ya iniciados. Usar la zona horaria America/Caracas.
- El pago se realiza directamente al motorizado. Finalizar el viaje no equivale a verificar electrónicamente un pago.
- Hasta acordar tarifas, el prototipo muestra una indicación explícita de precio pendiente de definición y no permite confundirlo con una cotización real. El piloto real requiere resolver cómo se comunica y acepta el precio.
- El prototipo debe probar recepción de solicitudes y recuperación de conexión en teléfonos reales; aún no se promete funcionamiento del conductor con la WebApp cerrada o el teléfono bloqueado.

Pendientes inmediatos: requisitos de aprobación de conductores, mecanismo provisional de tarifa y moneda, canal de soporte y reglas de cancelación/vencimiento. Estas decisiones no impiden dibujar el prototipo, pero sí condicionan la implementación y el piloto real.

### Alcance del primer prototipo navegable

- Acceso: registro de pasajero, inicio de sesión con correo y contraseña, recuperación de contraseña y cierre de sesión. Propuesta: verificar correo antes de solicitar un viaje real.
- Pasajero: origen y destino con referencias, revisión de la solicitud, búsqueda de conductor, conductor asignado, viaje en curso y finalización; incluir cancelación, fuera de cobertura, fuera de horario y sin conductores.
- Motorizado: acceso, estado pendiente de aprobación, disponibilidad, solicitudes, detalle y aceptación, llegada, inicio y finalización del viaje.
- Administrador: acceso restringido, aprobación/suspensión de conductores, configuración de cobertura y horarios, listado y detalle de viajes.
- Los permisos de administrador no se obtienen mediante registro público. El acceso de un conductor a solicitudes requiere aprobación.
- El prototipo usa viajes y usuarios ficticios, e identifica explícitamente la tarifa como pendiente. No representa un servicio operativo ni pagos procesados.

Orden de trabajo: diseñar primero el recorrido completo del pasajero, conectar las acciones del motorizado y completar los controles del administrador. Validar ese recorrido antes de integrar autenticación, mapas y persistencia reales.

Salida del prototipo: poder recorrer una solicitud hasta su finalización y revisar los estados alternativos, en formato móvil para pasajero/motorizado y en escritorio para administración. La simulación de aceptación no sustituye las pruebas posteriores de concurrencia del servidor.

## 1. Material revisado y estado actual

- Manual local: `De1na_Manual_de_Marca.md`, versión 1.0.
- Repositorio: https://github.com/Maxjose/deuna. La API de GitHub informa que está vacío; no se encontraron incidencias. La rama predeterminada indicada es `main`.
- La carpeta local no es un repositorio Git y solo contiene el manual al momento de la revisión.

No hay código, dependencias ni arquitectura existente que evaluar. El manual es una propuesta conceptual de marca; sus lineamientos sirven como insumo y no constituyen una especificación funcional aprobada ni autorización para publicar o contratar servicios.

## 2. Base documentada

- Servicio inicial: solicitud de traslados individuales en motocicleta.
- Zona prevista: municipio Mara, Zulia, Venezuela. Falta delimitar cobertura operativa.
- Nombre gráfico propuesto: De1na; pronunciación: DeUna. Nombre definitivo pendiente.
- Concepto: «Moverte sin complicarte». Eslogan: «¿Vamos? ¡De una!».
- Paleta propuesta: azul noche `#122033`, lima `#B4F36A`, blanco humo `#F5F7F8` y gris `#536477`.
- Interfaz con acciones claras para ubicación, tarifa, confirmación, cancelación, pago y seguridad.
- Logo vectorial, tipografía concreta y validación de contraste pendientes.
- Auto, envíos y delivery son posibilidades futuras, no servicios activos.

## 3. Alcance propuesto del piloto

Objetivo: completar y registrar un viaje real, desde su solicitud hasta su cierre, con un grupo controlado de pasajeros y conductores.

| Experiencia | Funciones mínimas propuestas |
|---|---|
| Pasajero | Identificarse, indicar origen y destino con referencias, conocer tarifa y condiciones, solicitar, ver estado y conductor, cancelar, consultar historial y pedir ayuda |
| Conductor | Acceso tras aprobación, disponibilidad, recibir y aceptar solicitudes, consultar recogida y destino, registrar llegada, inicio y finalización |
| Operación | Aprobar o suspender conductores, consultar viajes e incidencias, gestionar asignaciones sin conductor y revisar el registro de cambios |

Son tres roles. Se propone reunirlos en una WebApp con permisos diferenciados. El seguimiento en mapa, las notificaciones y el método de identificación deben elegirse según las necesidades del piloto y las pruebas con teléfonos reales.

Fuera del primer alcance propuesto: autos, delivery, encomiendas, billetera, promociones, referidos, tarifas dinámicas y expansión geográfica.

## 4. Decisiones que condicionan la implementación

| Prioridad | Decisión pendiente | Qué determina |
|---|---|---|
| Antes de cerrar el MVP | WebApp confirmada; faltan teléfonos y navegadores del piloto | Compatibilidad, distribución y comportamiento en segundo plano |
| Antes de modelar viajes | Cobertura y horarios administrables confirmados; faltan reglas concretas y número inicial de conductores | Cobertura, disponibilidad y tamaño del piloto |
| Antes de modelar viajes | Aceptación por conductor confirmada; faltan visibilidad de solicitudes, vencimiento y reasignación | Estados, concurrencia y herramientas de operación |
| Antes de implementar cotización | Cálculo de tarifa, moneda, redondeo, vigencia y cambios de destino | Cotización y registro de importes |
| Antes del piloto | Pago directo al motorizado confirmado; faltan medios admitidos, tratamiento de desacuerdos y decisión sobre comisión | Información al usuario y operación |
| Antes de habilitar usuarios reales | Requisitos de conductor, documentos, verificación, reglas de seguridad y canal de soporte | Incorporación, permisos y respuesta a incidentes |
| Antes de integrar proveedores | Presupuesto y necesidades de mapas, búsqueda de direcciones, autenticación y notificaciones | Costos y dependencias externas |
| Antes del piloto público | Condiciones de servicio, privacidad, conservación de datos y validaciones operativas correspondientes | Preparación para lanzamiento |

Las verificaciones legales y de disponibilidad de marca mencionadas en el manual siguen pendientes; esta revisión no las realizó.

## 5. Secuencia de desarrollo y criterios de salida

### Etapa 0 — Definir el servicio

Entregables: especificación breve del MVP, decisiones anteriores, reglas de tarifa y asignación, catálogo de estados y responsables de operación.

Salida: cada paso del viaje tiene actor, condición de entrada, resultado y tratamiento de cancelación o falla. El alcance del piloto está acordado.

### Etapa 1 — Validar la experiencia

Entregables: prototipo de solicitud, cotización, búsqueda, asignación, recogida, viaje y cierre; vistas mínimas del conductor y de operación. Aplicar la paleta propuesta con contraste comprobado y textos funcionales claros. Usar identificación textual provisional si el logo maestro aún no existe.

Salida: recorrer el flujo con pasajeros y conductores previstos, incluyendo dirección difícil de ubicar, permiso de ubicación denegado y ausencia de conductores.

### Etapa 2 — Preparar la base técnica

Elegir tecnología después de confirmar plataforma y requisitos de ubicación. Priorizar una aplicación mantenible con backend compartido y almacenamiento transaccional; no introducir microservicios para el piloto.

Entregables: repositorio local vinculado a GitHub, estructura mínima, configuración documentada, entorno de desarrollo, permisos por rol, esquema inicial y comprobaciones automatizadas básicas. Elegir proveedores solo tras revisar capacidades vigentes y costos.

Modelo candidato: usuario, perfil de conductor, vehículo, disponibilidad, cotización, viaje, asignación, eventos del viaje, registro de pago e incidencia. Ajustar al alcance acordado; guardar importes con moneda y precisión explícitas.

Salida: acceso y permisos verificables; un pasajero no puede consultar viajes ajenos ni aprobar conductores. Documentos y ubicación tienen acceso restringido.

### Etapa 3 — Construir un viaje completo

Implementar origen/destino, cotización, solicitud, asignación, aceptación, llegada, inicio, cierre y registro del pago según el mecanismo elegido. Añadir cancelación, vencimiento, falta de conductor y recuperación tras pérdida de conexión.

Secuencia candidata: solicitado → buscando conductor → asignado → conductor llegó → en curso → finalizado. Cancelado, vencido y sin disponibilidad requieren reglas explícitas. Cotizar sucede antes de crear la solicitud.

El servidor valida las transiciones. La aceptación concurrente debe dejar un solo conductor asignado; repetir una acción por reconexión no debe crear otro viaje ni duplicar un cobro.

Salida: completar el flujo entre dos teléfonos y el panel de operación; comprobar concurrencia, permisos y recuperación de conexión con pruebas de integración.

### Etapa 4 — Ejecutar el piloto

Entregables: historial, soporte operativo, registro de errores, respaldos con recuperación comprobada e instrucciones de atención. Añadir ubicación y notificaciones con el alcance aprobado y validar su comportamiento real.

Salida: comprobar el recorrido en Mara con conectividad y GPS reales, recuperación después de cerrar la app y procedimiento ante solicitudes sin atención. Establecer umbrales de aceptación antes de comenzar.

Métricas iniciales: solicitudes, asignaciones, viajes completados, cancelaciones por motivo, tiempo de asignación, fallas técnicas e incidencias de soporte. Registrar únicamente los datos necesarios.

## 6. Primer bloque de trabajo

1. Detallar cobertura administrable y aceptación por conductor; resolver tarifa provisional y moneda. Acceso con correo y contraseña confirmado.
2. Redactar la especificación del MVP y las reglas de estados, cancelación y vencimiento.
3. Dibujar el flujo y validar el prototipo con personas del piloto.
4. Elegir la tecnología con esos requisitos y un presupuesto conocido.
5. Preparar el repositorio e implementar un viaje completo.

No se fija calendario todavía: faltan alcance operativo, equipo disponible y presupuesto. Estimar por etapa al cerrar la especificación evita tratar supuestos como compromisos.

## Primera implementación — 29 de octubre de 2026

Prototipo local implementado en index.html, styles.css, app.js y domain.js. Incluye acceso simulado con correo/contraseña, roles de demostración, solicitud, aceptación, progreso, cancelación, historial, aprobación de conductores y configuración de zonas/horario diario. Datos ficticios en localStorage; mapa ilustrativo y tarifa pendiente explícita. Ver README.md para ejecución y límites. Autenticación real, backend y aceptación concurrente entre dispositivos quedan pendientes.

## Arquitectura objetivo — Supabase y Vercel

Decisiones del usuario: Supabase para almacenamiento de datos y Vercel para despliegue. Esta sección sustituye las alternativas de backend y hosting anteriores; el código local sigue siendo el prototipo estático hasta completar la migración.

- Aplicación: Next.js App Router, React y TypeScript, desplegada en Vercel.
- Backend de aplicación: módulos de servidor de Next.js para validar identidad, permisos y acciones de negocio. No se incorpora NestJS separado en esta etapa.
- Datos: PostgreSQL en Supabase, con migraciones versionadas y RLS en todas las tablas expuestas. Políticas por propietario, conductor autorizado y administrador; roles no editables por el usuario.
- Identidad: Supabase Auth con correo/contraseña, confirmación de correo, recuperación y sesiones integradas mediante @supabase/ssr.
- Tiempo real: Supabase Realtime para solicitudes y estados autorizados. Las notificaciones de cambios no reemplazan la validación transaccional.
- Integridad: aceptación de viaje atómica en PostgreSQL, validando conductor aprobado/disponible y viaje libre. Proteger también la restricción de un viaje activo por conductor y pasajero frente a concurrencia. Las transiciones requieren autorización y validación dentro de la operación de base de datos.
- Archivos futuros: Supabase Storage privado para documentos, con políticas y acceso temporal autorizado.
- Configuración: variables por entorno de Vercel; URL y clave publicable para el cliente, secretos solo del lado servidor. Nunca exponer claves privilegiadas con NEXT_PUBLIC_.
- Entornos: pruebas y producción separados; las vistas previas no deben modificar los datos de producción.

Orden de migración: preparar Next.js/TypeScript y comprobación de build; definir esquema y políticas; integrar registro/acceso/recuperación reales; migrar roles y configuración; implementar un viaje persistente con prueba de dos sesiones y aceptación concurrente; validar y desplegar una vista previa en Vercel. No presentar la simulación local como integración completada.

Documentación de referencia:
- https://supabase.com/docs/guides/auth/server-side/nextjs
- https://supabase.com/docs/guides/realtime/postgres-changes
- https://vercel.com/docs/frameworks/full-stack/nextjs

## Migración a Next.js y limpieza

La implementación activa está en src/ con Next.js 16, React 19 y TypeScript. Se eliminaron app.js, domain.js, domain.test.js, index.html, server.mjs, styles.css y la copia temporal prototype/. El README actual sustituye las instrucciones del servidor 4173. La configuración propuesta de Supabase está en supabase/schema.sql, pendiente de ejecución y pruebas en la otra cuenta indicada por el usuario. No hay base Supabase creada ni datos de otras aplicaciones modificados. Proyecto Vercel deuna creado en la cuenta conectada, todavía sin despliegue.

## Requisito de experiencia móvil

La WebApp debe sentirse como una app nativa tanto en aspecto como en interacción. Se implementó navegación inferior en teléfonos, cabecera compacta, pantallas por tarea, cuenta, confirmaciones en hoja modal, controles táctiles, soporte de áreas seguras y PWA con manifiesto e iconos. Las capacidades de instalación y ejecución en segundo plano dependen del navegador; esta entrega no incluye operaciones sin conexión ni seguimiento con la aplicación cerrada.

## Dirección visual acordada a partir de referencia

Priorizar concepto e identidad visual antes de ampliar funciones. Usar el icono sobre fondo verde de la referencia: D oscura con carretera y marcador. La reconstrucción está en public/brand/de1na-icon.svg y sustituye al monograma D1 provisional en los iconos de instalación y favicon. Validar los próximos ajustes visuales progresivamente con el usuario.
