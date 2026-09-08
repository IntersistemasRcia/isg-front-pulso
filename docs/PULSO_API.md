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

El front (`normalizeArquitectura.ts`) confía en `requerido` del API; si falta, deriva `!tieneDefault`.

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

**Capa LLM vs API:** la tool `ejecutarConsultaPulso` recibe parámetros como lista `{ nombre, valor }` (compatibilidad Groq/OpenAI tools); el servidor las convierte a `parametros: Record<string, unknown>` antes del POST.

**Respuesta exitosa:** array JSON de filas (`IEnumerable<dynamic>`), no un wrapper `{ data: … }`.

**Errores:** `{ "error": "...", "detalle": "..." }` con HTTP 400/500.

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
| `IDSucursal` sale `requerido: true` con `= NULL` | Backend no infiere default desde definition (has_default_value T-SQL = 0). Ver prompt abajo + limpiar LS v3 |
| Ver SPs candidatos del turno | Network → `POST /api/chat` → headers `X-Pulso-Sp-*`, o chat con `?debug=1` |

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

