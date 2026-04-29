# WorkSuite — Spec Index

This document is the global index of all functional specs.
Each module and core area has its own SPEC.md file.
This index is updated automatically by the Spec Agent when a new spec is created or modified.

---

## Modules

| Module | Spec | Status |
|---|---|---|
| Vector Logic | [specs/modules/vector-logic/SPEC.md](modules/vector-logic/SPEC.md) | Module overview + Phases 1–5 + features individuales (más completo del repo) — todo en prod 2026-04-28 |
| Jira Tracker | [specs/modules/jira-tracker/SPEC.md](modules/jira-tracker/SPEC.md) | Module overview — imputación + calendar + day view + tasks + export |
| HotDesk | [specs/modules/hotdesk/SPEC.md](modules/hotdesk/SPEC.md) | Snapshot 2026-04-29 — module overview + booking confirmation feature |
| Deploy Planner | [specs/modules/deploy-planner/SPEC.md](modules/deploy-planner/SPEC.md) | Snapshot 2026-04-29 — module overview + right sidebar feature |
| Chrono | [specs/modules/chrono/SPEC.md](modules/chrono/SPEC.md) | Snapshot 2026-04-28 — control horario del usuario (autoservicio) |
| Chrono Admin | [specs/modules/chrono-admin/SPEC.md](modules/chrono-admin/SPEC.md) | Snapshot 2026-04-28 — administración RRHH del control horario |
| Environments | [specs/modules/environments/SPEC.md](modules/environments/SPEC.md) | Snapshot 2026-04-28 — entornos de despliegue + reservas |
| Retro | [specs/modules/retro/SPEC.md](modules/retro/SPEC.md) | Snapshot 2026-04-28 — retros con fases temporizadas + kanban de accionables |
| Profile | [specs/modules/profile/SPEC.md](modules/profile/SPEC.md) | Snapshot 2026-04-29 — module overview + avatar feature |

---

## Core

| Area | Spec | Status |
|---|---|---|
| App Shell | [specs/core/app-shell/SPEC.md](core/app-shell/SPEC.md) | Snapshot 2026-04-29 — routing global, topbar, theme, i18n |
| Auth | [specs/core/auth/SPEC.md](core/auth/SPEC.md) | Snapshot 2026-04-29 — login flow, sesión, RLS pattern |
| Admin Panel | [specs/core/admin/SPEC.md](core/admin/SPEC.md) | Snapshot 2026-04-29 — AdminShell + secciones por módulo |
| UIKit | [specs/core/uikit/SPEC.md](core/uikit/SPEC.md) | Snapshot 2026-04-29 — `@worksuite/ui` componentes + tokens |
| Deployment | [specs/core/deployment/SPEC.md](core/deployment/SPEC.md) | Snapshot 2026-04-29 — Vercel + Supabase + env vars + dominios + crons |
| Migrations | [specs/core/migrations/SPEC.md](core/migrations/SPEC.md) | Snapshot 2026-04-29 — orden cronológico de las migraciones SQL |
| Concurrency Control | [specs/core/concurrency/SPEC.md](core/concurrency/SPEC.md) | Confirmed — implementado en HotDesk, Deploy Planner, Environments |
| Component Migration | [specs/core/component-migration/SPEC.md](core/component-migration/SPEC.md) | Confirmed — migrando módulos a `@worksuite/ui` |
| Login Screen Redesign | [specs/core/login/SPEC.md](core/login/SPEC.md) | Spec confirmed 2026-04-26 · UI-only · pending Scaffold |

---

## Backend / API

| Pieza | Spec | Status |
|---|---|---|
| `apps/api` (Fastify) | [specs/api/SPEC.md](api/SPEC.md) | Snapshot 2026-04-29 — auth proxy, Jira proxy, AI/LLM, MCP server, Email Intelligence, cron jobs |

---

## Historical references

These artifacts pre-date the current spec layout but are still relevant for reconstruction / archeology. **No son specs activos** — son contexto histórico:

| Artifact | Path | Para qué |
|---|---|---|
| ADR-001 — Hexagonal Architecture | [docs/adr/001-hexagonal-architecture.md](../docs/adr/001-hexagonal-architecture.md) | Decisión original (2026-03-11) de adoptar hexagonal. Su contenido vive ahora en `ARCHITECTURE.md` + cada SPEC de módulo. |
| ADR-002 — Vercel + Supabase | [docs/adr/002-vercel-supabase.md](../docs/adr/002-vercel-supabase.md) | Decisión original de stack de despliegue. Reemplazado funcionalmente por [specs/core/deployment/SPEC.md](core/deployment/SPEC.md). |
| Esquema base SQL pre-2026-04-12 | [docs/supabase-schema.sql](../docs/supabase-schema.sql) | Dump del esquema base que `specs/core/migrations/SPEC.md` referencia como punto de partida pre-migraciones del repo. |
| Jira migrations legacy | [docs/migration_jira_connections.sql](../docs/migration_jira_connections.sql), [docs/migration_add_jira_worklog_id.sql](../docs/migration_add_jira_worklog_id.sql) | Migraciones de Jira Tracker aplicadas antes del directorio `supabase/migrations/`. |

## How specs are created

Specs are generated automatically by the Spec Agent through a conversation
with the user before any development starts.

To create or update a spec, simply tell Claude what you want to build or change.
The Spec Agent will handle the rest.
