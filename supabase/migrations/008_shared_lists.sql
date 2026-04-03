-- 008_shared_lists.sql
-- Transition from single-user to collaborative shared lists.
-- Creates lists, list_members, listing_commutes tables.
-- Migrates existing data, then drops old commute + office2 columns.

-- ─── 1. Create new tables ────────────────────────────────────────────────────

CREATE TABLE lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by text NOT NULL,
  invite_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER lists_updated_at BEFORE UPDATE ON lists
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on lists" ON lists FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE list_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_id, user_id)
);

ALTER TABLE list_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on list_members" ON list_members FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE listing_commutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  display_name text NOT NULL,
  minutes_transit integer,
  minutes_walking integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, user_id)
);

CREATE TRIGGER listing_commutes_updated_at BEFORE UPDATE ON listing_commutes
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

ALTER TABLE listing_commutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on listing_commutes" ON listing_commutes FOR ALL USING (true) WITH CHECK (true);

-- ─── 2. Add new columns to listings ──────────────────────────────────────────

ALTER TABLE listings ADD COLUMN list_id uuid REFERENCES lists(id) ON DELETE CASCADE;
ALTER TABLE listings ADD COLUMN added_by_name text;

-- ─── 3. Backfill: create a default list per user, migrate listings ───────────

-- For each distinct user_id in listings, create a "My Listings" list and add them as owner.
-- Uses substring of md5 as a simple random invite code.
DO $$
DECLARE
  r RECORD;
  new_list_id uuid;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM listings LOOP
    INSERT INTO lists (name, created_by, invite_code)
    VALUES ('My Listings', r.user_id, substring(md5(random()::text || r.user_id) from 1 for 12))
    RETURNING id INTO new_list_id;

    INSERT INTO list_members (list_id, user_id, display_name, role)
    VALUES (new_list_id, r.user_id, r.user_id, 'owner');

    UPDATE listings
    SET list_id = new_list_id, added_by_name = r.user_id
    WHERE user_id = r.user_id;
  END LOOP;
END $$;

-- Also create default lists for users who have preferences but no listings
DO $$
DECLARE
  r RECORD;
  new_list_id uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT up.user_id
    FROM user_preferences up
    LEFT JOIN list_members lm ON lm.user_id = up.user_id
    WHERE lm.id IS NULL
  LOOP
    INSERT INTO lists (name, created_by, invite_code)
    VALUES ('My Listings', r.user_id, substring(md5(random()::text || r.user_id || 'pref') from 1 for 12))
    RETURNING id INTO new_list_id;

    INSERT INTO list_members (list_id, user_id, display_name, role)
    VALUES (new_list_id, r.user_id, r.user_id, 'owner');
  END LOOP;
END $$;

-- ─── 4. Migrate commute data to listing_commutes ────────────────────────────

INSERT INTO listing_commutes (listing_id, user_id, display_name, minutes_transit, minutes_walking)
SELECT id, user_id, user_id, commute_minutes_transit, commute_minutes_walking
FROM listings
WHERE commute_minutes_transit IS NOT NULL OR commute_minutes_walking IS NOT NULL;

-- ─── 5. Make list_id NOT NULL now that backfill is done ──────────────────────

ALTER TABLE listings ALTER COLUMN list_id SET NOT NULL;

-- ─── 6. Drop old columns ────────────────────────────────────────────────────

ALTER TABLE listings DROP COLUMN IF EXISTS commute_minutes_transit;
ALTER TABLE listings DROP COLUMN IF EXISTS commute_minutes_walking;
ALTER TABLE listings DROP COLUMN IF EXISTS commute2_minutes_transit;
ALTER TABLE listings DROP COLUMN IF EXISTS commute2_minutes_walking;

ALTER TABLE user_preferences DROP COLUMN IF EXISTS work_address2;
ALTER TABLE user_preferences DROP COLUMN IF EXISTS work_lat2;
ALTER TABLE user_preferences DROP COLUMN IF EXISTS work_lng2;
