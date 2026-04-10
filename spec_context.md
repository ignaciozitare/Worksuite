# WorkSuite — SPEC_CONTEXT

> Snapshot del **estado real** del proyecto al 2026-04-10. No describe el estado ideal sino lo que existe hoy en el código.
> Fuente: lectura directa de `apps/`, `packages/`, `ARCHITECTURE.md`, `README.md`.

---

## 1. Stack y estructura general

Monorepo npm workspaces.

```
worksuite/
├── packages/
│   ├── shared-types/     ← tipos TypeScript de dominio
│   ├── i18n/             ← sistema de traducción (es/en)
│   ├── ui/               ← componentes reutilizables (@worksuite/ui)
│   ├── jira-client/      ← cliente HTTP para Jira Cloud (usado por apps/api)
│   └── jira-service/     ← servicio Jira de frontend (adapter + utils)
├── apps/
│   ├── web/              ← React 18 + Vite SPA
│   └── api/              ← Fastify backend (hexagonal, Vercel Serverless)
└── docs/
```

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Node.js + Fastify + TypeScript |
| Base de datos | Supabase (Postgres + Auth + RLS) |
| Jira | REST API v3 via JiraCloudAdapter |
| i18n | @worksuite/i18n (es/en) |
| UI Components | @worksuite/ui |
| Deploy | Vercel (web + api auto-deploy on push to main) |

---

## 2. Módulos

| Módulo | Descripción |
|--------|------------|
| **Jira Tracker** | Imputación de horas, calendario, vista día, tareas (solo con horas en rango), sidebar recientes, export CSV configurable con presets. Filtro por usuario Jira, hide done tasks. |
| **HotDesk** | Mapa de oficina SVG, reservas de puesto, vista mensual, blueprints editables |
| **RetroBoard** | Retrospectivas estructuradas (lobby, fases, kanban de accionables, historial, equipos) |
| **Deploy Planner** | Releases con versiones auto-generadas, timeline Gantt, repo groups con dependencias, subtareas (bugs/tests/other), métricas |
| **Environments** | Gestión de entornos de despliegue con barra lateral, reservas con estados configurables, timeline, historial |
| **Chrono** | Control horario del usuario (autoservicio): dashboard, registros, fichajes incompletos, vacaciones, alarmas, informes. Sincroniza tab con `?view=` query param para deep links. |
| **Chrono Admin (RRHH)** | Administración del chrono: empleados, equipos, aprobaciones, comparativa Jira vs fichaje, ficha del empleado con datos sensibles encriptados, informes con CSV export y gráficos |
| **Profile** | Página `/profile` de identidad del usuario actual (lee de `useAuth`, sin repo propio) |

---

## 3. Paquetes compartidos (@worksuite/*)

### @worksuite/ui
- `GanttTimeline` — Gantt chart interactivo (zoom, drag, groups)
- `JiraTicketSearch` — autocomplete de tickets Jira (DI del search)
- `JiraTicketPicker` — lista pre-cargada + buscador + multiselect
- `StatusManager` — CRUD + drag-reorder de estados (presentacional, reutilizable)
- `DualPanelPicker` — selector dual-panel con drag & drop, click-to-move, búsqueda, dedup automático
- `DateRangePicker` — campos compactos con calendario popover, rango visual, maxDurationHours, showTime, bordes dorados
- `Btn`, `Avatar`, `Badge`, `Modal`, `ConfirmModal`, `TimerBar`, `StatBox`, `Divider`, `Chip`

### @worksuite/i18n
- I18nProvider con persistencia en localStorage
- Locales: `es.json`, `en.json`

### @worksuite/jira-service
- `JiraSearchPort` — puerto para buscar issues por JQL
- `HttpJiraSearchAdapter` — adapter HTTP contra `/jira/search`
- `extractReposFromTickets(tickets, repoField)` — normaliza repos de Jira

### @worksuite/jira-client
- Cliente HTTP para Jira Cloud REST API v3 (usado por apps/api)

---

## 4. Arquitectura hexagonal

```
UI → UseCases/Services → Ports ← Infra (Supabase/Jira)
```

- `domain/` no importa nada de `infra/` ni de `ui/`
- `supabase.from()` solo en archivos dentro de `/infra/`
- `fetch()` a APIs externas solo en adapters

Cada módulo sigue: `domain/` (entities, ports, useCases) + `infra/` (repos, adapters) + `ui/` (components)

---

## 5. Deploy Planner — detalle

### Entidades
- `Release` — id, releaseNumber, status, ticketIds, ticketStatuses, startDate, endDate
- `ReleaseStatus` — id, name, color, bgColor, border, ord, isFinal, status_category
- `ReleaseConfig` — prefix, segments, separator, nextNumber, repoJiraField, issueTypes

### Features
- CRUD releases con versión auto-generada (prefix + segments + separator)
- Status con categorías: `backlog`, `in_progress`, `approved`, `done`
- Drag-and-drop tickets entre releases
- Repo groups con dependencias (bloqueo cross-release)
- Subtareas: admin configura issue types como bug/test/other + closed_statuses
- Contadores `🐛 2/5 · 🧪 3/8` en cards de release
- Jira Field Mapping: issue types (DualPanelPicker, incluye subtareas, persistido en `dp_version_config.issue_types`) + repo field selector

### Vistas (pill-style tabs)
- **Planning** — Cards con tickets, repos, contadores, filtro por estado
- **Timeline** — GanttTimeline con zoom, drag-resize, group frames
- **History** — Tabla con filtros, ordenar, bugs
- **Metrics** — Stats de releases, bugs, tests, repos

### Admin (organizado en tabs)
- **Estados** — Release statuses CRUD + Jira statuses de importación
- **Jira** — Jira Field Mapping (DualPanelPicker para issue types + repo field)
- **Versiones** — Generador de versiones (prefix, separator, segments)
- **Repos** — Repo groups con dependencias
- **Subtareas** — Configuración de tipos de subtareas (bug/test/other + closed_statuses)

---

## 6. Environments — detalle

### Entidades
- `Environment` — id, name, category (DEV/PRE/STAGING), isLocked, isArchived, maxReservationDuration, color, url, priority
- `Reservation` — id, environmentId, reservedByUserId, jiraIssueKeys, description, plannedStart, plannedEnd, statusId, statusCategory, statusName, extractedRepos, usageSession
- `ReservationStatus` — id, name, color, bg_color, border, ord, status_category (reserved/in_use/completed/cancelled/violation)

### Barra lateral de entornos
- Lista ordenada por `priority` (menor = primero), luego por nombre
- Indicador: punto verde "Disponible" / punto rojo + estado + fecha fin
- Filtro toggle "Todos / Libres"
- Click en entorno libre → abre modal de nueva reserva
- Click en entorno ocupado → abre modal de detalle de la reserva activa

### Reservas
- Check-in/check-out/cancelar disponible para owner Y admin
- Cards muestran repos extraídos de Jira como chips
- JiraTicketPicker con tickets pre-filtrados por config admin (JQL dinámico)
- Historial de 2 meses con filas clickeables que abren detalle

### Vistas (pill-style tabs)
- **Reservas** — Cards de reserva con filtro (Todas/Activas/Mis reservas) + búsqueda
- **Timeline** — GanttTimeline por entorno
- **Historial** — Tabla con detalle modal

### Admin (organizado en tabs)
- **Entornos** — CRUD con priority, lock, archive, URL, max duración
- **Estados** — StatusManager con categorías (reserved, in_use, completed, cancelled, violation)
- **Filtro Jira** — DualPanelPicker para issue types (incluye subtareas) + chips para proyectos y statuses
- **Política** — Ventana de reserva, duración mínima, horario laboral

---

## 6.5 Chrono — detalle (control horario del usuario)

### Entidades
- `Fichaje` — id, userId, fecha, entradaAt, comidaIniAt, comidaFinAt, salidaAt, minutosTrabajados, tipo (normal/teletrabajo/medico/formacion/viaje/asunto_propio), estado (abierto/completo/incompleto/pendiente_aprobacion/aprobado/rechazado), justificacion, geoEntrada, geoSalida
- `Vacacion` — id, userId, tipo, fechaInicio, fechaFin, diasHabiles, estado
- `Incidencia` — fichajes incompletos pasado el plazo de 48h
- `Alarma` — id, userId, tipo, hora, sonido, activa
- `BolsaHoras` — saldo de horas extra por empleado

### Vistas (sidebar tabs)
- **Dashboard** — Estado del fichaje hoy + resumen del mes (horas trabajadas, días, incidencias, bolsa)
- **Registros** — Listado de fichajes históricos por mes con detalles entrada/comida/salida
- **Incompletos** — Fichajes con datos faltantes. Plazo de 48h antes de pasar a incidencia
- **Vacaciones** — Solicitud y consulta de vacaciones, saldo del año
- **Alarmas** — Alarmas configurables (recordatorio entrada, salida, comida) con sonido elegible
- **Informes** — Reportes de horas, vacaciones, incidencias, bolsa de horas

### Routing
- Ruta: `/chrono` con `?view=` query param sincronizado con la tab activa
- Permite deep links: `/chrono?view=incompletos` (usado por notificaciones de Chrono Admin)
- `setView` actualiza el estado y la URL en paralelo (replace)

---

## 6.6 Chrono Admin — detalle (RRHH)

### Entidades
- `EmpleadoConfig` — userId, horasJornadaMinutos, diasVacaciones, jornadaDias (`['L','M','X','J','V']`)
- `EmpleadoResumen` — userId, nombre, email, estadoHoy (oficina/teletrabajo/vacaciones/medico/ausente/sin_fichar), minutosHoy, fichajesIncompletos, saldoVacacionesDias, saldoBolsaMinutos
- `Equipo` — id, nombre, descripcion, managerId, miembros[]
- `ConfigEmpresa` — horasJornadaMinutos, pausaComidaMin/Max, toleranciaEntrada, diasVacacionesBase, requiereGeo, geoWhitelist, ipWhitelist, requiereAprobacionFichaje, slackWebhookUrl
- `JiraResumen` — comparativa horas Jira vs horas fichadas por empleado
- `Notificacion` — id, userId, tipo, titulo, mensaje, leida, link, createdAt
- **`FichaEmpleado`** — datos sensibles del empleado **encriptados en DB**:
  - clienteAsignado, valorHora, seniority (encriptados)
  - contactoTelefono, contactoEmailPersonal (encriptados)
  - nss — número de seguridad social (encriptado)
  - notas, razonBaja (encriptados)
  - fechaIncorporacion, fechaBaja (sin encriptar, tipo `date`)

### Vistas (top tabs)
- **Dashboard** — Resumen del equipo: total empleados, fichando hoy, incompletos, vacaciones, alertas
- **Empleados** — Tabla con horas hoy/mes, equipo, estado, jornada. Edición inline de config.
  Columna **Ficha** con botón "Ver ficha" → `FichaEmpleadoDrawer` (drawer lateral renderizado vía
  React Portal para escapar contextos transformados)
- **Equipos** — CRUD con manager y miembros
- **Aprobaciones** — Aprobar/rechazar fichajes pendientes y solicitudes de vacaciones
- **Jira** — Comparativa horas Jira vs horas fichadas. Botón "Enviar recordatorio" genera notificación
  con `link: '/chrono?view=incompletos'` que el bell del topbar abre al hacer click
- **Informes** — Reportes mensuales con charts, tablas y CSV export

### Encriptación de la ficha
- **Algoritmo**: AES-256-GCM via Web Crypto API
- **Derivación de clave**: PBKDF2 (100k iteraciones, SHA-256) sobre `VITE_ENCRYPTION_KEY`
- **Formato ciphertext**: `base64(iv(12) || ciphertext || tag)`
- **Encrypt/decrypt transparente** en `FichaEmpleadoSupabaseRepository` — el consumidor del puerto
  `IFichaEmpleadoRepository` siempre recibe los datos en claro
- **Utilidad**: `apps/web/src/shared/lib/crypto.ts`
- ⚠️ Si la `VITE_ENCRYPTION_KEY` cambia, los datos previamente cifrados quedan ilegibles

---

## 6.7 Topbar global y notificaciones cross-módulo

### Topbar (`apps/web/src/WorkSuiteApp.tsx`)
```
[Logo] [Module switcher] ··· [🌙/☀️] [EN/ES] [🔔 Bell] · [● Admin] [Avatar+Name ▾]
```

- **Theme toggle**: un solo botón que alterna 🌙/☀️ (no dos botones separados)
- **NotificationsBell**: visible siempre (no solo dentro de chrono)
- **Admin button**: a la izquierda del avatar
- **UserMenu**: avatar+nombre con dropdown — Mi perfil, Ajustes, ─── separador ───, Cerrar sesión (rojo, último)

### Notificaciones (NotificationsBell shared)
- **Componente**: `apps/web/src/shared/ui/NotificationsBell.tsx`
- **Render**: panel slide-in vía `createPortal(document.body)` para escapar el `transform` del padre
  (que crea containing block y rompe `position: fixed`)
- **Hook**: `useNotificaciones(repo, userId)` en `apps/web/src/shared/hooks/`
- **Puerto**: `NotificationPort` en `apps/web/src/shared/domain/ports/`
- **Adapter**: `SupabaseNotificationRepo` en `apps/web/src/shared/infra/`
- **Tabla DB**: `ch_notificaciones`
- Click en notificación → marca como leída → navega al `link` (incluye query params)

### UserMenu y Profile
- `UserMenu` — `apps/web/src/shared/ui/UserMenu.tsx`. Cierra por click fuera. Documentado en UI Kit
- Profile — módulo `apps/web/src/modules/profile/`. Solo `ui/ProfilePage.tsx` (KISS, sin repo propio)
- Ruta `/profile` lazy-loaded en `WorkSuiteApp.tsx`

---

## 7. Base de datos (tablas principales)

| Tabla | Descripción |
|-------|------------|
| `users` | role, desk_type, modules (jsonb), jira_api_token, export_presets (jsonb) |
| `worklogs` | Imputaciones de tiempo |
| `seats`, `seat_reservations`, `fixed_assignments` | HotDesk |
| `buildings`, `blueprints` | Planos de oficina |
| `retro_sessions`, `retro_actionables`, `retro_teams`, `retro_team_members` | RetroBoard |
| `dp_releases` | Releases de Deploy Planner |
| `dp_release_statuses` | Estados de release con status_category y ord |
| `dp_version_config` | Config de versiones + repo_jira_field + issue_types (text[]) |
| `dp_repo_groups` | Grupos de repos con dependencias |
| `dp_subtask_config` | Config de tipos de subtareas (bug/test/other) |
| `syn_environments` | Entornos con category, priority, isLocked, maxReservationDuration |
| `syn_reservations` | Reservas de entorno con status_id FK |
| `syn_reservation_statuses` | Estados de reserva con status_category y ord |
| `syn_reservation_history` | Historial de reservas (2 meses) |
| `syn_jira_filter_config` | Config singleton de filtro Jira (projectKeys, issueTypes, statuses) |
| `syn_reservation_policy` | Política de reservas (booking_window, min_duration, business_hours) |
| `ch_fichajes` | Fichajes diarios del Chrono (entrada, comida, salida, geo, estado, tipo) |
| `ch_empleado_config` | Config por empleado: horas jornada, días vacaciones, jornada_dias |
| `ch_config_empresa` | Config global: jornada, pausas, tolerancia, geo/IP whitelist, requiere aprobación |
| `ch_equipos`, `ch_equipo_miembros` | Equipos del chrono-admin |
| `ch_vacaciones`, `ch_saldo_vacaciones` | Vacaciones y saldo anual |
| `ch_bolsa_horas` | Bolsa de horas extra |
| `ch_alarmas` | Alarmas personalizadas del usuario (recordatorios entrada/salida/comida) |
| `ch_notificaciones` | Notificaciones del bell del topbar (cross-módulo). Campos: `user_id`, `tipo`, `titulo`, `mensaje`, `link`, `leida`, `created_at` |
| `ch_ficha_empleado` | **Datos sensibles del empleado encriptados (AES-256-GCM)**: cliente, valor hora, contacto, NSS, seniority, notas, razón baja. Fechas (incorporación/baja) en plano. |
| `jira_connections` | Conexiones Jira por usuario |
| `sso_config` | SSO + deploy_jira_statuses |
| `roles` | Roles y permisos |

---

## 8. API Endpoints (Fastify)

| Ruta | Método | Descripción |
|------|--------|------------|
| `/auth/login` | POST | Login → JWT propio |
| `/auth/me` | GET | Perfil del usuario autenticado |
| `/jira/connection` | GET/POST/DELETE | CRUD conexión Jira |
| `/jira/projects` | GET | Proyectos Jira |
| `/jira/issues?project=X&userFilter=Y` | GET | Issues con filtro por usuario Jira |
| `/jira/issuetypes` | GET | Tipos de issue de Jira |
| `/jira/statuses` | GET | Statuses de Jira (id, name, category) |
| `/jira/fields` | GET | Campos disponibles (standard + custom) |
| `/jira/subtasks?parents=K1,K2` | GET | Subtareas batch por JQL |
| `/jira/search` | GET | Búsqueda JQL |
| `/jira/worklogs/:key/sync` | POST | Sync worklog a Jira |
| `/worklogs` | CRUD | Worklogs locales |
| `/hotdesk` | CRUD | Reservas y asignaciones HotDesk |

---

## 9. Deploy

| Proyecto Vercel | Root | Descripción |
|----------------|------|------------|
| `worksuite` | `.` (raíz) | Frontend React SPA |
| `worksuite-api` | `apps/api` | Backend Fastify Serverless |

Auto-deploy en push a `main`. Variables de entorno en Vercel dashboard.
