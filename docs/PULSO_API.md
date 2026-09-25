# Integración con isg-api-pulso

Repositorio backend: [IntersistemasRcia/isg-api-pulso](https://github.com/IntersistemasRcia/isg-api-pulso) (rama `develop`)

**Metadatos de SP (comentario `/*-- Pulso:`):** estándar canónico en [PULSO_SP_METADATA.md](./PULSO_SP_METADATA.md) — prefijo `sp_ISG_Vision_`, fechas `dd/MM/yyyy`, TIPO / PROPÓSITO / PARÁMETROS / INTERACCIÓN. El proxy `GET /api/pulso/arquitectura?refresh=1` (login y badge ERP) salta el cache de 5 min para ver SPs nuevos de inmediato.

El front Next.js consume la API .NET vía `src/lib/pulso/`. Base URL típica:

```env
NEXT_PUBLIC_PULSO_API_URL=https://localhost:44351/api/v1/pulso
PULSO_TLS_INSECURE=1   # solo dev con cert autofirmado
```

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/SPs_arquitectura` | Bearer JWT | Catálogo slim: `nombreSp` + `descripcion?` + `parametros[]` |
| GET | `/SPs_arquitectura?includeSql=true` | Bearer JWT | Legacy: `NombreSP` + `CodigoSQL` (solo debug) |
| GET | `/api/pulso/arquitectura` (proxy front) | Bearer JWT | Mismo catálogo slim para localStorage |
| POST | `/ejecutar-sp` | Bearer JWT | Ejecuta un SP autorizado |

Controlador: `EjecutorController` → ruta base `api/v1/pulso`.

## Autenticación JWT

La API Pulso valida el **mismo JWT** que emite API Auth, con configuración en `appsettings.json`:

```json
"Jwt": {
  "Issuer": "...",
  "Key": "... (HS512 simétrico)"
}
```

El front reenvía el token del login (`Authorization: Bearer …`) en cada llamada server-side.

**Importante:** el `Issuer` y `Key` de Pulso deben coincidir con los de la API Auth que firma el token. Si no, verás **401** aunque el login del front funcione.

## GET /SPs_arquitectura — respuesta slim (default)

Fuente: [SqlEjecutorService.cs](https://github.com/IntersistemasRcia/isg-api-pulso/blob/develop/isg-api-pulso/Services/SqlEjecutorService.cs) (`sys.procedures` + `sys.parameters` + comentario `-- Pulso:` / `/*-- Pulso:` en `sys.sql_modules`, max 1000 chars).

```json
[
  {
    "nombreSp": "sp_ISG_Vision_ventas_por_articulo_margen",
    "descripcion": "Margen bruto por artículo en un período. Requiere fechas y código de rubro.",
    "parametros": [
      {
        "nombre": "FechaDesde",
        "tipo": "date",
        "requerido": true,
        "tieneDefault": false,
        "esOutput": false
      },
      {
        "nombre": "IDSucursal",
        "tipo": "int",
        "requerido": false,
        "tieneDefault": true,
        "esOutput": false
      }
    ]
  },
  {
    "nombreSp": "sp_ISG_Vision_GetMarcas",
    "descripcion": null,
    "parametros": []
  }
]
```

### Contrato `requerido` / `tieneDefault`

- `tieneDefault: true` cuando la firma T-SQL declara default (`@IDSucursal INT = NULL`, `@Top INT = 10`, etc.).
- `requerido` debe ser **siempre** `!tieneDefault` (para inputs; `esOutput: true` no se envían al ejecutar).
- **Importante:** `sys.parameters.has_default_value` es **casi siempre 0** en SPs T-SQL (limitación de SQL Server). No alcanza con mapear solo esa columna: hay que inferir defaults desde `sys.sql_modules.definition` (firma `CREATE/ALTER PROC … AS`).
- Tras redeploy: limpiar LS `pulso.sp.arquitectura.v3` y esperar TTL del cache server (~5 min) o reiniciar Next.

El front (`normalizeArquitectura.ts`): si `tieneDefault === true` → trata el param como **opcional** aunque el API mande `requerido: true` (defensa). Si no hay default, respeta `requerido`; si falta todo, asume requerido.

### Checklist post-deploy arquitectura

1. Redeploy Kestrel con parseo de defaults (`beb8130`+).
2. `GET /api/v1/pulso/SPs_arquitectura` crudo → `IDSucursal.requerido === false` en SPs con `= NULL`.
3. En el browser: borrar `localStorage.pulso.sp.arquitectura.v3` (o logout/login) y reiniciar Next si hace falta.
4. Chat sin sucursal en un SP opcional → no debe devolver `MISSING_REQUIRED_PARAMS` por `IDSucursal`.

### Convención de descripción en SQL

En el cuerpo del SP, comentario Pulso (línea **o** bloque). Contenido útil **máx. 1000 caracteres** (el API colapsa whitespace).

```sql
-- Pulso: <texto de negocio>

/*-- Pulso:
Informe de … en un período.
Parámetros: FechaDesde, FechaHasta (obligatorios); FiltroX (opcional, default …).
FiltroX:
  VALOR_A = significado de negocio.
  VALOR_B = significado de negocio.
Si el usuario pide un subconjunto, usar el mismo informe cambiando FiltroX.
Si no está claro, ofrecer esas opciones en lenguaje de negocio; no decir que no existe el informe.
*/
```

Reglas de redacción:

- Meta ~700–1000 chars de contenido útil (tope 1000).
- Primero negocio + params/enums; si sobra presupuesto, enriquecer con resultado y contexto técnico **traducido a negocio** (tablas/joins explicados).
- SP sin params: decirlo explícito («ejecutar tal cual; no pedir filtros»).
- Formato válido: `-- Pulso:` (una línea) o `/*-- Pulso: … */`.
- Enums: literal exacto + significado; **sin** mapas de sinónimos.
- Filtrar el mismo informe = cambiar el parámetro; si hay duda, ofrecer opciones.
- Doc técnica muy larga puede vivir en otro `/* … */` sin prefijo Pulso.

Si el SP no tiene el comentario, la API debe devolver `descripcion: null` (sin error). El front usa entonces un fallback humanizado desde el nombre.

El front (`normalizeArquitectura.ts` / `catalog.ts`):

- Prefiere `descripcion` del API; si falta, `humanizeSpDescription`.
- Incluye hasta **1000** chars de descripción en el prompt (`full`); menos en `compact`/`minimal`.
- Usa `parametros` del API (filtra `esOutput: true` y denylist de variables de cuerpo).
- **No mete `CodigoSQL` en el prompt** → menos tokens.
- Fallback: si llega `?includeSql=true`, parsea solo la firma `CREATE PROC … AS`.
- Ante error de literal de filtro inválido, instruye al LLM a ofrecer las opciones de la descripción (no negar el informe).

Variables como `LikeTerm` / `ErrorMessage` **no existen en sys.parameters**, así que no aparecen en el catálogo del chat.

## Elección de SP (flujo dual)

1. **Front** (`selectRelevantSps`): ranking léxico con nombre + params + descripción → top K candidatos.
2. **LLM**: elige entre esos candidatos usando la descripción de negocio y la firma; pide datos faltantes si hace falta.

## UX del chat

El system prompt obliga al modelo a hablar en lenguaje de negocio: **nunca** mencionar SP, parámetros ni SQL al usuario. Los detalles técnicos se resuelven con el catálogo + tools.

## Cache en el cliente (localStorage)

Al login y al abrir el chat, el front llama `GET /api/pulso/arquitectura` y guarda en `localStorage` clave `pulso.sp.arquitectura.v3` (TTL 24 h; incluye `descripcion`). El servidor refresca el catálogo en memoria en cada `POST /api/chat` (TTL ~5 min).

## POST /ejecutar-sp — body (PeticionSpDto)

Contrato Swagger / JSON (camelCase, `System.Text.Json`):

```json
{
  "nombreSp": "sp_ISG_Vision_VentasResumen",
  "parametros": {
    "DesdeFecha": "03/07/2026",
    "HastaFecha": "03/07/2026"
  }
}
```

Fuente en backend (`EjecutorController.cs`, clase `PeticionSpDto`):

- Repo: [IntersistemasRcia/isg-api-pulso](https://github.com/IntersistemasRcia/isg-api-pulso) — rama **`develop`**
- Propiedades C#: `NombreSp`, `Parametros` → JSON: `nombreSp`, `parametros`
- Dapper recibe claves **sin `@`**; el front resuelve nombres contra `SPs_arquitectura` (`coerceParamsForSp`).
- Fechas `datetime`/`date` del catálogo → **dd/MM/yyyy** (ej. `03/07/2026`).

**Capa LLM vs API:** la tool `ejecutarConsultaPulso` recibe parámetros como lista `{ nombre, valor }` (compatibilidad Groq/OpenAI tools); el servidor las convierte a `parametros: Record<string, unknown>` antes del POST. Campo opcional `modoResultado`: `preview50` | `completo` (tras un `RESULT_LARGE`).

**Respuesta exitosa (preferida):** wrapper JSON:

```json
{
  "ok": true,
  "rows": [ ... ],
  "totalRows": 183,
  "truncated": true,
  "limiteFilas": 50,
  "totalRowsExact": true
}
```

**Compat:** si el API aún devuelve un array crudo de filas, el front lo normaliza a `{ ok, rows, totalRows }`.

**Body opcional:** `limiteFilas` — el API debería materializar como máximo N filas en la respuesta (el SP puede seguir corriendo entero en SQL Server).

**Tokens (historial):** el front compacta tool outputs de turnos previos y reaplica `toModelOutput` al convertir a mensajes del modelo (`convertToModelMessages` + tools), para no reenviar `rows` al LLM.

**Errores:** `{ "error": "...", "detalle": "..." }` con HTTP 400/500.

### Gate de resultados grandes

Umbral de negocio: **50 filas**.

1. Primera ejecución: `limiteFilas: 50` (probe).
2. Si el API responde con **`totalRows` real** + `truncated` / `totalRowsExact: true` → el front muestra adelanto de 50, dice el total exacto y **no** trae todo el listado todavía.
3. Excel solo con `modoResultado=completo` y **más de 50** filas.
4. Si el API aún no da COUNT (`totalRowsExact: false` o `totalRows` = tamaño del lote) → el front dice “más de 50” y no inventa 51.

Contrato backend detallado + prompt para isg-api-pulso: [`docs/BACKEND_EJECUTAR_SP_RESULT_SIZE.md`](./BACKEND_EJECUTAR_SP_RESULT_SIZE.md).

## Reglas de negocio (backend)

- Solo SPs con prefijo `sp_ISG_Vision_`
- Parámetros: Dapper acepta claves con o sin `@`
- Fechas: enviar **dd/MM/yyyy** (ej. `03/07/2026`), como en Swagger. El front convierte ISO si el LLM envía `YYYY-MM-DD`.

## Flujo en el chat

1. `POST /api/chat` valida JWT del usuario
2. `getSpsArquitecturaCached(token)` → catálogo slim para el system prompt
3. El modelo llama tool `ejecutarConsultaPulso`
4. `ejecutarSpPulso` → POST `/ejecutar-sp` con el JWT de sesión
5. Resultado truncado → segunda vuelta del LLM → respuesta al usuario

## Indicador en el dashboard

El header muestra **Sesión activa** y **ERP conectado** (o el error traducido).

- API interna: `GET /api/pulso/status` (usa el JWT del usuario)
- Clic en el badge ERP → revalida la conexión
- Mensajes amigables: `src/utils/userFacingErrors.ts`

## Troubleshooting

| Síntoma | Causa probable |
|---------|----------------|
| Catálogo vacío en logs | JWT 401 en Pulso o SQL sin SPs Vision |
| SP con 0 params no aparece | Backend debe listar desde `sys.procedures` + LEFT JOIN params (fix en isg-api-pulso) |
| 401 en ejecutar-sp | Issuer/Key JWT no alineados entre Auth y Pulso |
| Tool OK pero sin texto | Cuota Gemini free (429) en el 2.º paso |
| Timeout 25s | SQL lento o API Pulso no responde |
| Parámetros inventados (LikeTerm) | Catálogo viejo en localStorage: borrar `pulso.sp.arquitectura*` |
| Sin `descripcion` en arquitectura | Comentario `-- Pulso:` / `/*-- Pulso:` ausente, o API aún no parsea bloque/1000 chars en `sys.sql_modules` |
| «No tengo informe específico» al filtrar el mismo listado | Descripción sin significados de enum, o LLM ignora filtros; ver systemPrompt «Filtros del mismo informe» + limpiar LS |
| «No tengo acceso al catálogo de marcas» | `GetMarcas` ausente del slim (0 params / INNER JOIN) o el LLM no llamó tool; verificar `/SPs_arquitectura` y limpiar LS `pulso.sp.arquitectura.v3` |
| «No hay ventas de junio» y luego sí con año | Alucinación sin tool o mes sin año; el prompt fuerza año calendario actual + tool antes de negar |
| «No se pudo acceder» sin tool en Network | El modelo inventó un fallo; el prompt + `formatClosestAlternativesHint` deben ofrecer 1–2 alternativas de negocio |
| Connection a otra base (Biamaq vs Cheek) | Alinear connection string de isg-api-pulso a la DB donde están los SP Vision |
| `IDSucursal` sale `requerido: true` con `= NULL` | Backend sin parseo de firma o LS viejo. Redeploy + clear `pulso.sp.arquitectura.v3` |
| Ver SPs candidatos del turno | Network → `POST /api/chat` → headers `X-Pulso-Sp-Candidates`, o chat `?debug=1` |
| Ver SP **ejecutado** / fallido | `pm2 logs` → `[pulso] exec sp=… ok=… paramsKeys=… missing=…`; o `?debug=1` → “SP ejecutado / intentado” |
| `messages` vs `raw_messages` en log `[chat]` | `raw_messages` = historial del cliente; `messages` = tras `windowMessages` (últimos 12). Tokens crecen con la ventana + tool results (`tool_results_kb`) |
| Chat muestra “51 marcas” y luego 1962 | API sin COUNT real (`totalRows`=lote). Ver `BACKEND_EJECUTAR_SP_RESULT_SIZE.md`. Front ya no afirma 51 si `totalRowsExact=false`. |
| “Ver todos” solo muestra ~50 filas | Pedir `modoResultado=completo` → Excel + adelanto 50 |
| `limiteFilas` no reduce payload | Backend aún no implementa el wrapper; el front igual hace gate si detecta overflow |

## Debug operativo (PM2 + `?debug=1`)

- Log siempre (también production): `[pulso] exec sp=… ok=true|false ms=… paramsKeys=FechaDesde,FechaHasta [code=…] [missing=…] [rows=N]`
- Chat con `?debug=1`: panel con candidatos (headers) + **todas** las tool calls del último turno assistant (ok / fail / missing).
- No hay header `X-Pulso-Sp-Executed` (streaming lo vaciaría); la fuente de verdad en servidor es el log.

## Prompt para `limiteFilas` + wrapper en isg-api-pulso

Copiar en el repo [isg-api-pulso](https://github.com/IntersistemasRcia/isg-api-pulso) (rama `develop`):

```
Trabajá en isg-api-pulso (ASP.NET, Dapper, SQL Server).

Objetivo: POST /api/v1/pulso/ejecutar-sp debe soportar límite de filas y devolver
un wrapper JSON (no solo el array crudo), para que el front Pulso pueda avisar
cuando hay >50 registros sin inundar al LLM.

Cambios en PeticionSpDto / body camelCase:
- nombreSp (ya existe)
- parametros (ya existe)
- limiteFilas?: int?   // opcional

Respuesta exitosa (200) — SIEMPRE este shape (breaking change OK; el front ya lo parsea):
{
  "ok": true,
  "rows": [ /* hasta N objetos */ ],
  "totalRows": <int>,
  "truncated": <bool>,
  "limiteFilas": <int|null>
}

Reglas:
1) Si limiteFilas es null/omitido: devolver todas las filas del SP.
   totalRows = rows.Count, truncated = false, limiteFilas = null.
2) Si limiteFilas = N (>0):
   - Materializá como máximo N filas en "rows".
   - Si el reader/enumerable tenía más: truncated = true.
   - totalRows: idealmente el total real. Si no podés contarlo sin second pass,
     usá al menos rows.Count y truncated=true cuando cortaste (el front trata
     truncated||totalRows>50 como RESULT_LARGE).
   - Preferí no bufferizar en memoria más de N+1 filas al armar la respuesta
     (IDataReader / Take(N+1)).
3) Prefijo sp_ISG_Vision_ y auth JWT sin cambios.
4) Errores 400/500 siguen { error, detalle }.
5) No hace falta endpoint /analizar-sp ni COUNT por SP: el “análisis” es
   totalRows/truncated de esta ejecución.

Archivos típicos: Models (PeticionSpDto), Controllers/EjecutorController.cs,
Services/SqlEjecutorService.cs, ISqlEjecutorService.cs.

Aceptación:
- Sin limiteFilas → wrapper con todas las filas, truncated=false.
- Con limiteFilas=50 y SP que devuelve 200 → rows.Length<=50, truncated=true,
  totalRows>=50 (mejor si totalRows=200).
- Front Pulso: primera llamada con limiteFilas=51; si truncated o totalRows>50
  muestra al usuario opciones (filtros / primeros 50 / completo).
```

## Prompt para implementar `requerido` / `tieneDefault` en isg-api-pulso

Copiar en el repo [isg-api-pulso](https://github.com/IntersistemasRcia/isg-api-pulso) (rama `develop`):

```
Trabajá en isg-api-pulso (ASP.NET, Dapper, SQL Server).

Problema: GET /api/v1/pulso/SPs_arquitectura marca como requerido parámetros
opcionales del estilo `@IDSucursal INT = NULL`. El front (Pulso chat) trata
todo lo que no sea requerido:false como obligatorio y pide sucursal al usuario
aunque el SP no la necesite.

Causa: sys.parameters.has_default_value NO se popula para SPs T-SQL (docs Microsoft:
casi siempre 0). No alcanza con `requerido = !has_default_value`.

Objetivo (contrato camelCase slim):
Cada ítem de parametros[] debe incluir:
- nombre, tipo, esOutput
- tieneDefault: bool  (true si la firma declara = default)
- requerido: bool     (= !tieneDefault para inputs)

Cómo calcular tieneDefault (limpio, sin hacks en el front):
1) Seguí listando params desde sys.procedures + LEFT JOIN sys.parameters + types
   (LEFT JOIN para que SPs sin params, p.ej. GetMarcas, aparezcan con parametros: []).
2) Traé también m.definition desde sys.sql_modules (LEFT JOIN).
3) Parseá la firma entre CREATE/ALTER PROC … y AS (ignorá comentarios -- y /* */).
4) Si el parámetro aparece como `@Nombre Tipo … = <valor>` (NULL, número, string N'…'),
   tieneDefault = true. También OR con has_default_value si alguna vez es 1 (CLR).
5) requerido = !tieneDefault. Exponé ambos campos en ParametroDto / JSON.
6) No devolver CodigoSQL en slim (solo usalo en memoria para parseo + comentario -- Pulso:).

Archivos típicos: Services/SqlEjecutorService.cs, Models/SpArquitecturaDto.cs
(ParametroDto), Controllers/EjecutorController.cs.

Aceptación:
GET /api/v1/pulso/SPs_arquitectura
→ sp_ISG_Vision_dash_ventas_medio_pago_resumen
→ IDSucursal.requerido === false && IDSucursal.tieneDefault === true
Misma lógica para IDOrigenPedido, Top, ModoOrden y cualquier @Param = default.
Redeploy Kestrel y verificá el JSON crudo (sin pasar por el front).
```

## Prompt para implementar `descripcion` en isg-api-pulso

Copiar en el repo [isg-api-pulso](https://github.com/IntersistemasRcia/isg-api-pulso) (rama `develop`):

```
Trabajá en isg-api-pulso (ASP.NET, Dapper, SQL Server).

Objetivo: GET /api/v1/pulso/SPs_arquitectura (slim, includeSql=false) debe incluir
"descripcion" (string|null) extraída del comentario Pulso en el código del SP
(sys.sql_modules.definition), sin fallar si el comentario no existe.

Archivos típicos: Controllers/EjecutorController.cs, Services/SqlEjecutorService.cs,
Services/ISqlEjecutorService.cs (ajustá a la estructura real del repo).

Listado slim:
1) sys.procedures WHERE name LIKE 'sp_ISG_Vision_%'
2) LEFT JOIN sys.sql_modules (definition; puede ser null)
3) LEFT JOIN sys.parameters + sys.types
4) Por cada SP: descripcion = TryExtractPulsoComment(definition)

TryExtractPulsoComment(definition):
A) Si definition es null/vacío → return null. Nunca throw por parseo.
B) Preferir bloque multilínea:
   - Buscar (OrdinalIgnoreCase) el primer índice de "/*-- Pulso:"
   - Desde ahí, buscar el cierre "*/"
   - Si hay cierre: contenido = texto entre el prefijo y el cierre
C) Si no hay bloque válido, fallback a línea:
   - Recorrer líneas; tras TrimStart, la que empiece con "-- Pulso:" (OrdinalIgnoreCase)
   - Contenido = resto de ESA línea (después de "-- Pulso:")
D) Normalizar contenido:
   - Trim
   - Colapsar whitespace: reemplazar secuencias \s+ por un solo espacio
   - Si vacío → null
   - Si length > 1000 → Truncate a 1000 (no cortar a mitad de palabra si es fácil; si no, hard truncate)
E) Compat: sigue funcionando el viejo formato de una sola línea "-- Pulso: …"

NO soportar / no priorizar:
- Comentarios /* sin el prefijo exacto /*-- Pulso:
- Prefijos "--Pulso:" (sin espacio) o "/* Pulso:"

Respuesta slim camelCase por ítem:
{ nombreSp, descripcion, parametros: [{ nombre, tipo, requerido, tieneDefault, esOutput }] }
- parametros puede ser []
- requerido debe ser !tieneDefault (defaults desde firma T-SQL; ver prompt de requerido existente)
- NO devolver CodigoSQL en slim (solo usarlo en memoria para el comentario)
- Preferí DTO tipado
- includeSql=true puede seguir legacy { NombreSP, CodigoSQL }
- No cambiar POST ejecutar-sp ni el prefijo sp_ISG_Vision_

Tests / aceptación manual:
1) SP con -- Pulso: una línea corta → descripcion = ese texto
2) SP con /*-- Pulso: … multilínea … */ (incl. saltos y espacios) → descripcion colapsada, ≤1000
3) SP con bloque >1000 chars útiles → descripcion length === 1000
4) SP sin comentario Pulso → descripcion null, HTTP 200
5) definition null → descripcion null, sin 500
6) SP solo con doc /* ... */ sin prefijo Pulso → descripcion null

Verificación: GET /api/v1/pulso/SPs_arquitectura y buscar sp_ISG_Vision_Ventas_IVA_Discriminado
(u otro con bloque Pulso) → campo descripcion poblado.
```

## Prompt para agente: generar comentario Pulso de un SP

Usá este prompt junto con el script completo del SP (CREATE/ALTER PROCEDURE). El agente debe devolver **solo** el comentario listo para pegar (`/*-- Pulso: … */` **o** `-- Pulso: …`).

```
Sos un redactor senior de metadatos para Pulso (asistente conversacional ERP on-premise).
Tu trabajo: producir el mejor comentario Pulso posible para que un LLM elija bien la consulta,
complete parámetros y, si hay filtros ambiguos, ofrezca opciones al usuario en lenguaje de negocio.

SALIDA (única, sin prosa fuera, sin markdown fences):
- Si el contenido (ya colapsado a espacios) cabe cómodo en UNA línea y ≤ ~220 chars → usá:
  -- Pulso: <contenido en una sola línea>
- Si necesitás más detalle, enums, o el SP ya usa bloque → usá:
  /*-- Pulso:
  <contenido>
  */
Elegí el formato que maximice claridad. Ambos son válidos para el parser.

══════════════════════════════════════
PRESUPUESTO DE CARACTERES (CRÍTICO)
══════════════════════════════════════
- Tope duro del contenido útil: 1000 caracteres (sin contar /*-- Pulso: / -- Pulso: / */).
- Meta: llenar entre 700 y 1000 chars siempre que haya material útil en el SP.
- Prioridad de llenado (en orden; no saltees lo alto por lo bajo):
  P0) Qué hace + cuándo usarlo (negocio).
  P1) Parámetros (o “sin parámetros”) + enums con literales exactos + defaults.
  P2) Cómo filtrar / reusar / qué ofrecer si hay duda; qué pedir si faltan datos.
  P3) Columnas/resultado de negocio que devuelve (si se deduce del SELECT/comentarios).
  P4) Contexto técnico TRADUCIDO A NEGOCIO (solo si aún estás bajo ~900–1000 chars):
      orígenes de datos, relaciones, reglas especiales (NC con signo negativo, descuentos
      globales, impuestos internos dentro de no gravado, etc.).
      Podés nombrar tablas/joins si aportan, pero SIEMPRE explicá qué representan en negocio
      (ej. «cabecera de ventas/pedidos», «detalle impositivo por línea», «maestro de clientes»).
- Si con P0–P3 ya rozás 1000, NO agregues P4.
- Si estás bajo ~700 y el SP tiene cuerpo rico, SÍ expandí con P3/P4 hasta acercarte a 900–1000.
- NO inventes hechos que no estén en el SP o sus comentarios.
- NO armes mapas de sinónimos («usuario dice X → valor Y»). El LLM interpreta desde significados.

══════════════════════════════════════
CASO A — SP SIN PARÁMETROS
══════════════════════════════════════
Si la firma no tiene @params de entrada (o solo OUTPUT/irrelevantes):
- Decilo explícito: «Sin parámetros de entrada: ejecutar tal cual.»
- Enfocate en: qué lista/devuelve, para qué pedido del usuario sirve, granularidad
  (todas las marcas, todos los rubros, catálogo completo, etc.).
- Aclará que NO hay que pedir fechas ni filtros al usuario.
- Si el resultado es un maestro/catálogo, sugerí usarlo como auxiliar antes de otro informe.
- Usá el resto del presupuesto en columnas típicas / significado del listado / cuándo elegirlo
  frente a otros informes similares (si se deduce del nombre/doc).

══════════════════════════════════════
CASO B — SP CON PARÁMETROS
══════════════════════════════════════
1) Qué es el informe (1–3 frases de negocio: qué lista/calcula y para qué sirve).
2) Parámetros de la firma (todos los de entrada):
   - Obligatorios: nombre + sentido de negocio + tipo (fecha, código, texto…).
   - Opcionales: nombre + default de la firma (= 'TODAS', = NULL, = 10, etc.) + qué pasa si se omite.
   - Fechas: período inclusivo; formato habitual dd/MM/yyyy; si faltan, pedir período en lenguaje simple.
3) Enums / literales (IF, RAISERROR, comentarios de cabecera):
   - Cada LITERAL EXACTO del SP + significado de negocio (texto del propio SP).
   - Forma:
     FiltroComprobante (opcional, default TODAS):
       TODAS = Ventas facturadas + pedidos sin comprobante.
       FACTURADAS = Solamente operaciones con comprobante emitido.
       PEDIDOS = Solamente operaciones todavía no facturadas.
4) Uso conversacional:
   - Subconjunto del mismo informe = reusar esta consulta cambiando el/los params de filtro.
   - Si el filtro es ambiguo: ofrecer las opciones definidas (negocio, numeradas); NUNCA decir que no existe el informe.
5) Si aún hay presupuesto (<~900): resultado (qué representa cada fila) + contexto P4.

══════════════════════════════════════
CÓMO LEER EL SP
══════════════════════════════════════
- Firma CREATE/ALTER PROCEDURE … AS → @Params y defaults (fuente de verdad de inputs).
- Cabecera / RAISERROR → literales permitidos y reglas de validación.
- SELECT final / columnas alias → qué ve el usuario (prioridad alta si no hay params).
- Cuerpo (joins, pivots, signos NC, factores de descuento): usalo para enriquecer P3/P4
  en lenguaje de negocio cuando sobre presupuesto; no copies SQL crudo.
- @Filtro* / @Modo* / @Tipo* con lista cerrada → prioritarios.
- No inventes params ni enums ausentes.

══════════════════════════════════════
ESTILO
══════════════════════════════════════
- Español rioplatense, denso, sin relleno vacío.
- Orientado a un LLM: hechos accionables (elegir SP, armar params, ofrecer filtros).
- Preferí frases concretas sobre adjetivos vagos («útil», «completo»).

══════════════════════════════════════
CHECKLIST ANTES DE RESPONDER
══════════════════════════════════════
[ ] Solo el comentario Pulso (línea o bloque), nada más
[ ] Contenido ≤ 1000 chars; ideal ≥ 700 si el SP da material
[ ] Formato: -- Pulso: …  O  /*-- Pulso: … */
[ ] Si 0 params de entrada: dicho explícito + «ejecutar sin pedir filtros»
[ ] Si hay params: todos listados; obligatorios/opcionales/defaults correctos
[ ] Enums: literales exactos + significados; sin sinónimos
[ ] Regla de reusar informe / ofrecer opciones si duda (cuando aplica)
[ ] Si <~900 chars y hay cuerpo rico: agregaste resultado y/o contexto de negocio (P3/P4)
[ ] Sin inventar params, enums ni reglas que el SP no tenga

══════════════════════════════════════
SP A DOCUMENTAR
══════════════════════════════════════
(pegá debajo el CREATE/ALTER PROCEDURE completo)
```

Ejemplos de forma (referencia):

SP con filtros:

```sql
/*-- Pulso:
Informe de ventas discriminando IVA y percepciones por operación en un período.
Params: FechaDesde y FechaHasta (obligatorios); FiltroComprobante (opcional, default TODAS).
FiltroComprobante:
  TODAS = Ventas facturadas + pedidos sin comprobante.
  FACTURADAS = Solamente operaciones con comprobante emitido.
  PEDIDOS = Solamente operaciones todavía no facturadas.
Reusar este informe al filtrar; si el filtro no está claro, ofrecer esas tres opciones en lenguaje de negocio.
Una fila por operación: fecha, tipo/letra/PV/nro comprobante, pedido, cliente, bases e IVA por alícuota, percepciones y total.
Cabecera de ventas/pedidos + detalle impositivo por línea; NC con importes en negativo; descuentos/recargos globales de cabecera aplicados a bases e IVA.
*/
```

SP sin parámetros (o comentario corto en una línea):

```sql
-- Pulso: Catálogo de marcas del ERP. Sin parámetros: ejecutar tal cual; no pedir fechas ni filtros. Usar como auxiliar antes de informes que requieran código/nombre de marca.
```
