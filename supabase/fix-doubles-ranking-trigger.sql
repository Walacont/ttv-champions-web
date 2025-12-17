-- ============================================
-- FIX: Doubles Ranking Trigger
-- ============================================
-- Problem: The original trigger watches profiles.doubles_elo_rating,
-- but that column is no longer updated (Elo is now on doubles_pairings).
--
-- Solution: When a pairing's Elo changes, update both players'
-- doubles_elo_rating to their BEST pairing's Elo. This will trigger
-- the existing ranking change events.
-- ============================================

-- ============================================
-- FUNCTION: Update player's doubles Elo to their best pairing
-- ============================================

CREATE OR REPLACE FUNCTION update_player_doubles_elo(p_player_id UUID)
RETURNS VOID AS $$
DECLARE
    v_best_elo INT;
    v_total_matches INT;
BEGIN
    -- Find the player's best pairing Elo
    SELECT
        COALESCE(MAX(current_elo_rating), 800),
        COALESCE(SUM(matches_played), 0)
    INTO v_best_elo, v_total_matches
    FROM doubles_pairings
    WHERE player1_id = p_player_id OR player2_id = p_player_id;

    -- Update the player's profile
    UPDATE profiles
    SET
        doubles_elo_rating = v_best_elo,
        doubles_matches_played = v_total_matches
    WHERE id = p_player_id
      AND (doubles_elo_rating IS DISTINCT FROM v_best_elo
           OR doubles_matches_played IS DISTINCT FROM v_total_matches);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER FUNCTION: Sync pairing Elo to player profiles
-- ============================================

CREATE OR REPLACE FUNCTION sync_doubles_pairing_elo_to_profiles()
RETURNS TRIGGER AS $$
BEGIN
    -- When a pairing's Elo changes, update both players' profile
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Update player 1
        PERFORM update_player_doubles_elo(NEW.player1_id);
        -- Update player 2
        PERFORM update_player_doubles_elo(NEW.player2_id);
    END IF;

    -- For updates where players change (rare), also update old players
    IF TG_OP = 'UPDATE' THEN
        IF OLD.player1_id IS DISTINCT FROM NEW.player1_id THEN
            PERFORM update_player_doubles_elo(OLD.player1_id);
        END IF;
        IF OLD.player2_id IS DISTINCT FROM NEW.player2_id THEN
            PERFORM update_player_doubles_elo(OLD.player2_id);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- CREATE TRIGGER on doubles_pairings
-- ============================================

DROP TRIGGER IF EXISTS trigger_sync_doubles_elo_to_profiles ON doubles_pairings;
CREATE TRIGGER trigger_sync_doubles_elo_to_profiles
    AFTER INSERT OR UPDATE OF current_elo_rating, matches_played ON doubles_pairings
    FOR EACH ROW
    EXECUTE FUNCTION sync_doubles_pairing_elo_to_profiles();

-- ============================================
-- ENSURE profiles has doubles_matches_played column
-- ============================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS doubles_matches_played INTEGER DEFAULT 0;

-- ============================================
-- INITIALIZE: Update all existing players' doubles Elo
-- ============================================
-- This will sync current pairing Elos to profiles and trigger ranking events
-- Only for real users (not offline players)

DO $$
DECLARE
    player_record RECORD;
BEGIN
    -- Get all unique players from pairings that are NOT offline
    FOR player_record IN
        SELECT DISTINCT all_players.player_id
        FROM (
            SELECT player1_id AS player_id FROM doubles_pairings
            UNION
            SELECT player2_id AS player_id FROM doubles_pairings
        ) AS all_players
        INNER JOIN profiles p ON p.id = all_players.player_id
        WHERE p.is_offline IS NOT TRUE
          AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = all_players.player_id)
    LOOP
        PERFORM update_player_doubles_elo(player_record.player_id);
    END LOOP;
END $$;

-- ============================================
-- VERIFY: Check the sync worked
-- ============================================
-- Run this to verify:
-- SELECT p.display_name, p.doubles_elo_rating, p.doubles_matches_played,
--        (SELECT MAX(current_elo_rating) FROM doubles_pairings dp
--         WHERE dp.player1_id = p.id OR dp.player2_id = p.id) as best_pairing_elo
-- FROM profiles p
-- WHERE p.doubles_elo_rating IS NOT NULL AND p.doubles_elo_rating > 800
-- ORDER BY p.doubles_elo_rating DESC;
