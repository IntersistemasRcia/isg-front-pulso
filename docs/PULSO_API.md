# Integración con isg-api-pulso

Repositorio backend: [IntersistemasRcia/isg-api-pulso](https://github.com/IntersistemasRcia/isg-api-pulso) (rama `develop`)

**Metadatos de SP (comentario `/*-- Pulso:`):** estándar canónico en [PULSO_SP_METADATA.md](./PULSO_SP_METADATA.md) — prefijo `sp_ISG_Vision_`, fechas `dd/MM/yyyy`, TIPO / PROPÓSITO / GRANULARIDAD / PARÁMETROS / INTERACCIÓN. El proxy `GET /api/pulso/arquitectura?refresh=1` (login y badge ERP) salta el cache de 5 min para ver SPs nuevos de inmediato.

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

Fuente: [SqlEjecutorService.cs](https://github.com/IntersistemasRcia/isg-api-pulso/blob/develop/isg-api-pulso/Services/SqlEjecutorService.cs) (`sys.procedures` + `sys.parameters` + comentario `-- Pulso:` / `/*-- Pulso:` en `sys.sql_modules`).

**Parser Pulso (`TryExtractPulsoComment`):** en `develop` remoto el tope es **`maxLen = 3000`** (commit *Increase max length for content truncation to 3000 chars*). El front alinea con `PULSO_DESC_PROMPT_MAX = 3000`. Si un entorno truncara a 1000, el clone/deploy de isg-api-pulso está **atrasado** respecto a `develop` → `git pull` / redeploy.

**Deuda cosmética en API:** el comentario de `SpArquitecturaDto.Descripcion` puede seguir diciendo “máx 500”; no afecta el runtime (solo el XML/comentario del DTO).

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

En el cuerpo del SP, comentario Pulso (línea **o** bloque). Contenido útil **máx. 3000 caracteres** (el API colapsa whitespace; `TryExtractPulsoComment` → `maxLen = 3000`).

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

- Meta ~1500–3000 chars de contenido útil (tope 3000).
- Primero negocio + params/enums; si sobra presupuesto, enriquecer con resultado y contexto técnico **traducido a negocio** (tablas/joins explicados).
- SP sin params: decirlo explícito («ejecutar tal cual; no pedir filtros»).
- Formato válido: `-- Pulso:` (una línea) o `/*-- Pulso: … */`.
- Enums: literal exacto + significado; **sin** mapas de sinónimos.
- Filtrar el mismo informe = cambiar el parámetro; si hay duda, ofrecer opciones.
- Doc técnica muy larga puede vivir en otro `/* … */` sin prefijo Pulso.

Si el SP no tiene el comentario, la API debe devolver `descripcion: null` (sin error). El front usa entonces un fallback humanizado desde el nombre.

El front (`normalizeArquitectura.ts` / `catalog.ts`):

- Prefiere `descripcion` del API; si falta, `humanizeSpDescription`.
- Incluye hasta **3000** chars de descripción en el prompt (`full`); menos en `compact`/`minimal`.
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

**Body opcional:** `limiteFilas` — el API materializa como máximo N filas en la respuesta (sentinel `N+1`; el SP puede seguir corriendo en SQL Server). Sin `limiteFilas`, aplica cap de seguridad `MaxFilasSinLimite` (default **50000**, configurable en appsettings).

**Tokens (historial):** el front compacta tool outputs de turnos previos (`compactUiMessagesForModel`) y reaplica `toModelOutput` al convertir a mensajes del modelo, para no reenviar `rows` al LLM. La ventana de historial es **por modelo** (`messageWindowSize` en el registry / local LLM; default de `windowMessages` = 12 si el modelo no define otra).

**Errores:** `{ "error": "...", "detalle": "..." }` con HTTP 400/500.

### Gate de resultados grandes

Umbral de negocio: **50 filas** (`RESULT_LARGE_THRESHOLD` en `resultSizeGate.ts`).

1. Primera ejecución (sin `modoResultado`): `limiteFilas: 50` (probe).
2. Si el API responde con **`totalRows` real** + `truncated` / `totalRowsExact: true` → el front muestra adelanto de 50, dice el total exacto y **no** trae todo el listado todavía.
3. Excel solo con `modoResultado=completo` y **más de 50** filas.
4. Si el COUNT no es fiable (`totalRowsExact: false` o `totalRows` = tamaño del lote) → el front dice “más de 50” y **no inventa 51**.

#### Contrato API (ya en `develop`)

| Campo | Significado |
|-------|-------------|
| `rows` | Hasta N filas materializadas |
| `truncated` | Hubo más filas que el límite (o se chocó el cap sin límite) |
| `totalRows` | Total reportado (idealmente COUNT real) |
| `totalRowsExact` | `true` solo si el total se contó de verdad |
| `limiteFilas` | Eco del body (o `null`) |

Comportamiento verificado en [SqlEjecutorService.cs](https://github.com/IntersistemasRcia/isg-api-pulso/blob/develop/isg-api-pulso/Services/SqlEjecutorService.cs): `IDataReader` + sentinel `limiteFilas+1`; si `truncated`, un 2.º pass puede contar filas (correcto pero costoso en CPU/DB).

| Respuesta API | Front |
|---------------|--------|
| `truncated` + `totalRowsExact: true` + total > 50 | Adelanto 50 + dice el total; Excel solo con `modoResultado=completo` |
| `totalRowsExact: false` | Dice “más de 50”; no inventa 51 |
| `totalRows ≤ 50` | Tabla completa, sin Excel |

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
| Sin `descripcion` en arquitectura | Comentario `-- Pulso:` / `/*-- Pulso:` ausente, o API aún no parsea bloque/3000 chars en `sys.sql_modules` |
| «No tengo informe específico» al filtrar el mismo listado | Descripción sin significados de enum, o LLM ignora filtros; ver systemPrompt «Filtros del mismo informe» + limpiar LS |
| «No tengo acceso al catálogo de marcas» | `GetMarcas` ausente del slim (0 params / INNER JOIN) o el LLM no llamó tool; verificar `/SPs_arquitectura` y limpiar LS `pulso.sp.arquitectura.v3` |
| «No hay ventas de junio» y luego sí con año | Alucinación sin tool o mes sin año; el prompt fuerza año calendario actual + tool antes de negar |
| «No se pudo acceder» sin tool en Network | El modelo inventó un fallo; el prompt + `formatClosestAlternativesHint` deben ofrecer 1–2 alternativas de negocio |
| Connection a otra base (Biamaq vs Cheek) | Alinear connection string de isg-api-pulso a la DB donde están los SP Vision |
| `IDSucursal` sale `requerido: true` con `= NULL` | Backend sin parseo de firma o LS viejo. Redeploy + clear `pulso.sp.arquitectura.v3` |
| Ver SPs candidatos del turno | Network → `POST /api/chat` → headers `X-Pulso-Sp-Candidates`, o chat `?debug=1` |
| Ver SP **ejecutado** / fallido | `pm2 logs` → `[pulso] exec sp=… ok=… paramsKeys=… missing=…`; o `?debug=1` → “SP ejecutado / intentado” |
| `messages` vs `raw_messages` en log `[chat]` | `raw_messages` = historial del cliente; `messages` = tras `windowMessages` (**ventana por modelo**, p. ej. 4 en Groq/local, 10–12 en otros). Tokens crecen con la ventana + tool results (`tool_results_kb`) |
| Chat muestra “51 marcas” y luego 1962 | API sin COUNT real (`totalRows`=lote / `totalRowsExact=false`). Front ya no afirma 51 en ese caso |
| “Ver todos” solo muestra ~50 filas | Pedir `modoResultado=completo` → Excel + adelanto 50 |
| `limiteFilas` no reduce payload | Deploy de isg-api-pulso sin wrapper; el front igual hace gate si detecta overflow. En `develop` el wrapper ya existe |
| Descripciones cortadas a ~1000 chars | API/deploy atrasado respecto a `develop` (`maxLen` ya es 3000) |

## Debug operativo (PM2 + `?debug=1`)

- Log siempre (también production): `[pulso] exec sp=… ok=true|false ms=… paramsKeys=FechaDesde,FechaHasta [code=…] [missing=…] [rows=N]`
- Chat con `?debug=1`: panel con candidatos (headers) + **todas** las tool calls del último turno assistant (ok / fail / missing).
- No hay header `X-Pulso-Sp-Executed` (streaming lo vaciaría); la fuente de verdad en servidor es el log.

## Estado de contratos en isg-api-pulso (`develop`)

Ya implementado (no rehacer con prompts históricos):

| Contrato | Estado |
|----------|--------|
| Wrapper `ejecutar-sp` (`ok` / `rows` / `totalRows` / `truncated` / `limiteFilas` / `totalRowsExact`) | Sí |
| Sentinel `limiteFilas + 1` + cap `MaxFilasSinLimite` (default 50000) | Sí |
| `tieneDefault` / `requerido = !tieneDefault` (firma T-SQL + `has_default_value`) | Sí |
| `descripcion` desde `-- Pulso:` / `/*-- Pulso:` | Sí |
| `TryExtractPulsoComment` tope **3000** chars | Sí (`develop` ≥ `7d3b052`) |

Mejoras opcionales en la API (fuera del front): abaratar el 2.º pass de COUNT al truncar; corregir el comentario del DTO “máx 500” → “máx 3000”.

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
- Tope duro del contenido útil: 3000 caracteres (sin contar /*-- Pulso: / -- Pulso: / */).
- Meta: llenar entre 1500 y 3000 chars siempre que haya material útil en el SP.
- Prioridad de llenado (en orden; no saltees lo alto por lo bajo):
  P0) Qué hace + cuándo usarlo (negocio).
  P1) Parámetros (o “sin parámetros”) + enums con literales exactos + defaults.
  P2) Cómo filtrar / reusar / qué ofrecer si hay duda; qué pedir si faltan datos.
  P3) Columnas/resultado de negocio que devuelve (si se deduce del SELECT/comentarios).
  P4) Contexto técnico TRADUCIDO A NEGOCIO (solo si aún estás bajo ~2500–3000 chars):
      orígenes de datos, relaciones, reglas especiales (NC con signo negativo, descuentos
      globales, impuestos internos dentro de no gravado, etc.).
      Podés nombrar tablas/joins si aportan, pero SIEMPRE explicá qué representan en negocio
      (ej. «cabecera de ventas/pedidos», «detalle impositivo por línea», «maestro de clientes»).
- Si con P0–P3 ya rozás 3000, NO agregues P4.
- Si estás bajo ~1500 y el SP tiene cuerpo rico, SÍ expandí con P3/P4 hasta acercarte a 2500–3000.
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
[ ] Contenido ≤ 3000 chars; ideal ≥ 700 si el SP da material
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
