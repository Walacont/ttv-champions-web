-- ============================================
-- Guardian-Player Separation: Dual Role System
-- ============================================
-- This migration adds support for:
-- 1. is_player field to distinguish pure guardians from player-guardians
-- 2. Pure guardians only see guardian-dashboard
-- 3. Players who are also guardians can switch between views
-- 4. Guardians can "upgrade" to become players
-- ============================================

-- ============================================
-- PART 1: Add is_player field to profiles
-- ============================================

-- Add is_player field (default false for existing guardians, true for players)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_player BOOLEAN DEFAULT false;

-- ============================================
-- PART 2: Backfill existing data
-- ============================================

-- Set is_player = true for all existing players (non-guardian accounts)
UPDATE profiles
SET is_player = true
WHERE account_type = 'standard'
   OR account_type IS NULL
   OR (account_type != 'guardian' AND account_type != 'child');

-- Set is_player = true for existing guardians who have player stats (elo > 800 or matches played)
-- These are guardians who were also playing
UPDATE profiles
SET is_player = true
WHERE (account_type = 'guardian' OR is_guardian = true)
  AND (
    elo_rating > 800
    OR xp > 0
    OR points > 0
    OR EXISTS (
      SELECT 1 FROM matches
      WHERE player_a_id = profiles.id OR player_b_id = profiles.id
    )
  );

-- Set is_player = false for pure guardians (no activity)
UPDATE profiles
SET is_player = false
WHERE (account_type = 'guardian' OR is_guardian = true)
  AND elo_rating = 800
  AND xp = 0
  AND points = 0
  AND NOT EXISTS (
    SELECT 1 FROM matches
    WHERE player_a_id = profiles.id OR player_b_id = profiles.id
  );

-- Children are always players
UPDATE profiles
SET is_player = true
WHERE account_type = 'child';

-- ============================================
-- PART 3: Function to upgrade guardian to player
-- ============================================

CREATE OR REPLACE FUNCTION upgrade_guardian_to_player()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_profile RECORD;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Get current profile
    SELECT * INTO v_profile
    FROM profiles
    WHERE id = v_user_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Profile not found');
    END IF;

    -- Check if already a player
    IF v_profile.is_player = true THEN
        RETURN json_build_object('success', false, 'error', 'Already a player');
    END IF;

    -- Check if is a guardian
    IF v_profile.account_type != 'guardian' AND v_profile.is_guardian != true THEN
        RETURN json_build_object('success', false, 'error', 'Not a guardian');
    END IF;

    -- Upgrade to player
    UPDATE profiles
    SET
        is_player = true,
        elo_rating = COALESCE(elo_rating, 800),
        highest_elo = COALESCE(highest_elo, 800),
        xp = COALESCE(xp, 0),
        points = COALESCE(points, 0),
        updated_at = now()
    WHERE id = v_user_id;

    RETURN json_build_object(
        'success', true,
        'message', 'Successfully upgraded to player'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION upgrade_guardian_to_player TO authenticated;

-- ============================================
-- PART 4: Verification Queries
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Guardian-Player Separation Migration Complete!';
    RAISE NOTICE 'Added: is_player column to profiles';
    RAISE NOTICE 'Created: upgrade_guardian_to_player() function';
END $$;
