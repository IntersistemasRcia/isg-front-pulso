# Integración con isg-api-pulso

Repositorio backend: [IntersistemasRcia/isg-api-pulso](https://github.com/IntersistemasRcia/isg-api-pulso) (rama `develop`)

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

Fuente: [SqlEjecutorService.cs](https://github.com/IntersistemasRcia/isg-api-pulso/blob/develop/isg-api-pulso/Services/SqlEjecutorService.cs) (`sys.procedures` + `sys.parameters` + comentario `-- Pulso:` en `sys.sql_modules`).

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

En el cuerpo del SP (línea de comentario):

```sql
-- Pulso: <texto de negocio 1-2 frases>
```

Si el SP no tiene el comentario, la API debe devolver `descripcion: null` (sin error). El front usa entonces un fallback humanizado desde el nombre.

El front (`normalizeArquitectura.ts`):

- Prefiere `descripcion` del API; si falta, `humanizeSpDescription`.
- Usa `parametros` del API (filtra `esOutput: true` y denylist de variables de cuerpo).
- **No mete `CodigoSQL` en el prompt** → menos tokens.
- Fallback: si llega `?includeSql=true`, parsea solo la firma `CREATE PROC … AS`.

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
  "limiteFilas": 50
}
```

**Compat:** si el API aún devuelve un array crudo de filas, el front lo normaliza a `{ ok, rows, totalRows }`.

**Body opcional:** `limiteFilas` — el API debería materializar como máximo N filas en la respuesta (el SP puede seguir corriendo entero en SQL Server).

**Errores:** `{ "error": "...", "detalle": "..." }` con HTTP 400/500.

### Gate de resultados grandes (`RESULT_LARGE`)

Umbral de negocio: **50 filas** (todos los SP, no solo Get*).

1. Primera ejecución: el front pide `limiteFilas: 51` (probe). Si `totalRows > 50` o `truncated`, la tool devuelve `ok:false` + `code: RESULT_LARGE` **sin** dataset al LLM.
2. Si hay parámetros opcionales no usados → ofrecer filtrar / primeros 50 / completo (N).
3. Si no hay opcionales → solo primeros 50 vs completo (N).
4. Reejecución: `modoResultado=preview50|completo` o con filtros nuevos.

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
| Sin `descripcion` en arquitectura | Comentario `-- Pulso:` ausente en el SP, o API aún no parsea `sys.sql_modules` |
| «No tengo acceso al catálogo de marcas» | `GetMarcas` ausente del slim (0 params / INNER JOIN) o el LLM no llamó tool; verificar `/SPs_arquitectura` y limpiar LS `pulso.sp.arquitectura.v3` |
| «No hay ventas de junio» y luego sí con año | Alucinación sin tool o mes sin año; el prompt fuerza año calendario actual + tool antes de negar |
| «No se pudo acceder» sin tool en Network | El modelo inventó un fallo; el prompt + `formatClosestAlternativesHint` deben ofrecer 1–2 alternativas de negocio |
| Connection a otra base (Biamaq vs Cheek) | Alinear connection string de isg-api-pulso a la DB donde están los SP Vision |
| `IDSucursal` sale `requerido: true` con `= NULL` | Backend sin parseo de firma o LS viejo. Redeploy + clear `pulso.sp.arquitectura.v3` |
| Ver SPs candidatos del turno | Network → `POST /api/chat` → headers `X-Pulso-Sp-Candidates`, o chat `?debug=1` |
| Ver SP **ejecutado** / fallido | `pm2 logs` → `[pulso] exec sp=… ok=… paramsKeys=… missing=…`; o `?debug=1` → “SP ejecutado / intentado” |
| `messages` vs `raw_messages` en log `[chat]` | `raw_messages` = historial del cliente; `messages` = tras `windowMessages` (últimos 12). Tokens crecen con la ventana + tool results (`tool_results_kb`) |
| Chat pregunta 50 vs completo en listados grandes | Esperado: `RESULT_LARGE` (umbral 50). Log: `code=RESULT_LARGE` |
| `limiteFilas` no reduce payload | Backend aún no implementa el wrapper; el front igual hace gate si `totalRows > 50` |

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
"descripcion" (string|null) extraída del comentario -- Pulso: en el código del SP,
sin fallar si el comentario no existe.

Archivos: Controllers/EjecutorController.cs, Services/SqlEjecutorService.cs,
Services/ISqlEjecutorService.cs.

Hoy el slim solo JOINea sys.parameters (SP sin params no aparecen). Cambiá a:
1) Listar sys.procedures WHERE name LIKE 'sp_ISG_Vision_%'
2) LEFT JOIN sys.sql_modules (definition; puede ser null)
3) LEFT JOIN sys.parameters + sys.types
4) Por cada SP: descripcion = TryExtractPulsoComment(definition)

TryExtractPulsoComment:
- Primera línea que tras TrimStart empiece con "-- Pulso:" (OrdinalIgnoreCase)
- Resto de la línea, trim, max 500 chars
- Sin match / definition null / vacío → null
- Nunca throw por parseo

Respuesta slim camelCase por ítem:
{ nombreSp, descripcion, parametros: [{ nombre, tipo, requerido, tieneDefault, esOutput }] }
- parametros puede ser []
- requerido debe ser !tieneDefault (defaults desde firma T-SQL; ver prompt de requerido arriba)
- NO devolver CodigoSQL en slim (solo usarlo en memoria para el comentario)
- Preferí DTO tipado en lugar de dynamic anónimo
- includeSql=true puede seguir legacy { NombreSP, CodigoSQL }
- No cambiar POST ejecutar-sp ni el prefijo sp_ISG_Vision_

Aceptación:
- Con comentario → descripcion poblada
- Sin comentario → 200, descripcion null
- Sin params → aparece con parametros []
- definition null → descripcion null, sin 500
```

