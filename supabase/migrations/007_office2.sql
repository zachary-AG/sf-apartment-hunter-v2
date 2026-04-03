-- Add second office location to user_preferences
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS work_address2 text,
  ADD COLUMN IF NOT EXISTS work_lat2 double precision,
  ADD COLUMN IF NOT EXISTS work_lng2 double precision;

-- Add second office commute times to listings
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS commute2_minutes_transit integer,
  ADD COLUMN IF NOT EXISTS commute2_minutes_walking integer;
