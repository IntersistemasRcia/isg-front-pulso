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

## Arquitectura

- **On-premise por cliente**: cada instancia usa rutas relativas `/api/...` o `NEXT_PUBLIC_API_URL`.
- **Auth**: `POST /api/auth/login` proxy a `AUTH_API_URL` (API_Auth). JWT en cookie + localStorage.
- **Chat**: `POST /api/chat` valida JWT, llama OpenAI con tools (SPs) y despacha al agente local `.NET` (`LOCAL_AGENT_URL` + `X-API-Key`).

## Ramas

- `develop` — rama por defecto de desarrollo
- `main` — producción

## Estilos

CSS Modules + wrappers MUI en `@/utils/ui` (no importar `@mui/material` desde páginas).
