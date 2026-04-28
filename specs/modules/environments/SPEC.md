# Environments — Module Spec

> **Snapshot spec (2026-04-28).** Documenta el estado actual del módulo a partir del código en `apps/web/src/modules/environments/`. Las tablas DB usan el prefijo `syn_*` por razones históricas (legacy: el módulo se llamó "Synalthera" antes de Environments).

## Overview

Environments es la herramienta de gestión de entornos de despliegue (DEV, PRE, STAGING, etc.) y sus reservas. Cada entorno representa un servidor compartido limitado donde un developer "se sienta" mientras hace QA / debugging. Sin reserva, el desarrollador no debería tocar ese entorno: la herramienta evita que dos personas pisen las mismas pruebas.

### Quién lo usa
Cualquier developer del workspace. Ve la lista de entornos, sus estados (libre / ocupado / bloqueado), reserva un slot futuro, libera el actual, consulta historial.

Admins editan la lista de entornos, los estados disponibles, las políticas globales (ventana de booking, horario laboral) y la configuración de filtros Jira.

## Sub-views

URL: `/envtracker`. Tres tabs principales:

| Tab | Para qué |
|---|---|
| `reservas` | Vista principal — lista o grid de entornos con su estado actual + próximas reservas. Crear / editar / cancelar reservas. Toggle list/grid view. |
| `gantt` | Timeline horizontal con todas las reservas activas + futuras. Reusa `<GanttTimeline>` de `@worksuite/ui`. |
| `historial` | Tabla de reservas pasadas con filtros (entorno, usuario, fechas, estado). |

Hay además una vista admin en `AdminEnvironments.tsx` (renderizada desde `/admin → mod=envtracker`) para CRUD de entornos, estados de reserva configurables y políticas globales.

## Actions del usuario

- **Reservar entorno.** Elige entorno + rango (`planned_start` / `planned_end`) + tickets Jira asociados (jsonb array de keys, ej. `["BUG-123", "FEAT-45"]`) + descripción opcional + repos seleccionados.
- **Liberar entorno.** Cierra la reserva activa antes del `planned_end`. Marca `actual_end` y mueve a history.
- **Editar reserva propia.** Cambiar fechas, descripción, tickets. Una vez expirada / liberada, no se edita.
- **Cancelar reserva futura.** Borra la row antes de que `planned_start` ocurra.
- **Ver historial** filtrable de TODAS las reservas pasadas (no solo propias) con métricas — quién usó qué entorno cuándo.
- **Switch list ↔ grid view** en la pestaña `reservas`.

Acciones admin (en `/admin`):
- **CRUD entornos.** Nombre, categoría (DEV/PRE/STAGING), URL, color, max duración, archivado, lock total.
- **CRUD estados de reserva.** Lista configurable de status con `name`, `color`, `bg_color`, `border`, `ord`, `status_category`.
- **Política global** — ventana máxima de booking, duración mínima, si permite arrancar en pasado, restringir a horario laboral.
- **Filtros Jira** — qué proyectos / issue types / estados acepta el campo `jira_issue_keys` al validar.

## Reglas y límites

- **Solapamiento bloqueado.** Una reserva no puede solaparse con otra del mismo entorno; el frontend valida + RLS lo refuerza.
- **Max duración por entorno.** `max_reservation_duration` en `syn_environments` (en horas) limita el largo de cada slot.
- **Booking window.** `booking_window_days` en `syn_policy` limita cuánto al futuro se puede reservar.
- **Horario laboral.** Si `business_hours_only=true`, las reservas deben estar dentro de `business_hours_start` y `business_hours_end`.
- **Archivado vs locked.** Un entorno `is_archived=true` ya no aparece en la lista de reservar. `is_locked=true` aparece pero no admite nuevas reservas (mantenimiento).
- **Tickets Jira** son una lista de claves (text). El módulo los valida contra el filtro Jira configurado pero no resuelve metadata — solo guarda las keys; el módulo `jira-tracker` resuelve los detalles.

## Conexiones

- **Supabase** — tablas `syn_*`. RLS por usuario en `syn_reservations` (modify only own); SELECT amplio a todos los miembros del workspace para visibilidad.
- **HotDesk** — el flag `priority` de `syn_environments` permite priorizar entornos en la UI compartida con HotDesk en algunos contextos (referencia visual).
- **`@worksuite/ui` GanttTimeline** — para la pestaña `gantt`.
- **`@worksuite/jira-service`** — usado en pickers de tickets Jira (ahora compartido con Vector Logic / Deploy Planner).
- **`dp_version_config`** — referencia al config de Deploy Planner para algunas vistas que cruzan releases con entornos (compartido).

## Modelo de datos

### `syn_environments`
Un row por entorno. PK `id` (text — convención legacy, ej. `dev01`, `pre02`). Campos: `name`, `category` (`DEV | PRE | STAGING`), `is_archived`, `is_locked`, `max_reservation_duration` (int hours), `color`, `url`, `priority`, `created_at`.

### `syn_reservations`
Una reserva activa o futura. PK `id` (text legacy). Campos: `environment_id` (FK), `reserved_by_user_id`, `jira_issue_keys` (jsonb array de strings), `description`, `planned_start` y `planned_end` (timestamptz), `status` (text — legacy estado libre), `status_id` (FK → `syn_reservation_statuses.id` — el camino moderno), `selected_repository_ids` (jsonb), `usage_session` (jsonb con metadata de la sesión activa), `policy_flags` (jsonb con violaciones de policy detectadas), `extracted_repos` (jsonb con repos parseados desde tickets Jira), `created_at`.

### `syn_reservation_history`
Reservas terminadas. Misma estructura que `syn_reservations` pero con `actual_end` y `reserved_by_name` snapshot del nombre al momento (por si el user es renombrado / borrado). `repos` jsonb desnormalizado.

### `syn_reservation_statuses`
Lista configurable de estados de reserva. Campos: `name`, `color` (texto color principal), `bg_color`, `border`, `ord` (sort), `status_category` (`backlog | in_progress | approved | done` — usado para agrupación visual).

### `syn_jira_filter_config`
Singleton (id=1). `project_keys`, `issue_types`, `statuses` — todos jsonb arrays. Define qué tickets son seleccionables al reservar un entorno.

### `syn_policy`
Singleton (id=1). Política global: `booking_window_days`, `min_duration_hours`, `allow_past_start`, `business_hours_only`, `business_hours_start`, `business_hours_end`.

### `syn_repositories` (legacy, vacía)
Repos hardcodeados que ya no se usan — los repos vienen del campo `extracted_repos` derivado de los tickets Jira.

### Relaciones en lenguaje plano
Un usuario crea muchas reservas; cada reserva pertenece a un entorno. Un entorno tiene muchas reservas (pasadas y futuras). Estados de reserva son una lookup table compartida — todas las reservas referencian uno. Cuando una reserva termina o se cancela, una copia se vuelca a `syn_reservation_history`.

## Estructura del módulo

```
apps/web/src/modules/environments/
├── container.ts
├── domain/
│   ├── entities/
│   │   ├── Environment.ts
│   │   ├── Reservation.ts
│   │   └── ReservationStatus.ts
│   └── ports/
├── infra/
│   └── supabase/
└── ui/
    ├── EnvironmentsView.tsx     # vista principal con tabs reservas/gantt/historial
    └── AdminEnvironments.tsx    # vista admin embebida en /admin
```

## Out of scope (en este snapshot)

- Reserva colaborativa multi-usuario (compartir un entorno entre dos personas con coordinación) — actualmente single-user por slot.
- Notificaciones push cuando se libera el entorno que esperabas — solo refresh.
- Integración bidireccional con Jira (cambiar status del ticket cuando se libera el entorno) — se planeó pero no está implementado.
- Auto-release al detectar inactividad — `usage_session` jsonb tiene la estructura pero no hay heuristic conectado.
- API key / token rotation por entorno.
