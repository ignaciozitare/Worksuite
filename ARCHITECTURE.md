# WorkSuite — Architecture

> Documento vivo. Actualizar con cada cambio arquitectural.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Node.js + Fastify + TypeScript |
| Base de datos | Supabase (Postgres + Auth + Edge Functions) |
| Deploy | Vercel (web + api como proyectos separados) |
| Monorepo | npm workspaces |

---

## Estructura del repositorio

```
worksuite/
├── packages/
│   ├── shared-types/          ← tipos TypeScript de dominio
│   ├── i18n/                  ← sistema de traducción (es/en) — I18nProvider + useTranslation()
│   ├── ui/                    ← librería de componentes reutilizables
│   │   └── src/components/
│   │       ├── Btn.tsx
│   │       ├── Atoms.tsx              (Avatar, Badge, StatBox, Divider, Chip)
│   │       ├── Modal.tsx              (Modal, ConfirmModal)
│   │       ├── GanttTimeline.tsx      ← Gantt chart interactivo (zoom, drag, groups)
│   │       ├── JiraTicketSearch.tsx   ← autocomplete de tickets Jira (DI del search)
│   │       ├── StatusManager.tsx      ← CRUD + drag-reorder de estados (presentacional, reutilizable)
│   │       └── TimerBar.tsx
│   ├── jira-client/           ← cliente HTTP para Jira Cloud API (usado en apps/api)
│   └── jira-service/          ← servicio Jira de frontend (adapter + utils compartidos)
│       └── src/
│           ├── domain/JiraSearchPort.ts
│           ├── infra/HttpJiraSearchAdapter.ts
│           └── services/extractRepos.ts  ← extracción de repos del repoField configurable
│
└── apps/
    ├── web/                   ← React frontend
    │   └── src/
    │       ├── WorkSuiteApp.tsx   ← Root orchestrator (~296 líneas, routing + layout)
    │       ├── main.tsx           ← Entry point con I18nProvider
    │       ├── AppRouter.tsx      ← React Router con lazy loading
    │       ├── shared/
    │       │   ├── admin/         ← Panel admin (9 archivos: Settings, Users, HotDesk, Blueprint,
    │       │   │                     Roles, RetroTeams, DeployConfig, EnvTracker, Shell)
    │       │   ├── hooks/         ← useAuth, useWorkSuiteData, useWorklogs, useHotDesk
    │       │   ├── domain/ports/  ← UserPort, SsoConfigPort, RolePort, BuildingPort,
    │       │   │                     AdminUserPort, HotDeskAdminPort, JiraConnectionPort
    │       │   ├── infra/         ← Supabase repos + JiraConnectionAdapter (7 archivos)
    │       │   ├── lib/           ← supabaseClient, utils, constants, fallbackData
    │       │   └── ui/            ← MiniCalendar, PasswordStrength
    │       └── modules/
    │           ├── auth/          ← LoginPage
    │           ├── jira-tracker/
    │           │   ├── domain/    ← entities, ports (WorklogPort, JiraSyncPort), useCases, services
    │           │   ├── infra/     ← SupabaseWorklogRepo, JiraSyncAdapter
    │           │   └── ui/        ← LogWorklogModal, JTFilterSidebar, CalendarView, DayView, TasksView
    │           ├── hotdesk/
    │           │   ├── domain/    ← entities, ports (SeatReservationPort), useCases, services
    │           │   ├── infra/     ← SupabaseSeatReservationRepo, SupabaseReservationRepository
    │           │   └── ui/        ← OfficeSVG, HDMapView, HDTableView, HDReserveModal,
    │           │                     BlueprintHDMap, BlueprintMiniMap, SeatTooltip
    │           ├── retro/
    │           │   ├── domain/    ← entities, ports (RetroSessionPort, RetroActionablePort, RetroTeamPort)
    │           │   ├── infra/     ← SupabaseRetroSessionRepo, SupabaseRetroActionableRepo, SupabaseRetroTeamRepo
    │           │   └── ui/        ← RetroBoard (lobby, phases, kanban, history, teams)
    │           ├── deploy-planner/
    │           │   ├── domain/    ← entities, ports (DeployConfigPort, SubtaskConfigPort, SubtaskPort,
    │           │   │                 JiraMetadataPort, DeploymentRepository), services (RepoGroupService,
    │           │   │                 SubtaskService), useCases
    │           │   ├── infra/     ← SupabaseReleaseRepo, SupabaseDeployConfigRepo,
    │           │   │                 SupabaseSubtaskConfigRepo, JiraMetadataAdapter, JiraSubtaskAdapter
    │           │   └── ui/        ← DeployPlanner (planning, timeline, detail, history, metrics),
    │           │                     DeployTimeline, ReleaseDetail
    │           └── environments/
    │               ├── domain/    ← entities, ports, useCases
    │               ├── infra/     ← SupabaseEnvironmentRepo, SupabaseReservationRepo
    │               └── ui/        ← EnvironmentsView, AdminEnvironments
    │
    └── api/                   ← Fastify backend
        └── src/
            ├── domain/        ← interfaces (IJiraConnectionRepository, IUserRepository, etc.)
            ├── infrastructure/
            │   ├── http/      ← authRoutes, worklogRoutes, hotdeskRoutes, jiraRoutes
            │   └── jira/      ← JiraCloudAdapter (projects, issues, subtasks, fields, search, worklogs)
            └── app.ts         ← Fastify setup, plugin registration
```

---

## Arquitectura hexagonal

### Regla de dependencias
```
UI → UseCases/Services → Ports ← Infra (Supabase/Jira)
```

- `domain/` no importa nada de `infra/` ni de `ui/`
- `ui/` no hace llamadas directas a Supabase ni fetch — usa repos/adapters
- `infra/` implementa los `ports/`
- `supabase.from()` solo aparece en archivos dentro de `/infra/`
- `fetch()` a APIs externas solo en adapters

### Verificación
```
supabase.from() outside /infra/: 0
fetch() in UI/admin: 0
```

---

## Paquetes compartidos

### `@worksuite/i18n`
- I18nProvider en main.tsx con persistencia en localStorage
- Locales: `locales/es.json`, `locales/en.json`
- Namespaces: common, auth, nav, admin, jiraTracker, hotdesk, retro, deployPlanner

### `@worksuite/ui`
- `GanttTimeline` — Gantt chart con zoom (días/semanas/meses), drag-to-move/resize, group frames
- `JiraTicketSearch` — autocomplete de tickets Jira; el `search` callback se inyecta por prop
- `StatusManager` — lista drag-to-reorder + CRUD + color + categoría. Presentacional: recibe
  `statuses`, `categories` y callbacks `onCreate/onUpdate/onDelete/onReorder`. Reutilizable para
  cualquier módulo que necesite estados configurables (releases, reservas, tickets…).
- `Btn`, `Avatar`, `Badge`, `Modal`, `TimerBar`, `StatBox`
- Dark/light mode vía CSS variables (`--ws-*`)

### `@worksuite/jira-service`
Servicio Jira de **frontend** (no confundir con `jira-client`, que es el adapter HTTP que usa la API).
Contiene:
- `JiraSearchPort` — puerto para buscar issues por JQL
- `HttpJiraSearchAdapter` — adapter HTTP contra `/jira/search` de la API
- `extractReposFromTickets(tickets, repoField)` — util puro que normaliza el campo de repos de Jira
  (array / string / objeto `.name` / `.value` / comma-separated) y lo de-duplica.

Consumido por Deploy Planner y Environments. El `repoField` se lee de `dp_version_config.repo_jira_field`
(configurable en Admin → Deploy Config), evitando hardcodear `customfield_10146` en cada módulo.

---

## Deploy Planner — Features

### Releases
- CRUD releases con versión auto-generada
- Status con categorías: `backlog`, `in_progress`, `approved`, `done`
- Drag-and-drop tickets entre releases

### Repo Groups
- Grupos de repos configurados en admin con repos de Jira
- Releases que comparten grupo se agrupan visualmente (marco naranja/verde)
- Bloqueo: no se puede pasar a `done` si releases del grupo no están en `done`/`approved`

### Subtareas
- Admin configura qué issue types son bug/test/other
- Define qué estados de Jira cierran cada tipo
- API batch: `GET /jira/subtasks?parents=AND-7,AND-8`
- Contadores `🐛 2/5 · 🧪 3/8` en cards
- Tabla de subtareas en detalle de release

### Jira Field Mapping
- Admin selecciona qué campo de Jira usar como "Repository & Components"
- Soporta custom fields (ej: `customfield_10146`)

### Vistas
- **Planning**: Cards con tickets, repos, contadores, filtro por estado
- **Timeline**: GanttTimeline con zoom, drag-resize, group frames, filtro
- **History**: Tabla con filtros, ordenar, columna de bugs
- **Metrics**: Stats de releases, bugs, tests, repos

---

## Base de datos (Supabase)

### Tablas principales
| Tabla | Descripción |
|-------|------------|
| `users` | Usuarios con role, desk_type, modules (jsonb), jira_api_token |
| `worklogs` | Imputaciones de tiempo |
| `seats`, `seat_reservations`, `fixed_assignments` | HotDesk |
| `buildings`, `blueprints` | Planos de oficina |
| `retro_sessions`, `retro_actionables`, `retro_teams`, `retro_team_members` | RetroBoard |
| `dp_releases`, `dp_release_statuses`, `dp_version_config` | Deploy Planner |
| `syn_reservations`, `syn_reservation_statuses`, `syn_reservation_history` | Environments |
| `dp_repo_groups`, `dp_subtask_config` | Config de repos y subtareas |
| `jira_connections` | Conexiones Jira por usuario |
| `sso_config` | SSO + deploy Jira statuses |
| `roles` | Roles y permisos |

---

## API Endpoints (Fastify)

| Ruta | Método | Descripción |
|------|--------|------------|
| `/jira/connection` | GET/POST/DELETE | CRUD conexión Jira |
| `/jira/projects` | GET | Listar proyectos Jira |
| `/jira/issues?project=X&extraFields=Y` | GET | Issues con campos custom |
| `/jira/issuetypes` | GET | Tipos de issue de Jira |
| `/jira/fields` | GET | Campos disponibles (standard + custom) |
| `/jira/subtasks?parents=K1,K2` | GET | Subtareas batch por JQL |
| `/jira/search` | GET | Búsqueda JQL con POST a Jira |
| `/jira/worklogs/:key/sync` | POST | Sync worklog a Jira |
| `/worklogs` | CRUD | Worklogs locales |
| `/hotdesk` | CRUD | Reservas y asignaciones |
| `/auth` | POST | Login/registro |
