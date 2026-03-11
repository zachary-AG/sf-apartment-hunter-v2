ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS work_address text,
  ADD COLUMN IF NOT EXISTS work_lat numeric,
  ADD COLUMN IF NOT EXISTS work_lng numeric,
  ADD COLUMN IF NOT EXISTS commute_mode text NOT NULL DEFAULT 'transit'
    CHECK (commute_mode IN ('transit', 'walking'));
