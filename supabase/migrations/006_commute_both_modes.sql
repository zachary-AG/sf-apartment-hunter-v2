ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS commute_minutes_transit integer,
  ADD COLUMN IF NOT EXISTS commute_minutes_walking integer;

-- Remove old single-mode columns (safe to drop after migration confirmed working)
ALTER TABLE listings
  DROP COLUMN IF EXISTS commute_minutes,
  DROP COLUMN IF EXISTS commute_mode;
