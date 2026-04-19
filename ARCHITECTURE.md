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
│   │       ├── JiraTicketPicker.tsx   ← lista pre-cargada + buscador + multiselect (reutilizable)
│   │       ├── StatusManager.tsx      ← CRUD + drag-reorder de estados (presentacional, reutilizable)
│   │       ├── DualPanelPicker.tsx   ← selector dual-panel con drag & drop (issue types, etc.)
│   │       ├── DateRangePicker.tsx  ← calendario popover para rango de fechas (reservas, releases)
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
    │       ├── WorkSuiteApp.tsx   ← Root orchestrator (routing + layout + global topbar)
    │       ├── main.tsx           ← Entry point con I18nProvider
    │       ├── AppRouter.tsx      ← React Router con lazy loading
    │       ├── shared/
    │       │   ├── admin/         ← Panel admin (Settings, Users, HotDesk, Blueprint,
    │       │   │                     Roles, RetroTeams, DeployConfig, EnvTracker, Shell)
    │       │   ├── hooks/         ← useAuth, useWorkSuiteData, useWorklogs, useHotDesk,
    │       │   │                     useNotificaciones (DI: recibe NotificationPort)
    │       │   ├── domain/ports/  ← UserPort, SsoConfigPort, RolePort, BuildingPort,
    │       │   │                     AdminUserPort, HotDeskAdminPort, JiraConnectionPort,
    │       │   │                     NotificationPort
    │       │   ├── infra/         ← Supabase repos: User, AdminUser, Building, HotDeskAdmin,
    │       │   │                     Role, SsoConfig, Notification + JiraConnectionAdapter
    │       │   ├── lib/           ← supabaseClient, utils, constants, fallbackData
    │       │   └── ui/            ← MiniCalendar, PasswordStrength, NotificationsBell,
    │       │                       UserMenu, UIKit
    │       └── modules/
    │           ├── auth/          ← LoginPage
    │           ├── profile/       ← Página de perfil del usuario actual
    │           │   └── ui/        ← ProfilePage (lee del useAuth, sin repo propio)
    │           ├── jira-tracker/
    │           │   ├── domain/    ← entities, ports (WorklogPort, JiraSyncPort), useCases, services
    │           │   ├── infra/     ← SupabaseWorklogRepo, JiraSyncAdapter
    │           │   └── ui/        ← LogWorklogModal, JTFilterSidebar, CalendarView, DayView, TasksView,
    │           │                     RecentTasksSidebar, ExportConfigModal
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
    │           ├── environments/
    │           │   ├── domain/    ← entities, ports, useCases
    │           │   ├── infra/     ← SupabaseEnvironmentRepo, SupabaseReservationRepo
    │           │   └── ui/        ← EnvironmentsView, AdminEnvironments
    │           ├── chrono/        ← Control horario del usuario (fichaje propio)
    │           │   ├── domain/    ← entities (Fichaje, Vacacion, Incidencia, Alarma, BolsaHoras),
    │           │   │                 ports
    │           │   ├── infra/     ← Supabase{Fichaje,Vacacion,Incidencia,Alarma,BolsaHoras}Repository
    │           │   └── ui/        ← ChronoPage (sidebar tabs: dashboard, registros, incompletos,
    │           │                     vacaciones, alarmas, informes), reads ?view= from URL
    │           ├── chrono-admin/  ← Administración del chrono (RRHH)
    │           │   ├── domain/    ← entities (EmpleadoConfig, EmpleadoResumen, Equipo, ConfigEmpresa,
    │           │   │                 FichaEmpleado, JiraResumen, Notificacion), ports
    │           │   ├── infra/     ← AdminFichajeRepo, EmpleadoConfigRepo, EquipoRepo, ConfigRepo,
    │           │   │                 FichaEmpleadoRepo (encrypt/decrypt), JiraResumenRepo,
    │           │   │                 NotificacionRepo, AdminVacacionRepo
    │           │   └── ui/        ← ChronoAdminPage (tabs: dashboard, empleados, equipos,
    │           │                     aprobaciones, jira, informes), FichaEmpleadoDrawer
    │           └── vector-logic/  ← Task orchestration platform (workflows + tasks + AI)
    │               ├── domain/    ← entities (Workflow, State, Transition, TaskType, Task,
    │               │                 FieldType, AI{Settings,Conversation,Message,Rule}),
    │               │                 ports (IWorkflowRepo, IStateRepo, ITransitionRepo,
    │               │                 ITaskTypeRepo, ITaskRepo, IAIRepo, ILLMService)
    │               ├── infra/     ← Supabase{Workflow,State,Transition,TaskType,Task,AI}Repo,
    │               │                 LLMService (thin HTTP client → apps/api /ai/chat)
    │               ├── container.ts ← Wires infra adapters; UI imports from here
    │               └── ui/        ← VectorLogicPage (Stitch sidebar: Workspace / Workflow Engine /
    │                                 Configuration), 8 views:
    │                                   • KanbanView — drag-and-drop tasks across states
    │                                   • ChatView — embedded AI chat with tool use (create_task)
    │                                   • StateManagerView — 4 columns by category, one-OPEN rule
    │                                   • CanvasDesignerView — React Flow visual state machine
    │                                   • AssignmentManagerView — task types → workflows
    │                                   • SchemaBuilderView — 20+ field types, dual visibility
    │                                   • AIRulesView — natural-language rules injected as context
    │                                   • SettingsView — AI provider, API key, MCP endpoint
    │
    └── api/                   ← Fastify backend
        └── src/
            ├── domain/        ← interfaces (IJiraConnectionRepository, IUserRepository,
            │                     ILLMService, etc.)
            ├── infrastructure/
            │   ├── http/      ← authRoutes, worklogRoutes, hotdeskRoutes, jiraRoutes, aiRoutes
            │   ├── jira/      ← JiraCloudAdapter (projects, issues, subtasks, fields, search, worklogs)
            │   └── llm/       ← LLMServiceAdapter (Anthropic Messages API, OpenAI Chat
            │                     Completions, tool use / function calling)
            └── app.ts         ← Fastify setup, plugin registration
```

### AI proxy route

The `/ai/chat` route exists so API keys never leave the server. The frontend
reads the user's per-user settings from `vl_ai_settings` and forwards the key
in the POST body to `/ai/chat`; the backend `LLMServiceAdapter` holds the
actual HTTPS call to Anthropic/OpenAI. The browser never talks to
`api.anthropic.com` or `api.openai.com` directly.


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
- `JiraTicketPicker` — lista pre-filtrada de tickets con buscador y multiselect. El caller le pasa los tickets ya cargados (agnóstico de transport)
- `StatusManager` — lista drag-to-reorder + CRUD + color + categoría. Presentacional: recibe
  `statuses`, `categories` y callbacks `onCreate/onUpdate/onDelete/onReorder`. Reutilizable para
  cualquier módulo que necesite estados configurables (releases, reservas, tickets…).
- `DualPanelPicker` — selector de dos paneles (disponibles / seleccionados) con drag & drop,
  click-to-move y búsqueda en ambos paneles. Deduplica automáticamente por valor.
  Usado en Admin Environments (issue types Jira) y Admin Deploy Planner (issue types Jira).
- `DateRangePicker` — selector de rango de fechas con calendario popover. Campos compactos
  que se abren al click. Soporta `showTime` (con/sin hora), `maxDurationHours` (limita rango),
  range highlight, hover preview. Bordes dorados. Usado en Environments (reservas) y Deploy
  Planner (release dates).
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

## Jira Tracker — Features

### Vistas
- **Calendario**: Vista mensual con horas por día, click abre vista día
- **Vista día**: Worklogs agrupados por épica, resumen por tarea
- **Tareas**: Solo muestra tareas con horas en el rango de fechas seleccionado.
  Horas filtradas por rango + autor. Filtros por tipo, búsqueda, ordenación.

### Barra lateral derecha "Recientes"
- Componente `RecentTasksSidebar` compartido entre las 3 vistas
- Últimas 20 tareas únicas con worklogs (independiente de filtros)
- Click abre modal de imputar horas
- Colapsable (220px abierta, 32px cerrada)

### Exportación CSV configurable
- Modal `ExportConfigModal` con dual-panel para seleccionar/reordenar campos
- 16 campos disponibles (fecha, clave, resumen, tipo, estado, etc.)
- Drag & drop para reordenar columnas
- Presets guardados por usuario en `users.export_presets` (jsonb)
- Campo de nombre personalizado del archivo + rango de fechas automático

### Filtros (sidebar izquierda)
- Rango de fechas (por defecto mes actual)
- Filtro por usuario Jira (recarga issues de todos los proyectos)
- Filtro por usuario WorkSuite (filtra worklogs por autor)
- Proyectos/espacios (multi-select)

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
- Issue types seleccionables con DualPanelPicker (incluye subtareas), persistidos en `dp_version_config.issue_types`

### Admin (organizado en tabs)
- **Estados**: Release statuses CRUD + Jira statuses de importación
- **Jira**: Jira Field Mapping (issue types + repo field)
- **Versiones**: Generador de versiones (prefix, separator, segments)
- **Repos**: Repo groups con dependencias
- **Subtareas**: Configuración de tipos de subtareas

### UI — Carbon Logic (Stitch) design system
- **Sidebar lateral** (glass effect, backdrop blur) con brand header (`hub` icon), nav items con Material Symbols, botón "New Release" con gradient primary, y Jira sync status en el footer
- Icono reutilizable: `DeployPlannerIcon` en `atoms.tsx`
- Glass cards con `backdrop-filter: blur(24px)` + ghost-border-top
- Tipografía Inter, iconos Material Symbols Outlined
- Colores Stitch: `#131313` bg, `#adc6ff`/`#4d8eff` primary, `#e5e2e1` text
- Tokens en CSS variables `--dp-*` con soporte light/dark mode

### Vistas (sidebar nav)
- **Planning**: Header Stitch (PRODUCTION PIPELINE + Planning Board), 4 stat cards glass, release cards con glass effect, filtro por estado
- **Timeline**: GanttTimeline con zoom, drag-resize, group frames, filtro
- **History**: Tabla con filtros, ordenar, columna de bugs
- **Metrics**: Stats de releases, bugs, tests, repos

---

## Environments — Features

### Entornos
- CRUD de entornos con categoría (DEV/PRE/STAGING), max duración, URL, priority
- `priority` (integer) controla el orden en la barra lateral (menor = primero)

### Barra lateral de entornos
- Lista de entornos ordenados por priority, luego por nombre
- Indicador visual: punto verde + "Disponible" si libre, punto rojo + estado + fecha fin si ocupado
- Filtro toggle "Todos / Libres"
- Click en entorno libre → abre modal de nueva reserva
- Click en entorno ocupado → abre modal de detalle de la reserva activa

### Reservas
- Check-in/check-out/cancelar disponible para owner Y admin
- Cards de reserva muestran repos extraídos de Jira como chips
- Historial de 2 meses con filas clickeables

### Admin (organizado en tabs)
- **Entornos**: CRUD con priority, lock, archive
- **Estados**: StatusManager con categorías (reserved, in_use, completed, cancelled, violation)
- **Filtro Jira**: DualPanelPicker para issue types (incluye subtareas) + chips para proyectos y statuses
- **Política**: Ventana de reserva, duración mínima, horario laboral

---

## Chrono — Control horario (autoservicio)

Módulo para que cada usuario gestione su propio fichaje y tiempos.

### UI — Carbon Logic (Stitch) design system
- Tipografía Inter, iconos Material Symbols Outlined (reemplaza emojis)
- Tokens compartidos en `modules/chrono/shared/theme.ts` (`CHRONO_THEME`)
- Dashboard con hero timer bento card, `ChronoStatCard` con progressBar/subtext/sparkline
- Botones gradient primary con glow, tablas con sticky headers
- Sidebar con nav items estilo glow on active

### Vistas (sidebar tabs)
- **Dashboard** — Hero timer, estado del fichaje hoy + bento grid de stats (horas hoy, semana, bolsa, vacaciones, alertas, equipo)
- **Registros** — Listado de fichajes históricos por mes con detalles entrada/comida/salida
- **Incompletos** — Fichajes con datos faltantes (entrada sin salida, etc.). Plazo de 48h antes de pasar a incidencia
- **Vacaciones** — Solicitud y consulta de vacaciones, saldo del año
- **Alarmas** — Alarmas configurables (recordatorio entrada, salida, comida) con sonido
- **Informes** — Reportes de horas, vacaciones, incidencias, bolsa de horas

### Routing
- `/chrono` con `?view=` query param sincronizado con el estado de tab
- Permite deep links: `/chrono?view=incompletos` (usado por notificaciones)

### Domain
- `Fichaje` — id, userId, fecha, entradaAt, comidaIniAt, comidaFinAt, salidaAt, minutosTrabajados, tipo, estado, geoEntrada, geoSalida
- `Vacacion` — id, userId, tipo, fechaInicio, fechaFin, diasHabiles, estado
- `Incidencia` — fichajes incompletos pasado el plazo
- `Alarma` — id, userId, tipo, hora, sonido, activa
- `BolsaHoras` — saldo de horas extra

---

## Chrono Admin — RRHH

Módulo de administración de RRHH sobre el chrono.

### UI — Carbon Logic (Stitch) design system
- Tokens importados desde `chrono-admin/shared/adminColors.ts` (remapea legacy `C` → `CHRONO_THEME`)
- Tab bar Stitch con primary active + glow shadow
- Tablas con sticky headers, hover rows, Material Symbols
- Buttons: gradient primary/danger/success con box-shadow glow
- `ChronoStatCard` reutilizado para dashboard stats

### Vistas (top tabs)
- **Dashboard** — Resumen del equipo: total empleados, fichando hoy, incompletos, vacaciones, alertas
- **Empleados** — Tabla de empleados con horas hoy/mes, equipo, estado, jornada. Edición inline de config.
  Botón "Ver ficha" → abre `FichaEmpleadoDrawer` con datos sensibles encriptados
- **Equipos** — CRUD de equipos con manager y miembros
- **Aprobaciones** — Aprobar/rechazar fichajes pendientes y solicitudes de vacaciones
- **Jira** — Comparativa horas Jira vs horas fichadas. Enviar recordatorios a empleados con déficit
  (genera notificación con `link: /chrono?view=incompletos`)
- **Informes** — Reportes mensuales de empresa (CSV export, charts)

### Ficha del empleado (encriptada server-side)
Datos sensibles guardados en `ch_ficha_empleado` con cifrado **AES-256-GCM aplicado en una Supabase
Edge Function** (`ficha-empleado`). El navegador nunca ve la clave maestra. El repositorio
`FichaEmpleadoSupabaseRepository` actúa como un cliente HTTP fino que invoca la función vía
`POST /functions/v1/ficha-empleado` con `{action:'get'|'upsert', userId, data}`.

La Edge Function:
1. Valida el JWT del caller (`auth.getUser`)
2. Verifica que `users.role === 'admin'`
3. Encripta/desencripta usando `ENCRYPTION_KEY` (secret server-side, derivada con PBKDF2 SHA-256)
4. Lee/escribe la tabla con el service role key

Campos encriptados:
- `clienteAsignado`, `valorHora`, `seniority`
- `contactoTelefono`, `contactoEmailPersonal`
- `nss` (número de seguridad social)
- `notas`, `razonBaja`

Campos sin encriptar (fechas):
- `fechaIncorporacion`, `fechaBaja`

### Notificaciones
Sistema cross-módulo. La campanita 🔔 está en el topbar global (`apps/web/src/shared/ui/NotificationsBell.tsx`).
- **Puerto**: `apps/web/src/shared/domain/ports/NotificationPort.ts`
- **Adapter**: `apps/web/src/shared/infra/SupabaseNotificationRepo.ts`
- **Hook**: `useNotificaciones(repo, userId)` — recibe el repo por DI
- Las notificaciones tienen `link` opcional → el bell navega ahí al hacer click

---

## Profile

Página `/profile` (módulo `apps/web/src/modules/profile/`). Muestra la información del usuario autenticado
leída de `useAuth()`. Sin repositorio propio (KISS — solo lee). Accesible desde el `UserMenu` del topbar.

---

## Topbar global (apps/web/src/WorkSuiteApp.tsx)

```
[Logo] [Module switcher] ··· [🌙/☀️] [EN/ES] [🔔 Bell] [● Admin] [Avatar+Name ▾]
```

- **Theme toggle**: un solo botón que alterna 🌙/☀️
- **Language switcher**: EN/ES
- **NotificationsBell**: shared component, recibe `NotificationPort` por DI
- **Admin button**: navega a `/admin`. Visible solo si `role === 'admin'`
- **UserMenu**: avatar + nombre con dropdown
  - Mi perfil (`/profile`)
  - Ajustes (`/admin`)
  - ─── separador ───
  - Cerrar sesión (en rojo, último item)

Componentes shared del shell viven en `apps/web/src/shared/ui/` (no en `packages/ui` porque dependen
de routing/auth de la app web). Se documentan en el UI Kit (`/ui-kit`).

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
| `syn_environments` | Entornos con priority para orden en sidebar |
| `syn_reservations`, `syn_reservation_statuses`, `syn_reservation_history`, `syn_jira_filter_config` | Environments |
| `dp_repo_groups`, `dp_subtask_config` | Config de repos y subtareas |
| `ch_fichajes` | Fichajes diarios (entrada, comida, salida, geo, estado) |
| `ch_empleado_config` | Config por empleado: horas jornada, días vacaciones, días de jornada |
| `ch_config_empresa` | Config global: jornada, pausas, tolerancia, geo whitelist, IP whitelist |
| `ch_equipos`, `ch_equipo_miembros` | Equipos del chrono-admin |
| `ch_vacaciones`, `ch_saldo_vacaciones` | Vacaciones y saldo anual |
| `ch_bolsa_horas` | Bolsa de horas extra por empleado |
| `ch_alarmas` | Alarmas personalizadas del usuario |
| `ch_notificaciones` | Notificaciones cross-módulo (campanita topbar) |
| `ch_ficha_empleado` | **Datos sensibles del empleado encriptados** (cliente, valor hora, contacto, NSS, etc.) |
| `jira_connections` | Conexiones Jira por usuario |
| `sso_config` | SSO + deploy Jira statuses |
| `roles` | Roles y permisos |

---

## Concurrency Control (Reservations)

All modules that manage reservations of shared resources implement database-level
concurrency protection following the same pattern:

```
DB constraint (last line of defense) → INSERT (not UPSERT) → catch 23505 → user feedback + refresh
```

### Per-module strategy

| Module | Resource | DB Protection | Application Handling |
|--------|----------|---------------|---------------------|
| **HotDesk** | Seats per date | `UNIQUE(seat_id, date)` + RPC `reserve_seats_batch()` | `ConflictError` → toast + rollback optimistic update + re-fetch |
| **Deploy Planner** | Env per planned date | `UNIQUE INDEX (environment, planned_at) WHERE status NOT IN (...)` | `ConflictError` propagated to UI |
| **Environments** | Env time ranges | Trigger `check_reservation_overlap()` (raises 23505) | `ConflictError` → alert + re-fetch |

### Why INSERT instead of UPSERT

`UPSERT` with `onConflict` converts a constraint violation into an UPDATE, silently
overwriting the first user's data. This is **wrong for reservations** where
first-come-first-served must apply. Using `INSERT` lets the constraint fail explicitly,
which the application catches and surfaces to the user.

### Shared error class

`apps/web/src/shared/domain/errors/ConflictError.ts` — thrown by all infra adapters
when Postgres returns error code `23505` (unique_violation). UI layers catch this to
show translated messages and refresh stale state.

### Spec

Full specification: `specs/core/concurrency/SPEC.md`

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
