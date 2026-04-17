-- ============================================================================
-- WorkSuite — HotDesk: Booking Confirmation + Delegation + Blocked Seats
-- ============================================================================
-- Adds:
--   1. Booking confirmation workflow (pending → confirmed → released)
--   2. Delegation support for fixed-seat owners
--   3. Blocked seats flag
--   4. Global hotdesk configuration table
-- ============================================================================

-- ── 1. Add confirmation fields to seat_reservations ────────────────────────
ALTER TABLE seat_reservations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'released')),
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS delegated_by uuid REFERENCES users(id);

COMMENT ON COLUMN seat_reservations.status IS 'pending = awaiting confirmation, confirmed = active, released = auto-released';
COMMENT ON COLUMN seat_reservations.delegated_by IS 'If set, the fixed-seat owner who delegated this seat';

-- Index for auto-release cron query (find unconfirmed reservations)
CREATE INDEX IF NOT EXISTS idx_reservations_pending
  ON seat_reservations(status, date)
  WHERE status = 'pending';

-- ── 2. Add blocked flag to seats ───────────────────────────────────────────
ALTER TABLE seats
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_reason text;

COMMENT ON COLUMN seats.is_blocked IS 'Blocked seats cannot be reserved by anyone';
COMMENT ON COLUMN seats.blocked_reason IS 'Optional reason displayed in the UI';

-- ── 3. HotDesk configuration table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotdesk_config (
  id text PRIMARY KEY DEFAULT 'default',
  confirmation_enabled boolean NOT NULL DEFAULT true,
  confirmation_deadline_minutes integer NOT NULL DEFAULT 30,
  business_day_start time NOT NULL DEFAULT '09:00',
  auto_release_enabled boolean NOT NULL DEFAULT true,
  exempt_roles text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default config row
INSERT INTO hotdesk_config (id) VALUES ('default')
  ON CONFLICT (id) DO NOTHING;

-- RLS for hotdesk_config
ALTER TABLE hotdesk_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY hotdesk_config_read ON hotdesk_config
  FOR SELECT USING (true);

CREATE POLICY hotdesk_config_admin_write ON hotdesk_config
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  );

-- ── 4. Edge Function for auto-release (placeholder SQL, logic in code) ────
-- The auto-release can be triggered by:
--   a) A Supabase scheduled function (pg_cron)
--   b) A Vercel cron endpoint
-- This SQL creates the DB function that the cron will call.

CREATE OR REPLACE FUNCTION hotdesk_auto_release()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cfg record;
  deadline timestamptz;
  released_count integer;
BEGIN
  -- Load config
  SELECT * INTO cfg FROM hotdesk_config WHERE id = 'default';

  -- If auto-release is disabled, do nothing
  IF NOT cfg.auto_release_enabled OR NOT cfg.confirmation_enabled THEN
    RETURN 0;
  END IF;

  -- Calculate deadline: today's business_day_start + confirmation_deadline_minutes
  deadline := (CURRENT_DATE + cfg.business_day_start)
              + (cfg.confirmation_deadline_minutes || ' minutes')::interval;

  -- Only release if we're past the deadline
  IF now() < deadline THEN
    RETURN 0;
  END IF;

  -- Release unconfirmed reservations for today
  UPDATE seat_reservations
  SET status = 'released'
  WHERE date = CURRENT_DATE
    AND status = 'pending';

  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$;

COMMENT ON FUNCTION hotdesk_auto_release IS 'Auto-releases unconfirmed reservations past the confirmation deadline. Called by cron.';
