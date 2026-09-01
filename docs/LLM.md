# Multi-LLM en Pulso

Este documento describe cómo Pulso elige proveedores, modelos y claves API.

## Objetivos

- Ofrecer modelos **gratuitos** financiados por el despliegue (tier free).
- Permitir modelos **premium** con claves de empresa o **BYOK** (Bring Your Own Key) por usuario.
- Reintentar con modelos free alternativos ante **429 / rate limit** (no ante 413).

## Catálogo de modelos

| ID | Etiqueta | Tier | Proveedor | Env / BYOK |
| --- | --- | --- | --- | --- |
| `gemini-3.6-flash` | Gemini 3.6 Flash | free | Google (free key) | `GOOGLE_FREE_API_KEY` |
| `gemini-2.0-flash-lite` | Gemini 2.0 Flash Lite | free | Google (free key) | `GOOGLE_FREE_API_KEY` |
| `gpt-oss-120b` | GPT-OSS 120B | free | Groq | `GROQ_API_KEY` |
| `gpt-4o-mini` | GPT-4o mini | premium | OpenAI | BYOK / `OPENAI_API_KEY` |
| `gpt-4o` | GPT-4o | premium | OpenAI | BYOK / `OPENAI_API_KEY` |
| `claude-sonnet-4-20250514` | Claude Sonnet 4 | premium | Anthropic | BYOK / `ANTHROPIC_API_KEY` |
| `gemini-2.5-pro` | Gemini 2.5 Pro | premium | Google | BYOK / `GOOGLE_API_KEY` |

Definición en código: `src/lib/llm/registry.ts`.

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

Si elegís GPT-OSS (Groq) y el request supera ~8000 tokens, **no** se hace fallback silencioso a Gemini.

## Groq (GPT-OSS 120B) y tokens

- Límite de input del proveedor: ~8000 tokens (TPM/request).
- El servidor usa headroom 65% (~5200 tokens estimados como techo de prompt).
- `promptMode: minimal` por defecto para este modelo.
- Resultados ERP truncados a 4096 bytes / 25 filas en tool results.
- Historial: tool outputs de turnos anteriores se compactan antes de enviar al modelo.
- Follow-ups cortos («en el mes de junio»): el ranking de SPs usa los últimos 3 mensajes user.

Recomendación: si una consulta falla por tamaño, reformular en una sola pregunta completa o iniciar un chat nuevo.

## GOOGLE_FREE_API_KEY

- Debe ser una API key de [Google AI Studio](https://aistudio.google.com/apikey).
- Formato válido: empieza con `AIzaSy…`
- Si la variable existe pero el formato es incorrecto, los modelos Gemini free aparecen como no disponibles y el servidor loguea una advertencia.

## Variables de entorno

```env
GOOGLE_FREE_API_KEY=   # Gemini free tier (AIzaSy…)
GROQ_API_KEY=          # GPT-OSS 120B free vía Groq (opcional)
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
