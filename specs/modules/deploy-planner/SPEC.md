# Deploy Planner — Module Spec

> **Snapshot spec (2026-04-29).** Documenta el estado actual del módulo. La sección "Right Sidebar — Jira Task Search + Ordered Task List" más abajo es el spec de la entrega que introdujo el sidebar derecho.

## Overview

Deploy Planner es la herramienta para planificar releases del producto. Cada release agrupa tickets de Jira que van a desplegarse juntos, tiene fechas planeadas, un estado en el workflow del release (planificado / en QA / aprobado / desplegado / etc.), y agrupa repos por dependencias. Los desarrolladores arrastran tickets de Jira al release que corresponde; los managers ven el timeline de releases activos / próximos y miden el throughput con métricas.

### Quién lo usa
Cualquier developer puede ver releases, sidebar de tickets Jira, history y métricas. Los managers / admins además crean / editan releases, configuran prefijos de versionado, definen los estados de release, agrupan repos y configuran qué issue types y qué statuses Jira aparecen en el sidebar.

## Sub-views

URL: `/deploy`. El módulo tiene 4 tabs:

| Tab | Componente | Para qué |
|---|---|---|
| `planning` | `Planning.tsx` (en `internal/`) | Vista principal — lista de releases activos. Cada release card muestra release_number, descripción, fechas planeadas, status, lista de tickets asignados. Drag de un ticket desde el right sidebar a una card lo asigna al release. |
| `timeline` | `Timeline.tsx` + `DeployTimeline.tsx` | Gantt horizontal de releases (usa `<GanttTimeline>` de `@worksuite/ui`). Cada release es una barra con su rango planeado, agrupada visualmente por status_category. |
| `history` | `History.tsx` | Tabla de releases pasados (status final). Filtros por rango de fecha, status, búsqueda. |
| `metrics` | `Metrics.tsx` | Métricas: lead time, cycle time, releases por mes, distribución por status, etc. Gráficos. |

**Right Sidebar** persistente en `planning` y `timeline` (300px, colapsable):
- Sección 1: search input que dispara `HttpJiraSearchAdapter`.
- Sección 2: lista ordenada de tickets de los proyectos Jira configurados, drag-to-release.
- Filtros por issue type / status configurados desde Admin.

Vista **`AdminDeployConfig`** (en `/admin → mod=deploy`): CRUD de release statuses, version config (prefix / segments / next_number), repo groups, subtask config, filtros Jira.

## Actions del usuario

- **Crear release.** Define release_number (auto-generado por `dp_version_config`), descripción, fechas planeadas, status inicial.
- **Asignar tickets.** Drag desde sidebar a release card, o seleccionar manualmente desde un picker.
- **Cambiar status del release.** Mueve por el workflow configurado (planificado → en qa → aprobado → desplegado).
- **Editar release.** Fechas, descripción, tickets, status.
- **Borrar release** (admin).
- **Buscar tickets Jira** desde el sidebar (debounced 300ms).
- **Reordenar manualmente** los tickets del sidebar (drag handle, persistido en sesión).
- **Refresh sidebar** para re-fetch de Jira.
- **Click ticket → abrir Jira** en nueva pestaña (`jiraBaseUrl + /browse/ + key`).
- **Filtrar tickets** del sidebar por issue type y status (admin-configured).

Acciones admin:
- Configurar qué issue types y statuses Jira se incluyen.
- Configurar prefijo + segmentos + separador del version string (ej. `v.YYYY.MM.NN`).
- Lock del autoincremento (`dp_version_config.locked=true`) para fijar la versión.
- CRUD release statuses con nombre, color, bg_color, ord, status_category, is_final.
- Configurar repo groups (qué repos pertenecen a qué grupo lógico).
- Configurar subtask config (qué issue types tienen subtareas auto, qué statuses cuentan como cerrados).

## Reglas y límites

- **Release number único.** Generado por `dp_version_config.next_number` salvo que esté `locked=true`.
- **Versionado.** El string final lo arma `prefix + segments + separator + next_number` según config. `segments` es un jsonb que define formato (ej. `{year:4, month:2}` para `v.2026.04.05`).
- **Status workflow no es libre.** El admin define los statuses pero no las transiciones — todos pueden ir a todos. La columna `status_category` (`backlog | in_progress | approved | done`) agrupa visualmente.
- **Tickets** se persisten como `text[]` en `dp_releases.ticket_ids`. Sin tabla separada — Jira es el source of truth, este módulo solo guarda referencias.
- **`ticket_statuses` jsonb** cachea el último status conocido de cada ticket de Jira para no tener que pegarle a Jira en cada render.
- **Repo extraction:** los repos de un release se derivan automáticamente del campo Jira configurado (`dp_version_config.repo_jira_field`, default `components`). El usuario puede agruparlos via `dp_repo_groups` para que tickets de varios repos se cuenten como un mismo grupo.

## Conexiones

- **Supabase** — tablas `dp_*`. RLS abierta a todos los users autenticados (lectura) y restringida a admin para escritura en config tables.
- **Jira (vía backend)** — TODAS las llamadas Jira pasan por `apps/api/infrastructure/http/`. El frontend nunca habla directamente con Jira.
  - `GET /jira/projects`, `GET /jira/issues?project=...`, `GET /jira/search?jql=...`.
- **`@worksuite/jira-service`** — `HttpJiraSearchAdapter` para búsquedas tipo-ahead.
- **`@worksuite/ui`** — `GanttTimeline` para la pestaña Timeline; `DateRangePicker`, `DualPanelPicker`, `Modal` para configs.
- **Environments** — comparte `dp_version_config` para algunos cálculos cruzados.

## Modelo de datos

### `dp_releases`
Una row por release. Campos: `id` (uuid), `release_number` (text único, generado), `description`, `status` (text, FK lookup a `dp_release_statuses.name`), `start_date`, `end_date` (date), `ticket_ids` (text[] de claves Jira), `ticket_statuses` (jsonb, cache del status de cada ticket), `created_by` (uuid → users), `created_at`, `updated_at`.

### `dp_release_statuses`
Lista configurable de statuses de release. Campos: `id`, `name`, `color`, `bg_color`, `border`, `ord`, `is_final` (bool legacy), `status_category` (`backlog | in_progress | approved | done`), `created_at`.

### `dp_version_config`
Singleton (id=1). Campos: `prefix` (text, ej. `v`), `segments` (jsonb con formato del version string), `separator` (text, ej. `.`), `next_number` (int — auto-incrementado al crear release), `locked` (bool — pausa el auto-increment), `repo_jira_field` (text — qué campo Jira tiene los repos, default `components`), `issue_types` (text[] — qué issue types se incluyen en sidebar), `env_history_note` (text), `created_at`, `updated_at`.

### `dp_repo_groups`
Agrupación de repos. Campos: `id`, `name`, `repos` (text[]), `created_at`, `updated_at`.

### `dp_subtask_config`
Configuración de subtareas auto-generadas en Jira a partir de un release. Campos: `id`, `jira_issue_type` (qué tipo se crea, ej. "Sub-task"), `category` (`bug | test | other`), `test_type` (uno de varios), `closed_statuses` (text[] — qué statuses cuentan como cerrados al medir progreso), `created_at`.

### Relaciones en lenguaje plano
Una release tiene un status (referencia a `dp_release_statuses.name`). Una release tiene N tickets de Jira (text[]). Los repos no se persisten directamente — se derivan de los tickets via el campo Jira. La config de versionado y subtareas son singletons.

## Estructura del módulo

```
apps/web/src/modules/deploy-planner/
├── container.ts
├── domain/
│   └── entities/
│       ├── Release.ts
│       └── Deployment.ts
├── infra/
│   ├── SupabaseDeploymentRepository.ts
│   └── SupabaseReleaseRepo.ts
└── ui/
    ├── DeployPlanner.tsx       # shell con tabs + sidebar
    ├── DeployTimeline.tsx      # tab Timeline
    └── internal/
        ├── Planning.tsx        # tab Planning
        ├── Timeline.tsx
        ├── History.tsx
        ├── Metrics.tsx
        ├── ReleaseCard.tsx
        ├── ReleaseDetail.tsx
        ├── TaskSidebar.tsx     # right sidebar (search + ordered list)
        ├── VersionPicker.tsx
        ├── atoms.tsx           # primitives compartidos
        ├── constants.ts
        ├── helpers.ts
        └── types.ts
```

---

## Right Sidebar — Jira Task Search + Ordered Task List (revisión histórica)

### Context
La feature original fue añadir un right sidebar a Planning y Timeline para buscar/listar tickets sin abandonar la app.

### Requirements

**Right Sidebar**
- Position: 300px wide, colapsable. State persistido en localStorage.
- Section 1: Search input (debounced 300ms) → `HttpJiraSearchAdapter`. Cards compactas con key, summary, type icon, status badge.
- Section 2: Task list de tickets de proyectos Jira configurados. Default order: newest first. Drag handle para reorder manual (session-only).
- Drag a release: usa el flow existente `onTicketDrop(ticketKey, releaseId)`.
- Filtering: por issue type + status (admin-configured).
- Click → abrir ticket en Jira.
- Refresh button.

**Admin Configuration**
- `dp_release_config.issue_types[]` — qué issue types aparecen.
- `dp_release_config.jira_status_filter` — qué statuses se incluyen.
- UI: Admin panel → Deploy Planner → Jira tab.

### Out of scope (v1)
- Persistir reorder manual a DB.
- Inline ticket editing.
- Bulk assign múltiples tickets a una release.

---

## Out of scope (módulo entero, en este snapshot)

- Auto-deploy real (push de código a un servidor) — el módulo solo planifica, no ejecuta.
- Aprobación multi-step de releases (ej. "manager + tech lead + product owner").
- Notificaciones cuando un release pasa de status (Slack / email).
- Integración con CI/CD pipelines (GitHub Actions, GitLab) para enlazar runs.
- Análisis de impacto cruzado (qué tickets bloquean qué releases).
- Auto-cálculo de fechas planeadas a partir de la velocity histórica.
