# Pulso ISG — Frontend Copilot (On-Premise)

Aplicación Next.js (App Router) para login y chat con IA sobre datos SQL del cliente.

## Requisitos

- Node.js 20+
- Variables de entorno (ver `.env.example`)

## Desarrollo

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

## Autenticación

- Dev (`npm run dev`): usa [`.env.development`](.env.development) → `AUTH_API_URL=http://api.intersistemas.ar:8601`
- Prod (`npm start`): usa [`.env.production`](.env.production) → `AUTH_API_URL=http://localhost:8601` (mismo servidor)
- Proxy Next: `POST /api/auth/login` → `POST {AUTH_API_URL}/api/Auth/Login` con `{ usuario, password }`
- Tras login: cookie HttpOnly `pulso_token` (middleware del dashboard) + fallback `localStorage` (`pulso_jwt` / `pulso_user`). Header alternativo `x-pulso-token` cuando IIS/ARR elimina `Authorization`.
- Sesión: `GET /api/auth/session` valida el JWT antes de marcar `sessionReady` en `AuthProvider`.
- Secretos (`OPENAI_API_KEY`, `JWT_SECRET`, claves LLM) van en `.env.local` (no se versionan)

## Documentación

| Doc | Contenido |
|-----|-----------|
| [docs/PULSO_API.md](docs/PULSO_API.md) | Integración [isg-api-pulso](https://github.com/IntersistemasRcia/isg-api-pulso): arquitectura, ejecutar-sp, gate 50 filas, contratos `develop` |
| [docs/PULSO_SP_METADATA.md](docs/PULSO_SP_METADATA.md) | Estándar `/*-- Pulso: */`, catálogos, ParamIntent |
| [docs/LLM.md](docs/LLM.md) | Multi-LLM, BYOK, ventana por modelo, `prepareChatPrompt` |
| [docs/BACKEND_EJECUTAR_SP_RESULT_SIZE.md](docs/BACKEND_EJECUTAR_SP_RESULT_SIZE.md) | Stub → ver gate en `PULSO_API.md` |

## Multi-LLM, tier free y BYOK

Pulso soporta varios proveedores de modelos con prioridad de claves:

1. **BYOK del usuario** (claves cifradas en `data/byok/`, ver Configuración IA)
2. **Claves de empresa** en variables de entorno (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`)
3. **Tier free del despliegue** (`GOOGLE_FREE_API_KEY`, `GROQ_API_KEY`)

Modelos gratuitos por defecto: **Gemini 3.6 Flash** y **GPT-OSS 120B** vía Groq (opcional).

Modelos premium: GPT-4o, Claude Sonnet, Gemini 2.5 Pro (requieren BYOK o claves de empresa).

Detalle: [docs/LLM.md](docs/LLM.md).

## Ramas

- `develop` — rama por defecto de desarrollo
- `main` — producción

## Estilos

CSS Modules + wrappers MUI en `@/components/ui` (no importar `@mui/material` desde páginas).

Helpers puros en `src/utils/`. Orquestación de chat en `src/lib/chat/`. Resolución de modelos en `src/lib/llm/`.