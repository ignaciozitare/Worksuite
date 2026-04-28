# HotDesk — Module Spec

> **Snapshot spec (2026-04-29).** Documenta el estado actual del módulo. La sección "Booking Confirmation + Fixed Seat Delegation" más abajo es el spec de la entrega que introdujo confirmación + delegación + check-in.

## Overview

HotDesk es la herramienta de reserva de puestos de oficina. Cada planta de cada edificio tiene un plano (SVG / blueprint) con asientos numerados; los empleados reservan un asiento para una fecha concreta, los usuarios con asiento fijo lo tienen pre-asignado y pueden delegarlo, y los administradores configuran edificios, plantas y reglas.

### Quién lo usa
Cualquier empleado con cuenta WorkSuite. Los admins además gestionan edificios, plantas (subiendo / editando blueprints), bloqueos de asientos, y la configuración global de confirmación.

## Sub-views

URL: `/hotdesk/:view`. Tabs:

| Tab | Componente | Para qué |
|---|---|---|
| `map` | `HDMapView` (renderiza `BlueprintHDMap` + `OfficeSVG`) | Vista visual del plano: cada asiento se ve como un círculo en su `(x, y)` con color por estado (libre / ocupado / fijo / bloqueado / propio). Hover → tooltip con nombre del ocupante. Click → modal de reserva. |
| `table` | `HDTableView` | Tabla de asientos con columnas zona / label / estado / ocupante / fecha. Filtros + búsqueda. |

Selector de **edificio + planta** persistente en el header (cuando hay >1 edificio / floor). El blueprint activo se guarda por usuario para no preguntarle cada vez.

Vista **`AdminHotDesk`** (en `/admin → mod=hotdesk`): CRUD edificios, CRUD plantas, editor de blueprints (subir SVG, posicionar asientos arrastrando), CRUD asignaciones fijas, bloqueos de asientos, configuración (`hotdesk_config`).

## Actions del usuario

- **Reservar asiento** para una fecha. Status inicial = `pending` si la confirmación está activa, o `confirmed` si está desactivada / el rol está exento.
- **Cancelar mi reserva** antes de la fecha.
- **Check-in** con el botón "CHECK IN" estilo CLOCK IN (gradient verde, glow). Cambia status `pending → confirmed`, registra `confirmed_at`. Solo aparece para la reserva del día actual del usuario.
- **Delegar asiento fijo** a otro usuario por una o más fechas (solo si el usuario tiene asiento fijo).
- **Ver mapa o tabla** según preferencia.
- **Filtrar por zona** (allowed_booking_zones puede limitar qué zonas ve cada usuario).

Acciones admin (en `/admin`):
- CRUD edificios, plantas (blueprints).
- Editor visual del blueprint: subir background SVG, posicionar / mover / borrar asientos.
- Asignaciones fijas (`fixed_assignments`).
- Bloquear / desbloquear asientos con razón (mantenimiento, reservado para visita, etc.).
- Configuración global (`hotdesk_config`): toggle de confirmación, deadline en minutos, business day start, exempt roles, auto-release.

## Reglas y límites

- **Una reserva por usuario por día.** Si el usuario tiene fixed_assignment, esa cuenta como reserva implícita salvo que la haya delegado.
- **Asientos bloqueados** (`is_blocked=true` en `seats`) no admiten reservas, no se auto-releasean. Aparecen como "Unavailable".
- **Auto-release** del status `pending`: un cron / Edge Function corre cada 5 min y marca `released` cualquier reserva sin confirmar pasada la deadline (`business_day_start + confirmation_deadline_minutes`).
- **Zonas permitidas:** `users.allowed_booking_zones` (jsonb) y/o `ch_equipos.allowed_booking_zones` (text CSV) limitan en qué zonas reservar. Si vacío, sin restricción.
- **Delegación:** el dueño no puede tener reserva en otro asiento la misma fecha que delega (está cediendo el suyo).
- **Confirmation window:** después de la deadline, el botón "CHECK IN" desaparece y la reserva queda `released`.

## Conexiones

- **Supabase** — tablas `seats`, `seat_reservations`, `fixed_assignments`, `buildings`, `blueprints`, `hotdesk_config`. RLS por usuario (cada user ve todas las reservas pero solo modifica las propias / las de su asiento fijo).
- **Chrono Admin** — `ch_equipos.allowed_booking_zones` se referencia para filtros.
- **`@worksuite/ui`** — `Modal`, `Btn`, `UserAvatar`, etc. Plus el blueprint SVG es propio del módulo.
- **Cron / Edge Function** — para el auto-release. Vive en `apps/api` o como Supabase Edge Function (verificar).

## Modelo de datos

### `buildings`
Un edificio. Campos: `id` (uuid), `name`, `address`, `city`, `active`, `created_at`.

### `blueprints`
Plantas/floors de cada edificio. Campos: `id`, `building_id` (FK), `floor_name`, `floor_order` (sort), `layout` (jsonb con la estructura del plano: SVG path, dimensiones, zones), `created_at`, `updated_at`.

### `seats`
Un asiento concreto en alguna planta. Campos: `id` (text — convención `floor.code-N`, ej. `A1`, `B12`), `zone`, `label`, `x` y `y` (integer, coordenadas en el SVG), `is_blocked`, `blocked_reason`. **No** tiene FK explícita a `blueprints` actualmente — la relación se infiere por `zone` o por convención de naming.

### `seat_reservations`
Una reserva. Campos: `id` (text), `seat_id` (FK), `user_id` (uuid), `user_name` (snapshot por si el user es renombrado), `date` (date), `created_at`, `building_id`, `blueprint_id`, `status` (`pending | confirmed | released`), `confirmed_at`, `delegated_by` (uuid, FK → users; null para reservas normales).

### `fixed_assignments`
Asientos fijos asignados de manera permanente. Campos: `seat_id` (text PK), `user_id`, `user_name`. Sin `id` propio — el seat_id es la PK.

### `hotdesk_config`
Singleton (id=`default`). Campos: `confirmation_enabled` (bool), `confirmation_deadline_minutes` (int), `business_day_start` (time), `auto_release_enabled` (bool), `exempt_roles` (text[]). 

### Relaciones en lenguaje plano
Un edificio tiene muchas plantas (blueprints). Una planta tiene muchos asientos. Un asiento tiene cero o una asignación fija (`fixed_assignments`) y muchas reservas a lo largo del tiempo. Un usuario crea muchas reservas. Una reserva puede ser delegada (campo `delegated_by` apunta al dueño que cedió su fijo).

## Estructura del módulo

```
apps/web/src/modules/hotdesk/
├── container.ts
├── domain/
│   └── entities/
│       ├── Seat.ts
│       ├── SeatReservation.ts
│       ├── Blueprint.ts
│       ├── HotDeskConfig.ts
│       ├── seats.ts          # default seat layout for new floors
│       └── constants.ts      # zones, statuses, etc.
├── infra/
│   └── supabase/
└── ui/
    ├── HDMapView.tsx          # vista plano
    ├── HDTableView.tsx        # vista tabla
    ├── HDReserveModal.tsx     # modal de reserva (con check-in / delegate)
    ├── BlueprintHDMap.tsx     # SVG renderer de un blueprint
    ├── BlueprintMiniMap.tsx   # mini overview multi-planta
    ├── OfficeSVG.tsx          # SVG hardcodeado fallback
    └── SeatTooltip.tsx        # tooltip con datos del ocupante
```

## Design system

UI alineada con el patrón "command center" de Chrono / Time Clock:
- Wrapper class `.hd` (análogo a `.ch`).
- Cards con surface background + ghost border + top-edge accent line.
- Botón "CHECK IN" gradient verde grande con glow (mismo peso visual que CLOCK IN).
- Stat cards arriba: Free / Occupied / Fixed / Mine.
- Animaciones: `fade-in`, `pulse-ring`, `pulse-green`.
- El SVG del plano (`OfficeSVG`, `BlueprintHDMap`) **no se toca** estilísticamente — usa su propio rendering.

---

## Booking Confirmation + Fixed Seat Delegation (revisión 2026-04-25, EN PROD)

### Context
HotDesk currently lets users reserve seats instantly with no confirmation step. Seats remain occupied until manually released. There's no mechanism for fixed-seat owners to delegate their seat to another user, and blocked seats lack clear rules.

### Requirements

#### 1. Booking Confirmation (Auto-Release)
Reservations require confirmation within a configurable window. Unconfirmed bookings are auto-released.

- **Confirmation window** — Configurable (default: 30 min after start of business day, e.g., 09:30). Stored in `hotdesk_config`.
- **Flow** — User reserves → status = `pending` → user confirms → status = `confirmed`.
- **Auto-release** — If not confirmed by the deadline, the system marks the reservation `released` and the seat becomes free.
- **Trigger** — Cron / Edge Function runs every 5 min checking for unconfirmed past-deadline reservations.

#### 2. Role-Based Toggle
Admins can disable booking confirmation globally or per role.
- **Global toggle** — `hotdesk_config.confirmation_enabled`.
- **Per-role override** — `hotdesk_config.exempt_roles: text[]`.
- **UI** — Admin panel → HotDesk config tab.

#### 3. Fixed Seat Delegation
Users with a fixed seat can temporarily assign it to another user for specific dates.
- Owner opens fixed seat → "Delegate" → picks user + date(s) → confirm.
- Creates `seat_reservations` row with `delegated_by` = owner.
- Owner can't have a reservation in another seat for the same date.
- Delegated seats show "Delegated by [Name]" badge.

#### 4. Blocked Seats
Blocked seats are never released, regardless of confirmation policy.
- `seats.is_blocked: boolean DEFAULT false`.
- Show as "Unavailable" — no one can reserve, no auto-release applies.

#### 5. Check-In Flow
When a user arrives at their reserved desk, they check in (the primary confirmation mechanism).
- Prominent "CHECK IN" button (same visual weight as Time Clock's CLOCK IN — gradient, glow, large).
- Effect: `pending → confirmed`. `confirmed_at` is set.
- Visibility: only for current user's pending reservation for TODAY.
- After check-in: visual transition from pulsing/pending to solid/confirmed.

### Out of Scope (v1)
- Push/email notifications for confirmation reminders.
- Recurring delegations (only per-date for now).
- QR code check-in (button check-in only).

---

## Out of scope (módulo entero, en este snapshot)

- Reservas recurrentes (todos los lunes).
- Notificaciones cuando se libera el asiento que esperabas.
- Estadísticas de ocupación a nivel admin.
- Heatmap / tendencias de uso.
- Integración con calendarios (Google / Outlook).
- Multi-tenant del workspace (un edificio se asume compartido por todo el workspace).
