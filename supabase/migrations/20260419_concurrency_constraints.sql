-- ============================================================================
-- WorkSuite — Concurrency Control: Race-Condition Prevention
-- ============================================================================
-- Adds database-level constraints to prevent double-booking across three modules:
--   1. HotDesk: RPC function for atomic seat reservation (UNIQUE already exists)
--   2. Deploy Planner: UNIQUE constraint on (environment, planned_at)
--   3. Environments: Exclusion constraint on overlapping time ranges
-- ============================================================================

-- ── 1. HotDesk — Atomic reserve function ──────────────────────────────────
-- The UNIQUE(seat_id, date) constraint already exists on seat_reservations.
-- This RPC function wraps the INSERT so the client gets a clean true/false
-- instead of a raw Postgres error.

CREATE OR REPLACE FUNCTION reserve_seat(
  p_id        text,
  p_seat_id   text,
  p_user_id   uuid,
  p_user_name text,
  p_date      date,
  p_status    text DEFAULT 'pending'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO seat_reservations (id, seat_id, user_id, user_name, date, status)
  VALUES (p_id, p_seat_id, p_user_id, p_user_name, p_date, p_status);
  RETURN true;
EXCEPTION
  WHEN unique_violation THEN
    RETURN false;
END;
$$;

COMMENT ON FUNCTION reserve_seat IS
  'Atomically reserves a seat. Returns false if the seat is already booked for that date (unique_violation).';

-- Batch version for multi-date reservations
CREATE OR REPLACE FUNCTION reserve_seats_batch(
  p_rows jsonb -- Array of {id, seat_id, user_id, user_name, date, status}
)
RETURNS jsonb -- Array of {date, success}
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  row_item  jsonb;
  results   jsonb := '[]'::jsonb;
  success   boolean;
BEGIN
  FOR row_item IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    BEGIN
      INSERT INTO seat_reservations (id, seat_id, user_id, user_name, date, status)
      VALUES (
        row_item->>'id',
        row_item->>'seat_id',
        (row_item->>'user_id')::uuid,
        row_item->>'user_name',
        (row_item->>'date')::date,
        COALESCE(row_item->>'status', 'pending')
      );
      success := true;
    EXCEPTION
      WHEN unique_violation THEN
        success := false;
    END;
    results := results || jsonb_build_object(
      'date', row_item->>'date',
      'success', success
    );
  END LOOP;
  RETURN results;
END;
$$;

COMMENT ON FUNCTION reserve_seats_batch IS
  'Batch seat reservation. Each row is attempted independently. Returns per-date success/failure.';


-- ── 2. Deploy Planner — Prevent concurrent deployments ────────────────────
-- Two deployments to the same environment on the same planned date should not
-- be possible. Only active deployments count (not cancelled/completed ones).

-- First, add the constraint only for non-terminal statuses.
-- Since planned_at is a date string, we create a unique index with a WHERE clause.
CREATE UNIQUE INDEX IF NOT EXISTS idx_deployments_env_date_active
  ON deployments (environment, planned_at)
  WHERE status NOT IN ('deployed', 'cancelled', 'failed');

COMMENT ON INDEX idx_deployments_env_date_active IS
  'Prevents two active deployments to the same environment on the same planned date.';


-- ── 3. Environments — Prevent overlapping reservations ────────────────────
-- We need btree_gist to combine equality (=) and range overlap (&&) in an
-- exclusion constraint.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Add exclusion constraint: no two active reservations can overlap on the
-- same environment.
-- NOTE: syn_reservations uses status_id (FK to syn_reservation_statuses).
-- We cannot reference another table in a WHERE clause of an exclusion
-- constraint, so we use a trigger-based approach instead.

CREATE OR REPLACE FUNCTION check_reservation_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  active_categories text[] := ARRAY['reserved', 'in_use', 'violation'];
  new_status_category text;
  conflict_id text;
BEGIN
  -- Get the category of the new reservation's status
  SELECT status_category INTO new_status_category
  FROM syn_reservation_statuses
  WHERE id = NEW.status_id;

  -- Only check overlap for active statuses
  IF new_status_category = ANY(active_categories) THEN
    SELECT r.id INTO conflict_id
    FROM syn_reservations r
    JOIN syn_reservation_statuses s ON s.id = r.status_id
    WHERE r.environment_id = NEW.environment_id
      AND r.id != COALESCE(NEW.id, '')
      AND s.status_category = ANY(active_categories)
      AND r.planned_start < NEW.planned_end
      AND r.planned_end > NEW.planned_start
    LIMIT 1;

    IF conflict_id IS NOT NULL THEN
      RAISE EXCEPTION 'Overlapping reservation exists (id: %)', conflict_id
        USING ERRCODE = '23505'; -- unique_violation code for consistent handling
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Apply trigger on INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_check_reservation_overlap ON syn_reservations;

CREATE TRIGGER trg_check_reservation_overlap
  BEFORE INSERT OR UPDATE ON syn_reservations
  FOR EACH ROW
  EXECUTE FUNCTION check_reservation_overlap();

COMMENT ON FUNCTION check_reservation_overlap IS
  'Prevents overlapping active reservations on the same environment. Raises 23505 on conflict.';
COMMENT ON TRIGGER trg_check_reservation_overlap ON syn_reservations IS
  'Fires before INSERT/UPDATE to enforce no-overlap rule for active reservations.';
