# Multi-LLM en Pulso

Este documento describe cómo Pulso elige proveedores, modelos y claves API.

## Objetivos

- Ofrecer modelos **gratuitos** financiados por el despliegue (tier free).
- Permitir modelos **premium** con claves de empresa o **BYOK** (Bring Your Own Key) por usuario.
- Reintentar con modelos free alternativos ante **429 / rate limit**.

## Catálogo de modelos

| ID | Etiqueta | Tier | Proveedor | Env / BYOK |
| --- | --- | --- | --- | --- |
| `gemini-2.0-flash` | Gemini 2.0 Flash | free | Google (free key) | `GOOGLE_FREE_API_KEY` |
| `llama-3.3-70b-versatile` | Llama 3.3 70B | free | Groq | `GROQ_API_KEY` |
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

- `POST /api/chat` — body `{ messages, modelId? }`. Default: `gemini-2.0-flash`.
- `GET /api/chat/providers` — lista modelos con flag `available`.
- Headers de respuesta opcionales: `X-Pulso-Model-Id`, `X-Pulso-Model-Source`.

## Fallback ante 429

Si el modelo solicitado devuelve rate limit, el servidor prueba la cadena de modelos free definida en `getFallbackChain()`.

## Variables de entorno

```env
GOOGLE_FREE_API_KEY=   # Gemini free tier
GROQ_API_KEY=          # Llama free (opcional)
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