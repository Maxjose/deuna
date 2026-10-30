# De1na: formato del catálogo de lugares

Esta guía prepara la salida de tu script para el importador genérico de De1na. No incluye extracción de Google ni requiere cambiar de mapa. Usa información propia o que tengas autorización para almacenar y reutilizar; el campo `source` registra su origen, no otorga derechos sobre ella. El catálogo es una base de lugares, no una copia de reseñas, fotos o fichas completas de un proveedor.

## Archivo recomendado

JSON en UTF-8, con esta estructura. Se admite un BOM al principio. Hasta 1.000 lugares y 5 MB por archivo.

```json
{
  "version": 1,
  "places": [
    {
      "source": "propio",
      "external_id": "local-000123",
      "name": "Nombre real del lugar",
      "latitude": 11.087,
      "longitude": -71.603,
      "aliases": ["Nombre alternativo", "Nombre popular"],
      "address": "Calle o dirección",
      "municipality": "Mara",
      "category": "comercio",
      "reference": "Entrada principal frente a la plaza",
      "source_url": "",
      "active": true
    }
  ]
}
```

Las coordenadas del ejemplo son ilustrativas: reemplázalas por el punto comprobado del lugar. `places.example.json` tiene `active: false` para que un ejemplo no aparezca como comercio real en la búsqueda.

## Campos

| Campo | Requerido | Tipo y límite |
|---|---|---|
| source | Sí | Texto de hasta 40 caracteres: minúsculas, números, `-` o `_`. Usa siempre el mismo nombre para un mismo origen. |
| external_id | Sí | Identificador estable de ese origen, hasta 160 caracteres. |
| name | Sí | Nombre del lugar, hasta 110 caracteres. |
| latitude | Sí | Número WGS84 entre -90 y 90; punto decimal. |
| longitude | Sí | Número WGS84 entre -180 y 180; punto decimal. |
| aliases | No | Lista de hasta 10 nombres alternativos, hasta 80 caracteres cada uno. |
| address | No | Dirección, hasta 200 caracteres. |
| municipality | No | Municipio o sector, hasta 100 caracteres. |
| category | No | Categoría libre, hasta 60 caracteres. |
| reference | No | Referencia de acceso, hasta 240 caracteres. |
| source_url | No | URL HTTP/HTTPS del origen o texto vacío, hasta 2.048 caracteres. La app no descarga esa página. |
| active | No | `true` o `false`. Los nuevos lugares comienzan activos si se omite. En lugares existentes, omitirlo conserva su estado. |

No uses comas decimales ni coordenadas como texto: `11.087` es válido; `"11,087"` no. La longitud del Zulia es negativa. La aplicación avisa si un punto queda fuera del entorno actual de búsqueda del Zulia. Esa envolvente no es una frontera administrativa exacta ni una restricción de los viajes marcados manualmente.

## Identidad y actualizaciones

- `source + external_id` identifica un lugar. Reimportar esa pareja actualiza el registro y conserva su UUID interno; no crea otro lugar.
- No generes un UUID nuevo en cada extracción. Conserva el identificador original estable o guarda un identificador propio persistente en tu script.
- Cambiar el nombre o las coordenadas no cambia su identidad. Cambiar `source` o `external_id` sí crea un registro nuevo.
- Se rechazan parejas repetidas dentro de un mismo archivo. Registros con IDs diferentes no se fusionan automáticamente, aunque tengan nombres similares: revísalos en tu script.
- Cada fila es una ficha completa: los textos y aliases opcionales omitidos se guardan vacíos. `active` es la excepción: conserva el valor anterior si se omite.
- Usa `active: false` para retirar un lugar de la búsqueda sin borrar los viajes anteriores. Una carga posterior que omita `active` no lo reactiva.
- El archivo solo admite los campos documentados; un campo desconocido produce un error con el número de lugar.

## Importación desde el panel

1. Entra como administrador en **Servicio → Catálogo de lugares**.
2. Selecciona el JSON. La app valida todo el archivo y muestra errores y advertencias antes de guardar.
3. Revisa los primeros lugares, las coordenadas y el total. Pulsa **Importar lugares**.
4. La app envía bloques de 100. Cada bloque es atómico: si una fila falla, ese bloque no se guarda. Los anteriores permanecen.
5. Si se interrumpe la conexión, pulsa **Continuar importación** mientras sigas en la pantalla. El mismo bloque lleva un identificador de reintento para no procesarlo dos veces ante una respuesta perdida.
6. Si cierras o recargas la página, vuelve a subir el archivo. Las parejas estables evitan duplicados, aunque las filas ya cargadas se contabilicen como actualizaciones.

Los lugares activos aparecen primero al buscar recogida o destino. Se buscan nombres, aliases y direcciones ignorando acentos y mayúsculas; también se admiten aproximaciones del nombre. El mapa externo sigue aportando resultados complementarios. Agregar un lugar no agrega calles a la red de rutas: la cotización seguirá comprobando que exista un recorrido por carretera.

## Validación en tu script o terminal

Desde el proyecto (Node.js 24):

```text
npm run catalog:validate -- ruta/al/archivo.json
```

El comando muestra errores por fila y termina con código 1 si el archivo es inválido. El esquema descargable es `places.schema.json` (JSON Schema 2020-12). El validador también comprueba parejas duplicadas y advertencias de ubicación.

## Automatización directa opcional

Para comenzar, tu script solo necesita producir el archivo anterior; cargarlo en el panel no requiere claves nuevas. Para automatizar la carga posteriormente, la RPC disponible es `catalog_admin` en Supabase, protegida por el rol real de administrador del usuario autenticado:

```json
{
  "action": "import",
  "payload": {
    "version": 1,
    "batch_id": "UUID-generado-una-vez-para-este-bloque",
    "places": []
  }
}
```

En esa RPC cada bloque debe contener entre 1 y 100 lugares. Reutiliza el mismo `batch_id` y el mismo contenido al reintentar un bloque; cámbialo para una carga nueva. La respuesta contiene `processed`, `inserted` y `updated`. Reutilizar un ID con otro contenido se rechaza. Usa una sesión de administrador vigente y la clave publicable del proyecto: no incluyas contraseñas ni claves administrativas en el archivo de lugares, en el repositorio o en código del navegador.
