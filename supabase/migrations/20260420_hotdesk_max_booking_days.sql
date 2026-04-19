-- ============================================================================
-- WorkSuite — HotDesk: Add max_booking_days config field
-- ============================================================================
-- Adds max_booking_days column to hotdesk_config (default 14 days).
-- Controls how far in advance users can book a seat.
-- ============================================================================

ALTER TABLE hotdesk_config
  ADD COLUMN IF NOT EXISTS max_booking_days integer NOT NULL DEFAULT 14;

COMMENT ON COLUMN hotdesk_config.max_booking_days IS 'Maximum number of days ahead a user can book a seat';
