# Multi-LLM en Pulso

Este documento describe cómo Pulso elige proveedores, modelos y claves API.

## Objetivos

- Ofrecer modelos **gratuitos** financiados por el despliegue (tier free).
- Permitir modelos **premium** con claves de empresa o **BYOK** (Bring Your Own Key) por usuario.
- Soportar un **LLM local** OpenAI-compatible (Ollama, LM Studio, vLLM) sin cambios en el front.
- Reintentar con modelos free alternativos ante **429 / rate limit** (no ante 413).

## Catálogo de modelos

| ID | Etiqueta | Tier | Proveedor | Env / BYOK |
| --- | --- | --- | --- | --- |
| `gemini-3.6-flash` | Gemini 3.6 Flash | free | Google (free key) | `GOOGLE_FREE_API_KEY` |
| `gemini-2.0-flash-lite` | Gemini 2.0 Flash Lite | free | Google (free key) | `GOOGLE_FREE_API_KEY` |
| `gpt-oss-120b` | GPT-OSS 120B | free | Groq | `GROQ_API_KEY` |
| `local-llm` | LLM Local (dinámico) | free | OpenAI-compatible | `LOCAL_LLM_*` |
| `gpt-4o-mini` | GPT-4o mini | premium | OpenAI | BYOK / `OPENAI_API_KEY` |
| `gpt-4o` | GPT-4o | premium | OpenAI | BYOK / `OPENAI_API_KEY` |
| `claude-sonnet-4-20250514` | Claude Sonnet 4 | premium | Anthropic | BYOK / `ANTHROPIC_API_KEY` |
| `gemini-2.5-pro` | Gemini 2.5 Pro | premium | Google | BYOK / `GOOGLE_API_KEY` |
| `gemini-2.5-flash` | Gemini 2.5 Flash ⭐ | premium | Google (hosted) | `GOOGLE_API_KEY` empresa |

> **⭐ Pulso IA Premium** – `gemini-2.5-flash` es el modelo del pack empresarial (1 proyecto GCP por cliente). Ver sección [Tier Hosted (Pulso IA Premium)](#tier-hosted-pulso-ia-premium).

Definición estática: `src/lib/llm/registry.ts`. Modelo local dinámico: `src/lib/llm/localLlmConfig.ts`.

## Prioridad de claves

Para cada solicitud de chat, `resolveModel()` aplica:

1. Clave BYOK del usuario (`data/byok/{userId}.json`, cifrada con `BYOK_ENCRYPTION_KEY`)
2. Variable de entorno de **empresa** (premium)
3. Variable de entorno **free** (solo modelos tier free)

## BYOK

- UI: `/dashboard/settings/ia`
- API: `GET|POST|DELETE /api/settings/ia`
- Almacenamiento: AES-256-GCM, directorio `data/byok/` (gitignored)
- Requiere `BYOK_ENCRYPTION_KEY` en el servidor (32+ caracteres recomendado)

## API de chat

- `POST /api/chat` — body `{ messages, modelId? }`. Default: `gemini-3.6-flash`.
- `GET /api/chat/providers` — lista modelos con flag `available`.
- Headers de respuesta opcionales: `X-Pulso-Model-Id`, `X-Pulso-Model-Source`.
- Headers en error: `X-Pulso-Requested-Model`, `X-Pulso-Failed-Model`.

## Normalización de mensajes

El cliente (`useChat`) puede enviar mensajes user duplicados en el body. El servidor aplica `normalizeChatMessages()` antes de ventanear el historial.

## Fallback ante errores del modelo

| Error | Fallback automático |
| --- | --- |
| 429 / cuota / rate limit | Sí — prueba otros modelos free configurados |
| 404 / modelo no disponible | Sí |
| 413 / request too large (Groq) | **No** — mensaje claro al usuario |
| Clave Google inválida | No — mensaje de configuración |

Si elegís GPT-OSS (Groq) y el request supera ~8000 tokens, **no** se hace fallback silencioso a Gemini. Si `LOCAL_LLM_ENABLED=1`, el LLM local entra en la cadena de fallback (mayor contexto).

## Groq (GPT-OSS 120B) y tokens

- Límite del proveedor: ~8000 tokens por request (TPM).
- Headroom 55% (~4400 tokens estimados como techo).
- `promptMode: tool-only` — catálogo vía tool, no en el system prompt.
- Ventana de historial: 4 mensajes.
- SPs relevantes: máximo 4 en ranking.
- Tool results: 2048 bytes / 15 filas.
- Historial: respuestas de asistente y tool outputs antiguos se compactan.

Recomendación: para consultas largas o multi-turn, usar **LLM Local** o Gemini en lugar de Groq.

## GOOGLE_FREE_API_KEY

- API key de [Google AI Studio](https://aistudio.google.com/apikey).
- Formatos válidos (2026):
  - **Standard (legacy):** `AIzaSy…`
  - **Auth (nuevo):** `AQ.Ab…`
- Si el formato es incorrecto, Gemini free no aparece en el selector.

## LLM local (OpenAI-compatible)

Configuración 100% en el servidor. El front solo consume `/api/chat/providers`.

```env
LOCAL_LLM_ENABLED=1
LOCAL_LLM_BASE_URL=http://127.0.0.1:11434/v1   # Ollama
LOCAL_LLM_API_KEY=ollama
LOCAL_LLM_MODEL=qwen2.5:7b
LOCAL_LLM_LABEL=LLM Local (Ollama)
LOCAL_LLM_MAX_INPUT_TOKENS=8192
LOCAL_LLM_MAX_AGENT_STEPS=3
```

Compatible con Ollama, LM Studio, vLLM, LocalAI, etc. Cambiar de motor = cambiar env, sin tocar el front.

### Rendimiento (Ollama / CPU)

Pulso optimiza automáticamente el modelo local:

| Ajuste | Valor | Motivo |
| --- | --- | --- |
| `promptMode` | `compact` | Catálogo reducido en prompt + params; evita preguntar SP al usuario |
| `requireToolOnFirstStep` | sí | Obliga ejecutar consulta antes de hablar |
| `messageWindowSize` | 4 | Historial corto |
| `toolResultMaxRows` | 15 | Menos datos ERP en el contexto |
| `maxAgentSteps` | 2 (env) | 1 tool + 1 respuesta |
| `streaming` | sí | Respuesta progresiva; ayuda con timeouts IIS/ARR |

Recomendaciones de infra:

- Modelo cuantizado (`qwen2.5:7b-q4_K_M`) o más chico (`qwen2.5:3b`) en CPU.
- `OLLAMA_KEEP_ALIVE=24h` para evitar cold start.
- IIS ARR: timeout del proxy ≥ **300 s** en `/api/chat`.
- `POST /api/chat` declara `maxDuration = 300` en Next.js.

Si la consulta sigue lenta, bajá `LOCAL_LLM_MAX_AGENT_STEPS=2` o usá Gemini/Groq para uso diario.

### Logs y diagnóstico de Ollama (Windows)

`ollama ps` solo muestra modelos cargados en memoria; **no escribe un archivo de log** por defecto.

| Qué ver | Cómo |
| --- | --- |
| Modelo activo | `ollama ps` en PowerShell |
| Probar inferencia directa | `ollama run qwen2.5:7b "hola"` |
| Logs verbosos | Detener servicio Ollama y ejecutar en consola: `$env:OLLAMA_DEBUG="1"; ollama serve` |
| Carpeta de datos | `%LOCALAPPDATA%\Ollama\` (modelos, config) |
| Logs de Pulso | Consola o salida del servicio Windows donde corre `npm start` / Node — buscá líneas `[chat] model=local-llm` |

Si Ollama corre como **servicio Windows**, los logs van al visor de eventos o no se persisten; para depurar, ejecutalo manualmente con `ollama serve` en una ventana de consola.

## Variables de entorno

```env
GOOGLE_FREE_API_KEY=   # Gemini free (AIza… o AQ.…)
GROQ_API_KEY=          # GPT-OSS 120B vía Groq
LOCAL_LLM_ENABLED=     # 1 para activar LLM local
LOCAL_LLM_BASE_URL=
LOCAL_LLM_MODEL=
OPENAI_API_KEY=        # Premium empresa
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=        # Gemini premium empresa
BYOK_ENCRYPTION_KEY=   # Cifrado BYOK
```

## Cliente (selector de modelo)

- Componente: `src/components/chat/ModelSelector`
- Persistencia: `localStorage` clave `pulso.chat.modelId` (`MODEL_STORAGE_KEY`)
- El transport de `useChat` envía `modelId` en el body de `/api/chat`.

## Tier Hosted (Pulso IA Premium)

El pack "Pulso IA Premium" usa `gemini-2.5-flash` con una **API Key de tu cuenta GCP empresa**, una por cliente (1 proyecto GCP por cliente, misma Billing Account).

### Arquitectura GCP recomendada

```
Tu cuenta empresa (1 Billing Account)
├── Proyecto: "pulso-cliente-empresa-a"  → API Key A + Spend Cap $X/mes
├── Proyecto: "pulso-cliente-empresa-b"  → API Key B + Spend Cap $Y/mes
└── Proyecto: "pulso-cliente-empresa-c"  → API Key C + Spend Cap $Z/mes
```

- **Spend Cap (USD)**: se configura en GCP → Billing → Budgets & Alerts → "Acción de facturación: deshabilitar la API". Corta automáticamente si el cliente supera el tope.
- **Cuota por minuto (TPM)**: configurar en GCP → APIs & Services → Quotas (recomendado: 50.000 TPM inicial).
- **Restricción de clave**: en GCP → Credentials → restricción de HTTP referrer al dominio del cliente.

### Variables de entorno (`.env.production` del cliente)

| Variable | Descripción | Ejemplo |
|---|---|---|
| `GOOGLE_API_KEY` | Clave del proyecto GCP del cliente | `AIzaSy…` |
| `HOSTED_LLM_ENABLED` | Activa el tier hosted | `1` |
| `HOSTED_GCP_PROJECT_ID` | ID del proyecto GCP (para logs/UX) | `pulso-cliente-empresa-a` |
| `HOSTED_DAILY_CHATS` | Cupo diario de chats (soft limit Pulso) | `200` |
| `HOSTED_MONTHLY_TOKENS` | Tokens estimados/mes (soft limit Pulso) | `5000000` |
| `HOSTED_NEAR_DAILY_RATIO` | Fracción para aviso "cerca del límite" | `0.8` |
| `HOSTED_NEAR_MONTHLY_RATIO` | Fracción para aviso "cerca del límite mensual" | `0.8` |
| `HOSTED_MAX_TOKENS_PER_MIN` | Soft limit de TPM en Pulso | `50000` |

> Los soft limits de Pulso emiten avisos amigables **antes** de que GCP corte con error duro.

### Parseo de errores Gemini (backend)

Pulso parsea el body del error de Gemini para diferenciar:

| Código GCP | Tipo detectado | Mensaje al usuario |
|---|---|---|
| `BILLING_DISABLED` / `billing.*exceeded` | `spend_cap` | "Límite mensual del plan alcanzado" |
| `RESOURCE_EXHAUSTED` + `PerDay` | `daily` | "Cupo diario alcanzado" |
| `RATE_LIMIT_EXCEEDED` + `PerMinute` | `minute` | "Demasiadas consultas, esperá 1 min" |

Implementado en `src/lib/llm/llmErrors.ts` → `getGeminiQuotaKind()` y `buildQuotaExceededMessage(error, isHosted)`.

### Seguridad de la API Key en on-prem

- La `GOOGLE_API_KEY` vive en `.env.production` (o `.env.local` gitignored).
- Para mayor hardening: usar Windows Credential Manager + script de lectura en `next.config.ts`.
- Cada cliente tiene su propia clave → compromiso de una clave no afecta a otros.

## Seguridad

- Las claves BYOK **nunca** se envían al navegador en claro; solo máscaras (`sk-…abcd`).
- `data/byok/` debe respaldarse y restringirse a nivel filesystem en el servidor Windows.
- No commitear `.env.local` ni `/data/`.
