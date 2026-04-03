-- Add custom display name to user_preferences
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS display_name text;
