-- Add city field to buildings for HotDesk subtitle display
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS city text;

-- Add allowed booking zones to users (empty JSON array = all zones allowed)
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_booking_zones jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN buildings.city IS 'City where the building is located — shown in HotDesk header';
COMMENT ON COLUMN users.allowed_booking_zones IS 'JSON array of allowed zone configs. Empty = all zones allowed.';
