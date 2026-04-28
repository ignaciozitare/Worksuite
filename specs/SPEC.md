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
| Concurrency Control | [specs/core/concurrency/SPEC.md](core/concurrency/SPEC.md) | Confirmed — implementado en HotDesk, Deploy Planner, Environments |
| Component Migration | [specs/core/component-migration/SPEC.md](core/component-migration/SPEC.md) | Confirmed — migrando módulos a `@worksuite/ui` |
| Login Screen Redesign | [specs/core/login/SPEC.md](core/login/SPEC.md) | Spec confirmed 2026-04-26 · UI-only · pending Scaffold |

---

## How specs are created

Specs are generated automatically by the Spec Agent through a conversation
with the user before any development starts.

To create or update a spec, simply tell Claude what you want to build or change.
The Spec Agent will handle the rest.
