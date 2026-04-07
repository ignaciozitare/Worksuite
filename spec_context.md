# WorkSuite — SPEC_CONTEXT

> Snapshot del **estado real** del proyecto al 2026-04-05. No describe el estado ideal sino lo que existe hoy en el código.
> Fuente: lectura directa de `apps/`, `packages/`, `docs/`, `ARCHITECTURE.md`, `README.md`.
> Última actualización relevante: nuevo `syn_jira_filter_config` + `<JiraTicketPicker>` + admin tab "Filtro Jira" en Environments.

---

## 1. Stack y estructura general

Monorepo npm workspaces.

```
worksuite/
├── apps/
│   ├── web/        React 18 + Vite SPA (frontend principal)
│   └── api/        Fastify (Node ESM) desplegado como Vercel Serverless
├── packages/
│   ├── shared-types/   tipos TS compartidos (sin compilar, alias Vite)
│   ├── i18n/           I18nProvider + useTranslation, locales es/en
│   ├── ui/             librería de componentes
│   ├── jira-client/    HTTP client de Jira Cloud (usado SOLO por apps/api)
│   └── jira-service/   servicio Jira de frontend (port + adapter HTTP + util)
├── docs/
│   ├── adr/            001 hexagonal, 002 vercel+supabase
│   ├── specs/          hotdesk.md, jira-tracker.md
│   └── supabase-schema.sql + migraciones
├── supabase/           vacío
├── ARCHITECTURE.md     alineado con el estado actual
└── README.md           alineado con el estado actual
```

> Nota: existe `packages/packages/shared-types/` como carpeta duplicada/residual. Probable basura a limpiar.

---

## 2. Módulos del frontend — estado real

Ubicados en `apps/web/src/modules/`. Cada módulo sigue `domain/` + `infra/` + `ui/`.

| Módulo | Estado | Observaciones |
|---|---|---|
| **jira-tracker** | Completo | domain (entities/ports/useCases/services) + infra (Supabase + JiraSync) + UI (Calendar, Day, Tasks, Filter, LogWorklog). Hook `useWorklogs`. |
| **hotdesk** | Completo | domain + infra (3 repos) + UI (HDMapView, HDTableView, HDReserveModal, BlueprintHDMap/MiniMap, OfficeSVG, SeatTooltip). Hook `useHotDesk`. |
| **retro** | Completo | 4 ports (Session, Actionable, Team, Repository) + 4 adapters Supabase + `RetroBoard.tsx` (1202 líneas, monolítico: lobby, phases, kanban, history, teams). |
| **deploy-planner** | Completo | 6 ports (Deployment, Release, DeployConfig, SubtaskConfig, Subtask, JiraMetadata) + 3 Supabase repos + Jira adapters. UI: `DeployPlanner.tsx` (1356 líneas, monolítico con vistas Planning/Timeline/History/Metrics) + `DeployTimeline.tsx` + `ReleaseDetail.tsx`. |
| **environments** | Completo | 6 ports (Environment, Reservation, ReservationStatus, ReservationHistory, JiraConfig, JiraFilterConfig) + 6 Supabase repos. UI: `EnvironmentsView.tsx` + `AdminEnvironments.tsx` con 4 tabs (Entornos, Estados, Filtro Jira, Política). Usa categorías dinámicas (reserved/in_use/completed/cancelled/violation) con status catalog admin-configurable. Los tickets Jira mostrados al reservar se pre-filtran por admin-config (proyecto+tipo+estado) y se eligen con `<JiraTicketPicker>`. |
| **auth** | Infra inline | `LoginPage.tsx` lee directamente `supabase.from('sso_config')` — única excepción viva a la regla hexagonal en UI (ver §7). |

### Observaciones de tamaño / monolitos

- `apps/web/src/WorkSuiteApp.tsx` = 321 líneas (ya NO es de 1630 como decía el SDD histórico; fue refactorizado a orquestador puro que compone hooks, lazy routes y layout).
- `DeployPlanner.tsx` (1356) y `RetroBoard.tsx` (1202) son componentes grandes con múltiples vistas/estados internos. Siguen siendo "hexagonalmente correctos" (van vía ports) pero son candidatos a split.

---

## 3. Paquetes (`packages/`) — qué exporta cada uno

### `@worksuite/shared-types`
Tipos puros. Exporta:
- `ModuleId = 'jira-tracker' | 'hotdesk' | 'retro' | 'deploy-planner'`, `AppRole`, `DeskType`
- `WorksuiteUser`, `WorksuiteRole`, `RolePermissions`
- HotDesk: `Building`, `Blueprint`, `LayoutItem`, `LayoutItemType`, `SeatReservation`, `FixedAssignment`
- Jira: `JiraConnection`, `JiraProject`, `JiraIssue`, `JiraWorklog`
- Retro: `RetroCategory`, `RetroPhase`, `RetroPriority`, `RetroMemberRole`, `ActionableStatus`, `RetroTeam`, `RetroTeamMember`, `RetroSession`, `RetroCard`, `RetroActionable`, `RetroSessionStats`
- DeployPlanner (skeleton): `DeployStatus`, `DeployEnv`, `Deployment`, `DeployPlan`, `DeployStep`

### `@worksuite/i18n`
- `I18nProvider`, `useTranslation`
- Namespaces en `locales/es.json` y `locales/en.json`: `common`, `auth`, `nav`, `admin`, `jiraTracker`, `hotdesk`, `retro`, `deployPlanner` (+ module keys)
- Idioma persiste en `localStorage`.

### `@worksuite/ui`
Exports desde `packages/ui/src/index.ts`:
- `Btn` (+ `BtnVariant`, `BtnSize`)
- `Avatar`, `Badge`, `StatBox`, `Divider`, `Chip`
- `Modal`, `ConfirmModal`
- `GanttTimeline` (+ `GanttBar`, `GanttGroup`, `GanttZoom`, `GanttTimelineProps`)
- `TimerBar`
- `JiraTicketSearch` (+ `JiraIssueOption`, `JiraTicketSearchProps`) — autocomplete debounced; `search` callback inyectado (DI)
- `JiraTicketPicker` (+ `JiraTicketOption`, `JiraTicketPickerProps`) — lista pre-cargada + buscador + multiselect (checkboxes). El caller le pasa los tickets ya filtrados.
- `StatusManager` (+ `StatusItem`, `StatusCategoryOption`, `StatusManagerProps`)
- Tokens CSS via `@worksuite/ui/tokens` (vars `--ws-*`, dark/light)

### `@worksuite/jira-client` (backend)
HTTP client de Jira Cloud v3 con Basic Auth (email + API token).
- `JiraClient`, `createJiraClient(config)`
- `JiraClientError`
- Métodos: `getProjects`, `searchIssues`, `getIssue`, `addWorklog`, `updateWorklog`, `deleteWorklog`, `validateConnection`
- Usado SOLO en `apps/api` — nunca en el frontend.

### `@worksuite/jira-service` (frontend)
- Port: `JiraSearchPort`, `JiraSearchResponse`, `JiraIssueRaw`
- Adapter: `HttpJiraSearchAdapter` (llama a `/jira/search` de la API)
- Util pura: `extractReposFromTickets(tickets, repoField)` — normaliza (array / string / object.name / object.value / CSV) y deduplica
- Consumido por `deploy-planner` y `environments`. El `repoField` se lee de `dp_version_config.repo_jira_field` (configurable desde Admin → Deploy Config). Fallback: `components`.

---

## 4. `apps/api` — backend Fastify

```
apps/api/src/
├── app.ts              Fastify factory singleton
├── server.ts           entry point dev local
├── domain/             auth, hotdesk, jira, user, worklog (interfaces puras)
├── application/        use cases (LogWorklog, MakeReservation, etc.)
├── infrastructure/
│   ├── http/           authRoutes, worklogRoutes, hotdeskRoutes, jiraRoutes
│   ├── jira/           JiraCloudAdapter + MockJiraAdapter
│   └── supabase/       SupabaseWorklogRepo, SupabaseHotDeskRepo
├── jira-tracker/routes.ts
├── deploy-planner/routes.ts
└── shared/jiraConnection.ts
```

Handler Vercel: `apps/api/api/index.ts` adapta Fastify a serverless (instancia cacheada).

### Endpoints vigentes
| Ruta | Descripción |
|---|---|
| `/auth/login`, `/auth/me` | JWT propio firmado por backend |
| `/worklogs` (GET/POST/DELETE) | CRUD local — NO sincroniza Jira automáticamente |
| `/jira/connection` (GET/POST/DELETE) | conexión Jira por usuario |
| `/jira/projects` | proyectos del usuario |
| `/jira/issues?project=X&extraFields=Y` | issues con fields custom |
| `/jira/issuetypes`, `/jira/fields`, `/jira/search` | metadata Jira |
| `/jira/subtasks?parents=K1,K2` | subtasks batch por JQL |
| `/jira/worklogs/:key/sync` | sync manual de un worklog |
| `/hotdesk/...` | mapa, tabla mensual, reservas |

---

## 5. `apps/web/src/shared` — shared del frontend

- `admin/` (9 pantallas): `AdminSettings`, `AdminUsers`, `AdminHotDesk`, `AdminBlueprint`, `AdminRoles`, `AdminRetroTeamsShell`, `AdminDeployConfig`, `AdminEnvTrackerSection`, `AdminShell` (router del admin, 70 líneas).
- `hooks/`: `useAuth`, `useWorkSuiteData`, `useWorklogs`, `useHotDesk`.
- `domain/ports/`: `UserPort`, `SsoConfigPort`, `RolePort`, `BuildingPort`, `AdminUserPort`, `HotDeskAdminPort`, `JiraConnectionPort`.
- `infra/` (7 adapters): `SupabaseUserRepo`, `SupabaseAdminUserRepo`, `SupabaseRoleRepo`, `SupabaseBuildingRepo`, `SupabaseHotDeskAdminRepo`, `SupabaseSsoConfigRepo`, `JiraConnectionAdapter`.
- `lib/`: `supabaseClient`, `api`, `constants`, `fallbackData`, `utils`.
- `ui/`: `MiniCalendar`, `PasswordStrength`.

---

## 6. Decisiones de arquitectura ya tomadas

1. **Arquitectura hexagonal** en frontend y backend. Dependencia va al centro: `UI → UseCases/Services → Ports ← Infra`.
2. **`domain/` no importa de `infra/` ni de frameworks.**
3. **`supabase.from()` solo dentro de `/infra/`.** Validado excepto por `LoginPage.tsx` (ver §7).
4. **`fetch()` directo en UI prohibido** — siempre vía adapters.
5. **Monorepo npm workspaces + 2 proyectos Vercel** (web + api) desde un mismo repo.
6. **`shared-types` resuelto por alias de Vite**, no compilado.
7. **Credenciales Jira por usuario** en tabla `jira_connections` — no hay env vars globales de Jira.
8. **Sync Jira manual** — nunca automático; `POST /worklogs` NO sincroniza.
9. **Patrón rollback** en todos los handlers de escritura del frontend (snapshot → optimistic → rollback on error).
10. **Dos clientes Jira separados**: `@worksuite/jira-client` (backend HTTP directo a Jira) vs `@worksuite/jira-service` (frontend vía `/jira/search` de la API).
11. **`repoField` de Jira configurable** en `dp_version_config.repo_jira_field`, consumido por deploy-planner y environments.
12. **Lazy loading por ruta**: `AdminShell`, `RetroBoard`, `DeployPlanner`, `EnvironmentsView` usan `React.lazy`.
13. **Admin-configurable status catalogs**: `dp_release_statuses` (deploy) y `syn_reservation_statuses` (environments) — cada registro tiene un `status_category` que drive el comportamiento.
14. **ESM puro en backend**, imports locales con extensión `.js`.
15. **`onConflict` v2**: array `['col1','col2']`, no string.
16. **TypeScript strict**: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`.
17. **i18n obligatorio**: ningún string de UI hardcodeado — usar `t()` de `@worksuite/i18n`, claves presentes en `es.json` y `en.json`.

---

## 7. Violaciones conocidas / deuda arquitectural

- **`apps/web/src/modules/auth/LoginPage.tsx` llama `supabase.from('sso_config')` directamente** en un `useEffect` (líneas 18-28). Única violación viva de "no DB calls en UI". Debería moverse tras `SsoConfigPort` + `SupabaseSsoConfigRepo` (el port y el repo ya existen en `shared/`).
- **`WorkSuiteApp.tsx` línea 5** importa `supabase` de `shared/lib/api`, pero a la fecha no llama `.from()` — solo lo usa para auth. Verificar antes de refactors.
- **`packages/packages/shared-types/`** — carpeta duplicada/residual. Revisar y eliminar si no se referencia.
- El SDD histórico en la raíz (este archivo en su versión anterior) estaba desactualizado: decía WorkSuiteApp.tsx 1630 líneas, listaba solo jira-tracker+hotdesk como módulos, omitía retro/deploy/environments. Este `SPEC_CONTEXT.md` lo reemplaza.

---

## 8. Base de datos — tablas reales (Supabase)

El archivo `docs/supabase-schema.sql` documenta solo las tablas base (users, worklogs, seats, seat_reservations, fixed_assignments). Las tablas de retro/deploy/environments/admin se añadieron después vía migraciones no consolidadas en ese archivo.

### Users & auth
| Tabla | Columnas clave | Notas |
|---|---|---|
| `users` | id (FK auth.users), name, email, role (admin/user), desk_type (none/hotdesk/fixed), avatar, active, created_at, **jira_api_token**, **role_id**, **modules (jsonb, default ["jt","hd","retro","deploy"])** | Auto-insertado vía trigger `handle_new_user` |
| `jira_connections` | user_id (PK), base_url, email, api_token, projects[], connected_at, updated_at | credenciales por usuario |
| `sso_config` | id (int), ad_group_id, ad_group_name, allow_google, allow_microsoft, updated_at, **deploy_jira_statuses** | singleton id=1 |
| `roles` | tabla existe pero vacía | |

### HotDesk
| Tabla | Columnas | Notas |
|---|---|---|
| `seats` | id (text "A1"), zone, label, x, y | seed 18 asientos en 3 zonas |
| `seat_reservations` | id, seat_id, user_id, user_name, date, created_at, **building_id, blueprint_id** | UNIQUE(seat_id, date) |
| `fixed_assignments` | seat_id (PK), user_id, user_name | sin `id` — PK es seat_id |
| `buildings` | id, name, address, active, created_at | |
| `blueprints` | id, building_id, floor_name, floor_order, layout (jsonb), updated_at | |

### Worklogs (Jira Tracker)
| Tabla | Notas |
|---|---|
| `worklogs` | id, issue_key, issue_summary, issue_type, epic_key, epic_name, project_key, author_id, author_name, date, started_at, seconds (>0, <=86400), description, synced_to_jira, jira_worklog_id, created_at |

### Retro
| Tabla | Columnas |
|---|---|
| `retro_sessions` | id, team_id, name, status, phase, votes_per_user, phase_times (jsonb), created_by, created_at, closed_at, **stats (jsonb — cards viven en `stats.cards_data`)** |
| `retro_actionables` | id, session_id, card_id, text, assignee, due_date, status, priority, sort_order, team_id, retro_name, created_at |
| `retro_teams` | id, name, color, owner_id, created_at |
| `retro_team_members` | team_id, user_id, role, joined_at (PK compuesta team_id+user_id) |

### Deploy Planner
| Tabla | Columnas |
|---|---|
| `dp_releases` | id, release_number, description, status, start_date, end_date, ticket_ids (text[]), ticket_statuses (jsonb), created_by, created_at, updated_at |
| `dp_release_statuses` | id, name, color, bg_color, border, ord, is_final (legacy), **status_category (backlog/in_progress/approved/done)**, created_at |
| `dp_version_config` | id, prefix, segments (jsonb), separator, next_number, locked, **repo_jira_field** |
| `dp_repo_groups` | id, name, repos (jsonb array), created_at |
| `dp_subtask_config` | config de tipos bug/test/other + estados de cierre por tipo |

### Environments (prefix `syn_`)
| Tabla | Columnas |
|---|---|
| `syn_environments` | id (text), name, category (DEV/PRE/STAGING), is_locked, is_archived, max_reservation_duration (hours), color, url, created_at |
| `syn_reservations` | id, environment_id, reserved_by_user_id, jira_issue_keys (jsonb), description, planned_start, planned_end, status (legacy text), **status_id (FK → syn_reservation_statuses)**, selected_repository_ids (jsonb), usage_session (jsonb), policy_flags (jsonb), **extracted_repos (jsonb)**, created_at |
| `syn_reservation_statuses` | id, name, color, bg_color, border, ord, status_category (reserved/in_use/completed/cancelled/violation) — admin-configurable |
| `syn_reservation_history` | id (uuid), reservation_id, environment_id, environment_name, reserved_by_user_id, reserved_by_name, jira_issue_keys (jsonb), description, planned_start, planned_end, actual_end, status, repos (jsonb), created_at |
| `syn_jira_filter_config` | id=1 (singleton), project_keys (jsonb), issue_types (jsonb), statuses (jsonb), updated_at — drives qué tickets Jira aparecen en el picker de reserva |
| `syn_repositories` | id (text), name, is_archived, created_at — **LEGACY**, repos ahora vienen de Jira |
| `syn_policy` | tabla singleton, schema parcial |

---

## 9. RLS (Row Level Security)

Solo las tablas originales tienen RLS documentada explícitamente en `docs/supabase-schema.sql`:

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `users` | público | — | propio o admin | — |
| `worklogs` | propio o admin | `author_id = auth.uid()` | — | propio o admin |
| `seats` | público | admin | admin | admin |
| `seat_reservations` | público | `user_id = auth.uid()` | — | propio o admin |
| `fixed_assignments` | público | admin | admin | admin |
| `jira_connections` | propio o service_role | propio o service_role | propio o service_role | propio o service_role |

**Helper:** función `public.is_admin()` SQL security-definer que lee `users.role`.

**No documentado en el repo** — RLS de las tablas de retro, dp_*, syn_*, buildings, blueprints, sso_config, roles (hay que consultar directamente en Supabase Dashboard). Estas tablas se crearon fuera del `supabase-schema.sql` canónico.

---

## 10. Dependencias entre módulos

```
shared-types ← (todo)
i18n         ← (todo el frontend)
ui           ← (todo el frontend)

jira-client (backend)  ← apps/api
jira-service (frontend)← deploy-planner, environments

shared/admin           → shared/domain/ports → shared/infra
shared/hooks           → shared/infra + módulos

jira-tracker  → apps/api/jira/*
deploy-planner → apps/api/jira/{search,subtasks,issues,fields} + jira-service
environments   → apps/api/jira/{search,projects,issuetypes,statuses} + jira-service + dp_version_config (lectura)
retro          → solo Supabase (no depende de Jira)
hotdesk        → solo Supabase (no depende de Jira)
```

**Dependencia cruzada notable:** `environments` lee `dp_version_config.repo_jira_field` (tabla del deploy-planner). Razonable: es el único lugar donde se define qué campo de Jira se usa para repos.

---

## 11. Deploy

- **Frontend Vercel `worksuite`**: root = repo root. Build: `npm install --prefix apps/web && npm run build --prefix apps/web`. Output: `apps/web/dist`.
  Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`.
- **Backend Vercel `worksuite-api`**: root = `apps/api`. Handler: `api/index.ts`.
  Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `ALLOWED_ORIGIN`.
- **Regla:** nunca mergear a `main` sin verificar preview deploy. Promoción a producción vía Vercel dashboard (no hay endpoint automático).

---

## 12. Trabajo pendiente por prioridad

### Alta
1. **Extraer `supabase.from('sso_config')` de `LoginPage.tsx`** → usar `SsoConfigPort` + `SupabaseSsoConfigRepo` (ya existen). Única violación hexagonal viva en UI.
2. **Documentar/consolidar RLS** de tablas retro_*, dp_*, syn_*, buildings, blueprints, sso_config, roles. Exportar desde Supabase a `docs/` junto a `supabase-schema.sql`.
3. **Eliminar o documentar** `packages/packages/shared-types/` duplicado.

### Media
4. **Split de `DeployPlanner.tsx` (1356 líneas)** en subvistas independientes (Planning, Timeline, History, Metrics; `ReleaseDetail` ya está aparte).
5. **Split de `RetroBoard.tsx` (1202 líneas)** por fase (lobby, creating, grouping, voting, discussion, summary, history, kanban).
6. **Migrar `syn_repositories`** (legacy) o eliminar si ya no se consume.
7. **Unificar `status` (legacy text) y `status_id` en `syn_reservations`** — hoy conviven ambos.
8. **Paginación en `GET /worklogs`**.
9. **Sync bulk Jira** — re-sincronizar todos los worklogs pendientes (`synced_to_jira=false`).
10. **Consolidar `dp_subtask_config`** en el schema documentado (no está en `supabase-schema.sql`).

### Baja
11. **Tests de integración** contra Supabase test project.
12. **Cargar issues de múltiples proyectos Jira**, no solo el primero.
13. **Notificaciones** (email/Slack) al confirmar reserva de hotdesk o crear release.
14. **Auto-release** de reservas hotdesk al cierre del día.
15. **Actualizar `docs/specs/`** — solo hay `hotdesk.md` y `jira-tracker.md`; faltan retro, deploy-planner, environments.
16. **Nuevos ADR**: decisión de `jira-client` vs `jira-service`, `status_category` admin-configurable, lazy routing.