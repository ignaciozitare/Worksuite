# HotDesk — SPEC

## Feature: Booking Confirmation + Fixed Seat Delegation

### Context

HotDesk currently lets users reserve seats instantly with no confirmation step. Seats remain occupied until manually released. There's no mechanism for fixed-seat owners to delegate their seat to another user, and blocked seats lack clear rules.

### Requirements

#### 1. Booking Confirmation (Auto-Release)

**Goal:** Reservations require confirmation within a configurable window. Unconfirmed bookings are auto-released.

| Rule | Detail |
|------|--------|
| **Confirmation window** | Configurable (default: 30 min after start of business day, e.g., 09:30). Stored in `hotdesk_config`. |
| **Flow** | User reserves → status = `pending` → user confirms (button in UI or on arrival) → status = `confirmed`. |
| **Auto-release** | If not confirmed by the deadline, the system marks the reservation as `released` and the seat becomes free. |
| **Trigger** | Supabase cron function or Edge Function runs every 5 min checking for unconfirmed past-deadline reservations. |
| **Notification** | (Future) Push/email reminder 15 min before deadline. Out of scope for v1. |

**New entity fields on `seat_reservations`:**
- `status: text NOT NULL DEFAULT 'pending'` — `pending | confirmed | released`
- `confirmed_at: timestamptz` — when the user confirmed

**New table `hotdesk_config`:**
- `id: text PRIMARY KEY DEFAULT 'default'`
- `confirmation_enabled: boolean DEFAULT true`
- `confirmation_deadline_minutes: integer DEFAULT 30` — minutes after `business_day_start`
- `business_day_start: time DEFAULT '09:00'`
- `auto_release_enabled: boolean DEFAULT true`

#### 2. Role-Based Toggle

**Goal:** Admins can disable booking confirmation globally or per role.

| Rule | Detail |
|------|--------|
| **Global toggle** | `hotdesk_config.confirmation_enabled` — if `false`, all bookings are instant (`confirmed` on creation). |
| **Per-role override** | `hotdesk_config.exempt_roles: text[] DEFAULT '{}'` — roles listed here skip confirmation (e.g., `['admin']`). |
| **UI** | Admin panel → HotDesk config tab → toggles for "Require booking confirmation" + multi-select for exempt roles. |

#### 3. Fixed Seat Delegation

**Goal:** Users with a fixed seat can temporarily assign it to another user for specific dates.

| Rule | Detail |
|------|--------|
| **Who can delegate** | Only the fixed-seat owner (user whose `userId` matches the `fixed_assignments.user_id`). |
| **Flow** | Owner opens their fixed seat → "Delegate" button → picks user from team list → picks date(s) → confirm. |
| **Effect** | Creates a `seat_reservations` entry with `user_id` = delegated user, `delegated_by` = owner. |
| **Constraint** | Owner can't have a reservation in another seat for the same date (they're giving up theirs). |
| **Visual** | Delegated seats show a special badge ("Delegated by [Name]") in map and table views. |

**New field on `seat_reservations`:**
- `delegated_by: uuid REFERENCES users(id)` — null for normal reservations, set for delegations.

#### 4. Blocked Seats

**Goal:** Blocked seats are never released, regardless of confirmation policy.

| Rule | Detail |
|------|--------|
| **What's blocked** | Seats marked in a new `blocked_seats` table or a `is_blocked` flag on `seats`. |
| **Who blocks** | Admin only (via admin panel). |
| **Effect** | Blocked seats show as "Unavailable" — no one can reserve, no auto-release applies. |
| **Use case** | Maintenance, broken equipment, reserved for visitors, etc. |

**New field on `seats`:**
- `is_blocked: boolean DEFAULT false`
- `blocked_reason: text` — optional reason shown in UI

#### 5. Check-In Flow

**Goal:** When a user arrives at their reserved desk, they check in. This is the primary confirmation mechanism — similar to the "CLOCK IN" button in Time Clock.

| Rule | Detail |
|------|--------|
| **When** | User arrives, opens HotDesk, sees their pending reservation for today. |
| **UI** | A prominent "CHECK IN" button (same visual weight as Time Clock's CLOCK IN — gradient, glow, large). |
| **Effect** | Reservation status changes from `pending` → `confirmed`. `confirmed_at` is set. |
| **Visibility** | The check-in button only appears for the current user's pending reservation for TODAY. |
| **Auto-release** | If the user doesn't check in before the deadline, the reservation is auto-released. |
| **Feedback** | After check-in, the seat visually transitions from pulsing/pending to solid/confirmed with a success animation. |

### UI Redesign — Chrono/Time Clock Style

The entire HotDesk UI must be redesigned to match the Time Clock (Chrono) module's look and feel. This is the "command center" aesthetic from the Stitch design system.

| Element | Implementation |
|---------|---------------|
| **Design tokens** | Import and use `CHRONO_THEME` from `chrono/shared/theme.ts` — same colors, typography, radius, shadows. |
| **Wrapper class** | Use `.hd` namespace (analogous to `.ch` in Chrono). |
| **Sidebar** | Same nav-item style as Time Clock: surfaceHigh background on active, primary glow. IBM Plex Mono for labels. |
| **Cards** | Use `.ch-card` / `.ch-stat` patterns: surface background, ghost borders, top-edge accent line. |
| **Buttons** | Gradient CTAs (`.ch-btn-amber` for primary, `.ch-btn-green` for check-in, `.ch-btn-ghost` for secondary). |
| **Typography** | Inter for body, IBM Plex Mono for data/stats (seat counts, percentages). |
| **Stats bar** | Top stat cards showing Free/Occupied/Fixed/Mine counts — same layout as Time Clock's "Hours Today" / "This Week" cards. |
| **Check-in button** | Large, centered, gradient green with glow — same visual impact as "CLOCK IN" button. |
| **Badges** | Use `.ch-badge-*` classes for status indicators (green for confirmed, amber for pending, red for blocked). |
| **Animations** | `fade-in`, `pulse-ring`, `pulse-green` from Chrono CSS. |
| **DO NOT TOUCH** | The office blueprint SVG (OfficeSVG.tsx, BlueprintHDMap.tsx) — these keep their current rendering logic. Only the shell/chrome around them changes. |

### Out of Scope (v1)
- Push/email notifications for confirmation reminders
- Recurring delegations (only per-date for now)
- QR code check-in (button check-in only for now)

---

## Status: CONFIRMED — ready for development
