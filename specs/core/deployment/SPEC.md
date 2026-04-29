# Deployment — Core Spec

> **Snapshot spec (2026-04-29).** Documenta cómo se despliega WorkSuite a producción y qué piezas externas necesita. Sin esto, reconstruir = adivinar entornos, dominios, secrets y crons.

## Overview

WorkSuite vive en **Vercel** (frontend + backend serverless) y **Supabase** (Postgres + Auth + Storage + Edge Functions). No hay otra infraestructura: ni Docker, ni Kubernetes, ni servidores propios. Cada deploy es un push a `main` que dispara dos build pipelines paralelos en Vercel — uno para `apps/web` y otro para `apps/api`.

## Hosts

| Pieza | URL prod | Vercel project ID |
|---|---|---|
| Frontend | `worksuite-phi.vercel.app` | `prj_i5qZLADGfAJb6WZ9VpJFUhrtwHqw` |
| Backend | `worksuite-api.vercel.app` | `prj_Hh8mCQGmSbPTYrcU6GMlpZAxcjVD` |
| Database / Auth / Storage | `enclhswdbwbgxbjykdtj.supabase.co` | Supabase project `enclhswdbwbgxbjykdtj` |

Vercel team: `team_O0LMo9mzgF91fZTJ1mJg7yJw` (`ignaciozitare-9429`).

## Configuración Vercel

### Frontend (`vercel.json` raíz del repo)

```json
{
  "version": 2,
  "buildCommand": "cd apps/web && npm install && npm run build",
  "outputDirectory": "apps/web/dist",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

- El `rewrites` es para SPA routing — todas las URLs van a `index.html` y React Router decide qué renderizar.
- `npm install` se hace en `apps/web` (no en raíz) — el monorepo es npm workspaces así que el install resuelve linked packages.
- Output: `apps/web/dist/`.

### Backend (`apps/api/vercel.json`)

```json
{
  "version": 2,
  "builds": [{ "src": "api/index.ts", "use": "@vercel/node", "config": { "includeFiles": ["src/**", "package.json"] } }],
  "routes": [{ "src": "/(.*)", "dest": "/api/index.ts", "headers": { ... CORS abierto ... } }],
  "crons": [
    { "path": "/email-intel/ingest/cron", "schedule": "0 9 * * *" }
  ]
}
```

- Entry serverless: `apps/api/api/index.ts` re-emite el request al Fastify app.
- `includeFiles` empaqueta TODO el `src/` para que el bundle serverless tenga acceso a todo el código compilado.
- CORS wildcard — protección real es JWT.
- Cron diario para Email Intelligence (Vercel Hobby solo permite daily — memoria `vercel_hobby_cron_limit`).

## Variables de entorno

### Frontend (`apps/web/.env`, NO commiteado, gitignored)

| Var | Para qué |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Anon key de Supabase para queries del cliente |
| `VITE_API_BASE_URL` | URL del backend (`https://worksuite-api.vercel.app`) |

(verificar names exactos en `apps/web/src/shared/lib/`)

Vite expone solo vars con prefijo `VITE_*` al bundle.

### Backend (Vercel project settings → Environment Variables)

| Var | Para qué |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | Service role key (RLS bypass) — secret crítico |
| `SUPABASE_ANON_KEY` | Anon key — para `/auth/login` |
| `JWT_SECRET` | Verifica JWT de Supabase |
| `OPENAI_API_KEY` | LLM provider |
| `ANTHROPIC_API_KEY` | LLM provider |
| `GOOGLE_CLIENT_ID` | OAuth Gmail (Email Intel) |
| `GOOGLE_CLIENT_SECRET` | OAuth Gmail |
| `GOOGLE_REDIRECT_URI` | Callback Gmail OAuth |
| `EMAIL_INTEL_ENCRYPTION_KEY` | Encripta refresh tokens Gmail |
| `CRON_SECRET` | Valida que `/ingest/cron` lo dispara Vercel |

Configurar via dashboard Vercel o CLI `vercel env add`. **Memoria importante (`feedback_printf_not_echo`):** `printf` (no `echo`) cuando se piping a `vercel env add`, porque `echo` agrega `\n`.

## Estrategia de despliegue

### Branch strategy

- `main` → deploy automático a producción (frontend + backend).
- Cualquier feature branch (`feat/*`, `fix/*`, `refactor/*`) → preview deploy con URL única.
- PRs muestran link al preview.

### Workflow (CLAUDE.md regla)

1. Trabajo en feature branch (nunca commits directos a main excepto fixes triviales).
2. Push del branch → Vercel arma preview en ~2 min.
3. Verificar preview build verde antes de mergear (regla CLAUDE.md).
4. Smoke test del preview.
5. Merge `--no-ff` a main → Vercel arma prod en otros ~2 min.
6. Smoke test en prod (`worksuite-phi.vercel.app`).
7. Update WORK_STATE.md.

Si el preview falla → fix en el branch, no en main. Si prod falla → revert vía Vercel dashboard o hotfix branch.

### Promotion

Vercel auto-promueve cualquier deploy de `main` como producción. Si querés promover manualmente un deploy específico (ej. rollback a uno anterior), se hace **desde el dashboard Vercel UI** (regla CLAUDE.md — no usar `vercel promote` desde CLI sin ver lo que se está cambiando).

## Supabase

### Configuración

- **Region:** `eu-west-1`.
- **Postgres version:** 17 (verificado).
- **Auth:** email/password habilitado por default. SSO con Google/Microsoft posible vía `sso_config` table del workspace.
- **Storage:** un bucket activo: `user-avatars` (Profile module).
- **Edge Functions:** ninguna desplegada actualmente (los crons del email-intel viven en `apps/api`, no acá).
- **Realtime:** disponible pero solo usado puntualmente (verificar; podría no usarse en absoluto).

### Migraciones

Viven en `supabase/migrations/`. Se aplican manualmente vía Supabase MCP o el CLI. **No hay CI** que las aplique automáticamente — el operador (Claude o un humano) las ejecuta.

Ver `specs/core/migrations/SPEC.md` para el orden cronológico documentado.

### Backups

Supabase hace backups automáticos diarios (configurar retención). No hay export manual periódico — depende del plan.

## DNS / Dominios

Hoy WorkSuite usa los dominios `*.vercel.app` directos. No hay un dominio custom (`worksuite.app`, etc.). Si en futuro se agrega:

- Frontend: alias del dominio custom → `worksuite-phi.vercel.app`.
- Backend: alias del subdominio API → `worksuite-api.vercel.app`.
- Configurar en Vercel dashboard → Settings → Domains.

## Tokens y secrets de despliegue

- **Vercel PAT** — guardado en memoria (`vercel_token.md`). Permite scripts deployment vía CLI/MCP sin login interactivo.
- **Supabase access** — keys + token guardados en memoria (`supabase_access.md`). Permite queries DDL / DML desde Claude vía MCP.
- **GitHub** — el repo es público (`ignaciozitare/Worksuite`); commits requieren push access.

## Build local

### Frontend
```bash
cd apps/web
npm install   # primera vez
npm run dev   # http://localhost:5173 con HMR
npm run build # produce apps/web/dist/
```

### Backend
```bash
cd apps/api
npm install
npm run dev   # http://localhost:3000 (verificar puerto), tsx watch
npm run build # tsc → apps/api/dist/
npm start     # corre el build
```

## CI

**No hay CI propio.** El "CI" es el preview deploy de Vercel:
- Si compila → preview accesible.
- Si no compila → email a quien pushó y dashboard muestra build error.

Un agente (Claude vía CLAUDE.md flow) hace de Review/QA agent local antes de mergear, pero no hay GitHub Actions ni equivalente.

## Monitoring

| Capa | Hoy | Futuro deseable |
|---|---|---|
| Frontend errors | Browser console | Sentry / Vercel Analytics |
| Backend errors | Vercel logs (visualmente desde dashboard) | Sentry / Datadog |
| DB performance | Supabase dashboard → SQL Editor → query stats | pg_stat_statements export periódico |
| Cron success | Vercel cron logs | Alertas si falla N veces |

## Rollback

1. Identificar el último commit estable (`git log` o Vercel dashboard).
2. **Opción A — vía Vercel UI:** Deployments → buscar el deploy que querés → "Promote to Production". Inmediato, no requiere git revert.
3. **Opción B — vía git revert:** `git revert <bad-sha>` → push → Vercel re-deploya con el revert. Más lento (rebuild).
4. **Si la migración rompió DB:** ejecutar migración inversa **manual** vía SQL editor de Supabase. No hay rollback automático.

## Out of scope (en este snapshot)

- Multi-environment (staging) — todo va directo de preview a prod.
- Blue-green deploy.
- Canary releases.
- Feature flags runtime (LaunchDarkly, etc.).
- A/B testing infrastructure.
- CDN custom (Vercel ya tiene CDN incluido).
- Container-based deploy (Docker / Kubernetes).
- Self-hosted Supabase.
