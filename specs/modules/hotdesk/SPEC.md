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

### UI Changes

1. **HDMapView / HDTableView:** Show `pending` seats with a pulsing/dashed border. Show `confirmed` as solid. Show `blocked` with a distinct icon/overlay.
2. **HDReserveModal:** After reserving, show "Awaiting confirmation" state. Add "Confirm" button for today's pending reservations.
3. **Fixed Seat Card:** Add "Delegate" action with user picker + date picker.
4. **Admin Panel → HotDesk:** New config section with confirmation settings + blocked seat management.

### Out of Scope (v1)
- Push/email notifications for confirmation reminders
- Check-in via QR code or NFC
- Recurring delegations (only per-date for now)

---

## Status: DRAFT — awaiting user confirmation
