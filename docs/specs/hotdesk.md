# Spec — HotDesk

**Status:** Draft v1  
**Last updated:** 2026-03-11  
**Owner:** WorkSuite team

---

## 1. Domain Overview

The HotDesk module manages seat reservations in an office layout. Users can reserve available seats for specific dates, admins can assign fixed seats permanently, and the system prevents conflicts.

**Bounded context:** `HotDesk`  
**Key concepts:** Seat, SeatReservation, FixedAssignment, ReservationService

---

## 2. Entities & Value Objects

### Seat
| Field | Type | Notes |
|---|---|---|
| id | string | e.g. "A1", "B3" |
| zone | string | "A", "B", "C" |
| label | string | Display name |
| coordinates | {x, y} | SVG render position |

> **Note on the office map:** Seat coordinates are pure data (x/y in a 640×390 SVG viewport). To update the office layout, provide a new list of Seat objects with updated coordinates and zones. The render logic does not change — only the data.

### SeatReservation
| Field | Type | Rules |
|---|---|---|
| id | string | Generated |
| seatId | string | Must exist in seat list |
| userId | string | References User |
| date | string | YYYY-MM-DD |
| createdAt | string | ISO timestamp |

### FixedAssignment
| Field | Type | Notes |
|---|---|---|
| seatId | string | One fixed seat per person |
| userId | string | |
| userName | string | Display only |

---

## 3. Use Cases

### UC-HD-01: Make Reservation
**Actor:** Authenticated user  
**Input:** seatId, dates[] (multi-day support), userId  
**Flow:**
1. Load fixed assignments and existing reservations for date range
2. For each date: run `ReservationService.canReserve()`
3. Save valid ones, collect skipped with reason

**Acceptance tests:**
- ✅ Free weekday seat → reserved
- ✅ Weekend → skipped with reason
- ✅ Fixed seat → skipped with reason
- ✅ Seat taken by another → skipped with reason
- ✅ Own seat re-reserved → allowed (idempotent)
- ✅ Partial success: valid dates reserved, invalid skipped

### UC-HD-02: Release Reservation
**Actor:** Reservation owner or Admin  
**Acceptance tests:**
- ✅ Owner releases own reservation → deleted
- ✅ Non-owner → 403
- ✅ No reservation → 404

### UC-HD-03: Get Map State
**Actor:** Any authenticated user  
**Input:** date  
**Output:** All seats with their status (free/occupied/fixed) for that date

### UC-HD-04: Get Table View
**Actor:** Any authenticated user  
**Input:** year, month  
**Output:** All seats × all days of month with statuses

### UC-HD-05: Assign Fixed Seat (Admin only)
### UC-HD-06: Remove Fixed Seat (Admin only)

---

## 4. Business Rules

- **BR-HD-01:** No reservations on weekends (Saturday, Sunday)
- **BR-HD-02:** Fixed seats cannot be reserved by any user
- **BR-HD-03:** A seat can only be reserved by one user per day
- **BR-HD-04:** Users can only release their own reservations (admins can release any)
- **BR-HD-05:** Past reservations cannot be modified (enforce at API level)

---

## 5. Updating the Office Map

The SVG map is fully data-driven. To change the layout:

1. Update `docs/specs/hotdesk-map.md` with a description of the new layout
2. Provide the new seat list with coordinates
3. The `OfficeSVG` component re-renders automatically

No business logic changes are needed when the map changes.

---

## 6. Supabase Schema

```sql
create table seats (
  id      text primary key,
  zone    text not null,
  label   text not null,
  x       integer not null,
  y       integer not null
);

create table seat_reservations (
  id          text primary key,
  seat_id     text not null references seats(id),
  user_id     uuid not null references auth.users(id),
  user_name   text not null,
  date        date not null,
  created_at  timestamptz not null default now(),
  unique(seat_id, date)
);

create table fixed_assignments (
  seat_id   text primary key references seats(id),
  user_id   uuid not null references auth.users(id),
  user_name text not null
);

-- RLS
alter table seat_reservations enable row level security;
alter table fixed_assignments enable row level security;

create policy "users_see_all_reservations" on seat_reservations
  for select using (true);

create policy "users_own_reservations" on seat_reservations
  for insert with check (user_id = auth.uid());

create policy "users_delete_own" on seat_reservations
  for delete using (user_id = auth.uid());
```

---

## 7. Open Questions

- [ ] Should we send email/Slack notifications when a reservation is made?
- [ ] Auto-release policy: release at end of day if not checked in?
- [ ] How many days in advance can users book?
