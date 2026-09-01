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
LOCAL_LLM_MODEL=llama3.1
LOCAL_LLM_LABEL=LLM Local (Ollama)
LOCAL_LLM_MAX_INPUT_TOKENS=32768
```

Compatible con Ollama, LM Studio, vLLM, LocalAI, etc. Cambiar de motor = cambiar env, sin tocar el front.

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

## Seguridad

- Las claves BYOK **nunca** se envían al navegador en claro; solo máscaras (`sk-…abcd`).
- `data/byok/` debe respaldarse y restringirse a nivel filesystem en el servidor Windows.
- No commitear `.env.local` ni `/data/`.
