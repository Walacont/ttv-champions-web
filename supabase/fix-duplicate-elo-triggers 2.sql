-- =====================================================
-- Fix: Remove duplicate ELO calculation triggers
-- =====================================================
-- Problem: Both trigger_process_match_elo AND trigger_process_match_result
-- were calculating ELO, causing double calculation (800 -> 815 -> 825)
--
-- Solution: Drop trigger_process_match_result and update trigger_process_match_elo
-- to also handle wins/losses, XP, and season points
-- =====================================================

-- Drop the old trigger that causes double calculation
DROP TRIGGER IF EXISTS trigger_process_match_result ON matches;

-- Update process_match_elo to also handle wins/losses, XP, season points
CREATE OR REPLACE FUNCTION process_match_elo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_winner_current_elo INTEGER;
    v_loser_current_elo INTEGER;
    v_winner_highest_elo INTEGER;
    v_loser_highest_elo INTEGER;
    v_sport_key TEXT;
    v_elo_result RECORD;
    v_season_points INTEGER;
    v_xp_gain INTEGER;
BEGIN
    -- Only process if winner_id is set
    IF NEW.winner_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Check if already processed (either by elo_change or processed flag)
    IF NEW.elo_change IS NOT NULL OR NEW.processed = true THEN
        RETURN NEW;
    END IF;

    -- Get sport key (default to table-tennis)
    SELECT COALESCE(s.name, 'table-tennis') INTO v_sport_key
    FROM sports s WHERE s.id = NEW.sport_id;
    v_sport_key := COALESCE(v_sport_key, 'table-tennis');

    -- Get current ELO ratings
    SELECT elo_rating, highest_elo
    INTO v_winner_current_elo, v_winner_highest_elo
    FROM profiles WHERE id = NEW.winner_id;

    SELECT elo_rating, highest_elo
    INTO v_loser_current_elo, v_loser_highest_elo
    FROM profiles WHERE id = NEW.loser_id;

    -- Fallback to 800 if no ELO
    v_winner_current_elo := COALESCE(v_winner_current_elo, 800);
    v_loser_current_elo := COALESCE(v_loser_current_elo, 800);
    v_winner_highest_elo := COALESCE(v_winner_highest_elo, v_winner_current_elo);
    v_loser_highest_elo := COALESCE(v_loser_highest_elo, v_loser_current_elo);

    -- Calculate ELO with advanced system
    SELECT * INTO v_elo_result FROM calculate_elo_advanced(
        NEW.winner_id,
        NEW.loser_id,
        v_winner_current_elo,
        v_loser_current_elo,
        COALESCE(NEW.handicap_used, FALSE),
        v_sport_key
    );

    -- Calculate season points and XP
    IF COALESCE(NEW.handicap_used, false) THEN
        v_season_points := 8;  -- Fixed for handicap
        v_xp_gain := 0;
    ELSE
        v_season_points := ROUND(v_elo_result.winner_elo_change * 0.2);
        v_xp_gain := v_elo_result.winner_elo_change;
    END IF;

    -- Update match with ELO data
    NEW.player_a_elo_before := CASE
        WHEN NEW.winner_id = NEW.player_a_id THEN v_winner_current_elo
        ELSE v_loser_current_elo
    END;
    NEW.player_b_elo_before := CASE
        WHEN NEW.winner_id = NEW.player_b_id THEN v_winner_current_elo
        ELSE v_loser_current_elo
    END;
    NEW.player_a_elo_after := CASE
        WHEN NEW.winner_id = NEW.player_a_id THEN v_elo_result.new_winner_elo
        ELSE v_elo_result.new_loser_elo
    END;
    NEW.player_b_elo_after := CASE
        WHEN NEW.winner_id = NEW.player_b_id THEN v_elo_result.new_winner_elo
        ELSE v_elo_result.new_loser_elo
    END;
    NEW.elo_change := v_elo_result.winner_elo_change;
    NEW.winner_elo_change := v_elo_result.winner_elo_change;
    NEW.loser_elo_change := v_elo_result.loser_elo_change;
    NEW.season_points_awarded := v_season_points;
    NEW.processed := true;

    -- Update winner profile (ELO + wins + XP + points)
    UPDATE profiles
    SET
        elo_rating = v_elo_result.new_winner_elo,
        highest_elo = GREATEST(v_winner_highest_elo, v_elo_result.new_winner_elo),
        singles_matches_played = COALESCE(singles_matches_played, 0) + 1,
        wins = COALESCE(wins, 0) + 1,
        xp = COALESCE(xp, 0) + v_xp_gain,
        points = COALESCE(points, 0) + v_season_points,
        updated_at = NOW()
    WHERE id = NEW.winner_id;

    -- Update loser profile (ELO + losses)
    UPDATE profiles
    SET
        elo_rating = v_elo_result.new_loser_elo,
        singles_matches_played = COALESCE(singles_matches_played, 0) + 1,
        losses = COALESCE(losses, 0) + 1,
        updated_at = NOW()
    WHERE id = NEW.loser_id;

    RETURN NEW;
END;
$$;

-- Make sure only trigger_process_match_elo exists
DROP TRIGGER IF EXISTS trigger_process_match_elo ON matches;
CREATE TRIGGER trigger_process_match_elo
    BEFORE INSERT OR UPDATE ON matches
    FOR EACH ROW
    EXECUTE FUNCTION process_match_elo();

-- Verify
SELECT 'Fix applied! Only trigger_process_match_elo should remain:' as status;
SELECT tgname as trigger_name
FROM pg_trigger
WHERE tgrelid = 'matches'::regclass
AND tgname LIKE 'trigger_process_match%'
AND NOT tgisinternal;
