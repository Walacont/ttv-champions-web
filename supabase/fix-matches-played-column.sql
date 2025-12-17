-- Fix: Add matches_played column to profiles
-- This column is required by the ranking change trigger for tie-breaking
-- Error: column "matches_played" does not exist

-- ============================================
-- STEP 1: Add matches_played column to profiles
-- ============================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS matches_played INTEGER DEFAULT 0;

-- ============================================
-- STEP 2: Populate matches_played from existing matches
-- ============================================

-- Count all matches (as player A or player B) and update profiles
UPDATE profiles p
SET matches_played = (
    SELECT COUNT(*)
    FROM matches m
    WHERE m.player_a_id = p.id OR m.player_b_id = p.id
);

-- ============================================
-- STEP 3: Create trigger to update matches_played on new matches
-- ============================================

CREATE OR REPLACE FUNCTION update_matches_played()
RETURNS TRIGGER AS $$
BEGIN
    -- Increment matches_played for both players
    UPDATE profiles
    SET matches_played = COALESCE(matches_played, 0) + 1
    WHERE id IN (NEW.player_a_id, NEW.player_b_id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_matches_played ON matches;

-- Create trigger
CREATE TRIGGER trigger_update_matches_played
    AFTER INSERT ON matches
    FOR EACH ROW
    EXECUTE FUNCTION update_matches_played();

-- ============================================
-- STEP 4: Add index for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_matches_played ON profiles(matches_played);

-- ============================================
-- Verify
-- ============================================

DO $$
DECLARE
    col_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'matches_played'
    ) INTO col_exists;

    IF col_exists THEN
        RAISE NOTICE 'SUCCESS: matches_played column exists in profiles table';
    ELSE
        RAISE EXCEPTION 'FAILED: matches_played column was not created';
    END IF;
END $$;
