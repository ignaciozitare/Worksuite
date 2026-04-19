# Concurrency Control — SPEC

## Feature: Race-Condition Prevention for Reservations & Bookings

### Context

WorkSuite has three modules that allow users to reserve shared resources:

| Module | Resource | Current Protection |
|--------|----------|--------------------|
| **HotDesk** | Office seats (1 seat per date) | `UNIQUE(seat_id, date)` constraint exists, but code uses `UPSERT` which silently overwrites on conflict instead of failing |
| **Deploy Planner** | Deployments to environments | No database constraint — two users can create concurrent deployments to the same environment |
| **Environments** | Environment time-slot reservations | Application-level overlap check in `UpsertReservation.validate()`, but uses `UPSERT` which can silently overwrite; no DB-level exclusion constraint |

All three modules share the same vulnerability pattern: **the application checks availability, then inserts — but between the check and the insert, another user can claim the same resource (TOCTOU race condition).**

### Problem Statement

When two users simultaneously attempt to reserve the same resource:

1. **HotDesk**: Both see seat A1 as free → both click "Reserve" → `UPSERT` makes the second user silently overwrite the first user's reservation. First user's booking disappears without notice.

2. **Deploy Planner**: Both see production as idle → both create a deployment → both succeed. Two concurrent deployments to the same environment (should be impossible).

3. **Environments**: Both see ENV-DEV-01 as free → both pass the `validate()` overlap check → `UPSERT` lets the second overwrite the first, or both inserts succeed for overlapping time ranges.

### Solution Strategy

**Database as the single source of truth for conflict detection.** The DB constraint is the last line of defense — it MUST reject invalid state regardless of what the application does. The application layer then handles the rejection gracefully.

The approach for all three modules follows the same pattern:

```
1. DB constraint prevents invalid state (UNIQUE / EXCLUSION)
2. Application uses INSERT (not UPSERT) so conflicts raise errors
3. Catch the constraint-violation error (Postgres code 23505)
4. Show user-friendly message + auto-refresh the UI
```

### Requirements

#### 1. HotDesk — Fix Silent Overwrite

**Database (already has UNIQUE, no migration needed for constraint):**
- `UNIQUE(seat_id, date)` already exists on `seat_reservations` — this is correct.
- Add an RPC function `reserve_seat()` that wraps the INSERT and returns success/failure cleanly.

**Application changes:**
- Replace `upsertReservations()` (which uses Supabase `.upsert()`) with `insertReservations()` (which uses `.insert()`).
- On conflict error (23505), the function must throw a typed `SeatConflictError`.
- The `useHotDesk` hook catches `SeatConflictError`, shows a translated toast ("This seat was just booked by someone else"), rolls back the optimistic update, and re-fetches reservations.

**Port change:**
- Rename `upsertReservations` → `insertReservations` in `SeatReservationPort`.
- Add return type that indicates which dates succeeded and which conflicted.

| Before | After |
|--------|-------|
| `upsertReservations(rows)` — silent overwrite | `insertReservations(rows)` — throws on conflict |
| Error: `console.error('Reserve failed:', err)` | Error: toast + rollback optimistic state + re-fetch |

#### 2. Deploy Planner — Add Environment Lock

**Database:**
- Add `UNIQUE(environment, planned_at)` constraint on `deployments` table — prevents two deployments to the same environment on the same planned date.
- Alternative: if deployments can span time ranges, use a CHECK or application-level validation (our deployments use a single `planned_at` date, so UNIQUE is sufficient).

**Application changes:**
- In `SupabaseDeploymentRepository.save()`, the existing `.insert()` is already correct (not upsert).
- Add error handling: catch Postgres 23505 and throw `DeployConflictError`.
- The UI must catch `DeployConflictError`, show a translated message ("Another deployment is already planned for this environment on this date"), and refresh the deployment list.

#### 3. Environments — Add Exclusion Constraint + Fix Upsert

**Database:**
- Add a PostgreSQL exclusion constraint on `syn_reservations` to prevent overlapping time ranges for the same environment (only for active statuses):

```sql
-- Requires btree_gist extension
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE syn_reservations
ADD CONSTRAINT no_overlapping_reservations
EXCLUDE USING GIST (
  environment_id WITH =,
  tstzrange(planned_start::timestamptz, planned_end::timestamptz, '[]') WITH &&
) WHERE (status_id IN (
  SELECT id FROM syn_reservation_statuses
  WHERE status_category IN ('reserved', 'in_use', 'violation')
));
```

Note: If the exclusion constraint with subquery is not supported, use a trigger-based approach or a simpler UNIQUE constraint on `(environment_id, planned_start)`.

**Application changes:**
- Replace `upsert()` with `insert()` in `SupabaseReservationRepo` for new reservations.
- Keep `upsert()` only for updating existing reservations (where `id` is already set).
- Catch constraint violations and throw `EnvironmentConflictError`.
- The `UpsertReservation` use case already validates overlaps — this is good as a fast feedback path, but the DB constraint is the authoritative guard.

#### 4. Shared Error Handling Pattern

All three modules follow the same pattern:

```typescript
// Domain error (in each module's domain/entities/)
export class ConflictError extends Error {
  constructor(public readonly resource: string, public readonly detail: string) {
    super(`Conflict: ${resource} — ${detail}`);
    this.name = 'ConflictError';
  }
}

// Infra adapter (catch Postgres 23505)
async insertReservations(rows: Row[]): Promise<void> {
  const { error } = await this.db.from('table').insert(rows);
  if (error) {
    if (error.code === '23505') {
      throw new ConflictError('seat', error.message);
    }
    throw error;
  }
}

// UI hook (catch and handle)
try {
  await repo.insertReservations(rows);
} catch (err) {
  if (err instanceof ConflictError) {
    notify(t('common.conflictError'));
    await refreshData();  // Re-fetch current state from DB
    return;
  }
  throw err;
}
```

#### 5. i18n Keys

New translation keys needed:

| Key | EN | ES |
|-----|----|----|
| `common.conflictError` | "This resource was just reserved by someone else. The view has been refreshed." | "Este recurso acaba de ser reservado por otra persona. La vista se ha actualizado." |
| `hotdesk.seatConflict` | "This seat was just booked by someone else" | "Este puesto acaba de ser reservado por otra persona" |
| `deployPlanner.deployConflict` | "Another deployment is already planned for this environment on this date" | "Ya hay otro despliegue planificado para este entorno en esta fecha" |
| `environments.reservationConflict` | "This environment already has a reservation for the selected time range" | "Este entorno ya tiene una reserva para el rango horario seleccionado" |

### Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/20260419_concurrency_constraints.sql` | DB constraints + RPC functions |
| `apps/web/src/shared/domain/errors/ConflictError.ts` | Shared typed error |

### Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/modules/hotdesk/domain/ports/SeatReservationPort.ts` | Rename `upsertReservations` → `insertReservations` |
| `apps/web/src/modules/hotdesk/infra/SupabaseSeatReservationRepo.ts` | Use `.insert()` instead of `.upsert()`, catch 23505 |
| `apps/web/src/shared/hooks/useHotDesk.ts` | Catch `ConflictError`, rollback optimistic update, re-fetch, toast |
| `apps/web/src/modules/deploy-planner/infra/SupabaseDeploymentRepository.ts` | Catch 23505 on `.save()` |
| `apps/web/src/modules/environments/infra/supabase/SupabaseReservationRepo.ts` | Split `upsert()` into `insert()` for new + `update()` for existing, catch 23505 |
| `apps/web/src/modules/environments/domain/ports/IReservationRepo.ts` | Add `insert()` method alongside existing `upsert()` |
| `apps/web/src/modules/environments/domain/useCases/UpsertReservation.ts` | Use `insert()` for new reservations |
| `packages/i18n/locales/en.json` | Add conflict error keys |
| `packages/i18n/locales/es.json` | Add conflict error keys |

### Out of Scope (v1)

- `SELECT ... FOR UPDATE` (pessimistic locking) — overkill for our user volume
- Redis distributed locks — unnecessary for <100 concurrent users
- WebSocket real-time seat status — can be added later
- Idempotency keys — good practice but not critical at our scale
- PostgreSQL advisory locks — reserved for if we see actual contention

### Technical Notes

- **Why not keep UPSERT?** Because `UPSERT` with `onConflict` converts the conflict into an UPDATE, silently overwriting the first user's data. This is correct for "last-write-wins" scenarios (e.g., saving user preferences) but **wrong for reservations** where the first-come-first-served rule must apply.
- **Why DB constraints over application checks alone?** Application checks have a time-of-check-to-time-of-use (TOCTOU) window. Between reading "seat is free" and writing the reservation, another request can slip in. The DB constraint is atomic and immune to this race.
- **Postgres error code 23505** = `unique_violation`. This is the standard code for UNIQUE and EXCLUSION constraint violations.

---

## Status: CONFIRMED — ready for development
