ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS commute_minutes integer,
  ADD COLUMN IF NOT EXISTS commute_mode text;
