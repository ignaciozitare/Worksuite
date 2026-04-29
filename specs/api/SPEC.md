# `apps/api` — Backend Spec

> **Snapshot spec (2026-04-29).** Documenta el backend Fastify de WorkSuite que vive en `apps/api/`. Sin este spec, no se podría reconstruir el lado servidor: rutas, auth, integración Jira, Email Intelligence con LLM, MCP, cron jobs.

## Overview

`@worksuite/api` es un backend serverless en **Fastify + TypeScript** desplegado a Vercel (`worksuite-api.vercel.app`). Sigue arquitectura hexagonal (domain / application / infrastructure) idéntica a la del frontend para que los conceptos de negocio sean consistentes en ambos lados.

Sus responsabilidades:
1. **Auth proxy** — login/me sobre Supabase Auth (el frontend también puede hablar directo con Supabase, pero el API expone `/auth` para clientes que no quieran integrar el SDK de Supabase).
2. **Worklog API** — CRUD de worklogs locales + sync a Jira.
3. **HotDesk API** — endpoints para reservas (legacy, hoy el frontend va directo a Supabase pero quedan estos endpoints).
4. **Jira proxy** — toda llamada Jira pasa por acá. Nunca el frontend habla directo con Jira (CLAUDE.md: secrets/API keys solo en backend).
5. **AI / LLM proxy** — chat IA y selección de modelos (OpenAI / Anthropic / etc.).
6. **Email Intelligence** — Gmail OAuth, polling de inbox, reglas, AI extraction, queue de detecciones.
7. **MCP server** — Model Context Protocol endpoint (`/mcp`) para que agentes externos (Claude IDE, Cursor) interactúen con la app.

## Stack

| Pieza | Versión | Para qué |
|---|---|---|
| **Fastify** | 4.x | Framework HTTP |
| **`@fastify/cors`** | 9.x | CORS — wildcard `*` por config Vercel (la API es pública, auth se hace por JWT) |
| **`@fastify/jwt`** | 8.x | JWT validation (Supabase access token) |
| **`@supabase/supabase-js`** | 2.43+ | Service-role client para queries con RLS bypass donde corresponda |
| **`@modelcontextprotocol/sdk`** | 1.29+ | MCP server SDK |
| **`zod`** | 3.23+ | Validation de schemas en routes |
| **`@worksuite/jira-client`** | local | HTTP client para Jira Cloud REST API v3 |
| **`tsx`** | 4.x | Dev mode con watch |

## Rutas

Registradas en `apps/api/src/app.ts` con prefijos. Cada grupo en su propio file en `infrastructure/http/`.

### `/auth` (`authRoutes.ts`)

| Method | Path | Auth | Para qué |
|---|---|---|---|
| POST | `/auth/login` | público | Body `{ email, password }`. Llama `authService.login` (wrap de Supabase) y devuelve `{ token, user }` |
| GET | `/auth/me` | JWT | Devuelve perfil del user actual |

### `/worklogs` (`worklogRoutes.ts`)

| Method | Path | Auth | Para qué |
|---|---|---|---|
| POST | `/worklogs` | JWT | Crea worklog. Usa caso `LogWorklog` (valida + persiste + sync opcional a Jira) |
| DELETE | `/worklogs/:id` | JWT | Borra worklog. Caso `DeleteWorklog` |
| GET | `/worklogs` | JWT | Lista worklogs del user con filtros opcionales |

### `/hotdesk` (`hotdeskRoutes.ts`)

| Method | Path | Auth | Para qué |
|---|---|---|---|
| GET | `/hotdesk/map` | JWT | Devuelve seats + reservations para vista mapa |
| GET | `/hotdesk/table` | JWT | Devuelve mismos datos formateados para vista tabla |
| POST | `/hotdesk/reservations` | JWT | Crea reserva (caso `MakeReservation`) |
| DELETE | `/hotdesk/reservations/:seatId/:date` | JWT | Libera reserva (caso `ReleaseReservation`) |

### `/jira` (`jiraRoutes.ts`) — proxy completo a Jira Cloud

| Method | Path | Para qué |
|---|---|---|
| GET | `/jira/connection` | Estado de conexión Jira del user |
| POST | `/jira/connection` | Body `{ baseUrl, email, apiToken }` para guardar PAT |
| DELETE | `/jira/connection` | Borra PAT del user |
| GET | `/jira/projects` | Lista proyectos Jira accesibles |
| GET | `/jira/issues?project=&extraFields=&userFilter=` | Lista issues filtrados |
| POST | `/jira/issues` | Búsqueda compleja (body con JQL + paginación) |
| GET | `/jira/issuetypes` | Lista issue types globales |
| GET | `/jira/fields` | Lista custom fields (para mapping de repos) |
| GET | `/jira/statuses` | Lista statuses |
| GET | `/jira/search?jql=&maxResults=&fields=` | Search libre por JQL |
| GET | `/jira/issues/parents?parents=` | Resuelve metadata de N parents |

Todas usan `JiraCloudAdapter` (`infrastructure/jira/`) — mock disponible (`MockJiraAdapter`) para tests.

### `/mcp` (`mcpRoutes.ts`)

Endpoint POST/GET/DELETE en root del prefijo. Despacha al MCP SDK (`@modelcontextprotocol/sdk`). Permite a agentes externos invocar tools registrados — ver `infrastructure/mcp/`.

### `/ai` (`aiRoutes.ts`)

| Method | Path | Para qué |
|---|---|---|
| POST | `/ai/chat` | Body `{ messages, model, ... }`. Proxy al LLM. Respuesta streaming SSE |
| POST | `/ai/models` | Lista modelos disponibles según provider configurado |

LLM provider controlado por env vars (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).

### `/email-intel` (`emailIntelRoutes.ts`)

Email Intelligence de Vector Logic. Endpoints para:

- **Gmail Connection** — `GET/DELETE /connection`, `PATCH /connection` (settings).
- **OAuth flow** — `GET /oauth/start` (redirige a Google consent), `GET /oauth/callback` (recibe code, intercambia por tokens, los guarda encriptados).
- **Email Rules CRUD** — `GET/POST /rules`, `PATCH/DELETE /rules/:id`.
- **Detections** — `GET /detections?status=`, `POST /detections/:id/approve`, `POST /detections/:id/reject`.
- **Ingestion** — `POST /ingest` (manual), `GET /ingest/cron` (sin auth — disparado por cron de Vercel).

## Domain layer

`apps/api/src/domain/` — entidades + ports (interfaces) sin dependencias externas:

- **`worklog/`** — `Worklog`, `IWorklogRepository`, `IJiraApi`.
- **`auth/`** — `IAuthService`.
- **`user/`** — `IUserRepository`.
- **`jira/`** — `IJiraConnectionRepository`.
- **`hotdesk/`** — `HotDesk`, `IHotDeskRepository`.
- **`ai/`** — `ILLMService`.
- **`emailIntel/`** — `IEmailIntelRepos`, `types.ts`.

Tests de dominio en `__tests__/` por entity.

## Application layer

`apps/api/src/application/` — use cases que componen ports:

- **`worklog/`** — `LogWorklog`, `DeleteWorklog`.
- **`hotdesk/`** — `MakeReservation`, `ReleaseReservation`.
- **`emailIntel/`** — pipeline de Gmail polling, matching de reglas, extracción LLM, queueing de detections.

## Infrastructure layer

`apps/api/src/infrastructure/`:

- **`supabase/`** — adapters: `SupabaseAuthService`, `SupabaseUserRepo`, `SupabaseWorklogRepo`, `SupabaseHotDeskRepo`, `SupabaseJiraConnectionRepo`. Usan service role key (env `SUPABASE_SERVICE_KEY`).
- **`jira/`** — `JiraCloudAdapter` (real, usa `@worksuite/jira-client`), `MockJiraAdapter` (tests).
- **`gmail/`** — adapter de Gmail API + OAuth dance.
- **`llm/`** — `LLMServiceAdapter` que rutea a OpenAI / Anthropic según config.
- **`mcp/`** — registro de tools del MCP server (cada tool es una función que el agente puede invocar).
- **`http/`** — los 7 archivos de rutas listados arriba.

## Auth & autorización

- **JWT pre-handler:** `app.authenticate` (registrado via `@fastify/jwt`). Se aplica a todas las rutas privadas vía `{ preHandler: [app.authenticate] }` o un `authHook` por route group.
- **Token issuer:** Supabase Auth. El secret es `JWT_SECRET` (env var) o se fetcha del JWKS de Supabase (verificar exact mechanism).
- **request.user** se popula con `{ id, email, ... }` extraído del JWT.
- **Rutas públicas:** solo `/auth/login`. El resto requiere JWT.
- **Excepción cron:** `GET /email-intel/ingest/cron` no tiene auth — protegerlo via Vercel cron secret header (`CRON_SECRET`), pendiente de verificar implementación.

## Cron Jobs

Definidos en `apps/api/vercel.json`:

```json
"crons": [
  { "path": "/email-intel/ingest/cron", "schedule": "0 9 * * *" }
]
```

- **Email Intelligence ingest** — corre **diario a las 9 AM UTC**. Itera sobre todas las `vl_gmail_connections`, polea cada inbox, matchea contra rules, extrae con LLM, encolada o auto-crea tasks según threshold.

**Nota memoria:** Vercel Hobby plan solo permite cron diario, no más frecuente — confirmado en `feedback`/memoria del proyecto. Si se quisiera polling más frecuente (ej. cada 5 min), upgrade a Pro Vercel o usar Supabase scheduled functions.

## Variables de entorno

| Var | Para qué |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | Service role key (RLS bypass) |
| `SUPABASE_ANON_KEY` | Anon key (rutas públicas como `/auth/login`) |
| `JWT_SECRET` | Secret para verificar JWT de Supabase |
| `OPENAI_API_KEY` | Provider LLM (opcional según config user) |
| `ANTHROPIC_API_KEY` | Provider LLM (opcional según config user) |
| `GOOGLE_CLIENT_ID` | OAuth Gmail |
| `GOOGLE_CLIENT_SECRET` | OAuth Gmail |
| `GOOGLE_REDIRECT_URI` | Callback URL del OAuth |
| `EMAIL_INTEL_ENCRYPTION_KEY` | Para encriptar refresh tokens de Gmail antes de persistir |
| `CRON_SECRET` | Header secret para validar que el cron lo dispara Vercel y no un atacante |

Las dependencias en `package.json` confirman las primeras 4. Las restantes están **inferidas del código** — verificar exhaustivamente antes de re-deploy.

## Despliegue

`apps/api/vercel.json`:

```json
{
  "version": 2,
  "builds": [{ "src": "api/index.ts", "use": "@vercel/node", "config": { "includeFiles": ["src/**", "package.json"] } }],
  "routes": [{ "src": "/(.*)", "dest": "/api/index.ts", "headers": { ... CORS } }],
  "crons": [...]
}
```

- Entry serverless: `apps/api/api/index.ts` — re-emite el request al Fastify app.
- Build: `tsc` (sólo el src, no el frontend).
- URL prod: `worksuite-api.vercel.app` (proyecto Vercel `prj_Hh8mCQGmSbPTYrcU6GMlpZAxcjVD`).
- CORS abierto (`*`) — el JWT auth es la verdadera protección.

## Estructura

```
apps/api/
├── api/
│   └── index.ts                # serverless handler (Vercel adapter)
├── src/
│   ├── app.ts                  # buildApp() — registra plugins + routes
│   ├── server.ts               # standalone server (dev / local)
│   ├── domain/
│   │   ├── auth/
│   │   ├── user/
│   │   ├── worklog/
│   │   ├── jira/
│   │   ├── hotdesk/
│   │   ├── ai/
│   │   └── emailIntel/
│   ├── application/
│   │   ├── worklog/
│   │   ├── hotdesk/
│   │   └── emailIntel/
│   ├── infrastructure/
│   │   ├── supabase/
│   │   ├── jira/
│   │   ├── gmail/
│   │   ├── llm/
│   │   ├── mcp/
│   │   └── http/               # 7 route files
│   ├── shared/
│   │   └── jiraConnection.ts
│   ├── jira-tracker/
│   │   └── routes.ts           # legacy — verificar si se está usando
│   ├── deploy-planner/
│   │   └── routes.ts           # legacy — verificar si se está usando
│   └── type/
│       └── fastify.d.ts        # type augmentation para `request.user`
├── package.json
├── tsconfig.json
├── vercel.json
└── vitest.config.ts
```

## Testing

Vitest configurado. Coverage actual:
- `src/domain/worklog/__tests__/Worklog.test.ts` — entity tests.
- `src/domain/hotdesk/__tests__/HotDesk.test.ts` — entity tests.
- **No hay tests de routes ni de application layer.** Follow-up.

Run: `cd apps/api && npm test` (vitest run) o `npm test -- --watch`.

## Out of scope (en este snapshot)

- WebSocket / realtime endpoints — no implementado.
- Rate limiting — no hay (delegado a Vercel).
- Request logging estructurado / observability (Sentry, Datadog).
- API versioning (`/v1/` prefix) — todo en root.
- Health check endpoint (`/healthz`).
- Migración de los `jira-tracker/routes.ts` y `deploy-planner/routes.ts` legacy a la estructura `infrastructure/http/`.
- Tests de integración end-to-end (Supertest contra Fastify in-memory).
- OpenAPI / Swagger spec autogenerado.
- Multi-region deployment.
