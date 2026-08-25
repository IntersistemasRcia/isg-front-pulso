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
- Secretos (`OPENAI_API_KEY`, `JWT_SECRET`) van en `.env.local` (no se versionan)

## Ramas

- `develop` — rama por defecto de desarrollo
- `main` — producción

## Estilos

CSS Modules + wrappers MUI en `@/components/ui` (no importar `@mui/material` desde páginas).

Helpers puros en `src/utils/`. Orquestación de chat en `src/lib/chat/`.
