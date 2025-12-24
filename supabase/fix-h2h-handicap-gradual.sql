-- =========================================
-- FIX: H2H Handicap Gradual Reduction
-- =========================================
-- Problem: When underdog wins, handicap was reset to 0
-- Fix: Reduce handicap by 1 instead of resetting
--
-- Example for Table Tennis:
-- - 4 wins in a row = handicap 3
-- - Underdog wins = handicap becomes 2 (not 0!)
-- - Underdog wins again = handicap becomes 1
-- - Underdog wins again = handicap becomes 0
-- =========================================

-- Update the function to use gradual reduction
CREATE OR REPLACE FUNCTION update_head_to_head_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    h2h_id UUID;
    prev_last_winner UUID;
    prev_consecutive INTEGER;
    prev_handicap INTEGER;
    new_consecutive INTEGER;
    new_handicap INTEGER;
    sport_handicap_cap INTEGER;
    match_sport_key TEXT;
BEGIN
    -- Get or create h2h record
    h2h_id := get_or_create_h2h_stats(NEW.winner_id, NEW.loser_id);

    -- Get previous state
    SELECT last_winner_id, consecutive_wins, suggested_handicap
    INTO prev_last_winner, prev_consecutive, prev_handicap
    FROM head_to_head_stats WHERE id = h2h_id;

    prev_consecutive := COALESCE(prev_consecutive, 0);
    prev_handicap := COALESCE(prev_handicap, 0);

    -- Get sport-specific handicap cap from the match
    -- Default to 7 (table tennis) if not found
    BEGIN
        SELECT COALESCE(esc.handicap_cap, 7)
        INTO sport_handicap_cap
        FROM sports s
        LEFT JOIN elo_sport_config esc ON esc.sport_key = LOWER(REPLACE(s.name, ' ', '-'))
        WHERE s.id = NEW.sport_id;

        IF sport_handicap_cap IS NULL THEN
            sport_handicap_cap := 7; -- Default for table tennis
        END IF;
    EXCEPTION WHEN OTHERS THEN
        sport_handicap_cap := 7;
    END;

    -- Check if same player won again (continuing streak) or new winner
    IF prev_last_winner IS NULL OR prev_last_winner = NEW.winner_id THEN
        -- Same winner or first match - increment streak
        new_consecutive := prev_consecutive + 1;

        -- Increase handicap: starts after 2 wins
        -- 2 wins = 1, 3 wins = 2, 4 wins = 3, etc. (capped by sport)
        IF new_consecutive >= 2 THEN
            new_handicap := LEAST(new_consecutive - 1, sport_handicap_cap);
        ELSE
            new_handicap := 0;
        END IF;
    ELSE
        -- DIFFERENT WINNER - underdog won!
        -- GRADUAL adjustment: decrease handicap by 1 instead of resetting to 0
        -- Example: 4 wins (handicap 3) -> underdog wins -> handicap becomes 2
        new_consecutive := 1;
        new_handicap := GREATEST(0, prev_handicap - 1);
    END IF;

    -- Update the h2h stats
    UPDATE head_to_head_stats SET
        last_winner_id = NEW.winner_id,
        consecutive_wins = new_consecutive,
        current_streak_winner_id = CASE WHEN new_consecutive >= 2 THEN NEW.winner_id ELSE NULL END,
        suggested_handicap = new_handicap,
        player_a_wins = CASE WHEN NEW.winner_id = player_a_id THEN player_a_wins + 1 ELSE player_a_wins END,
        player_b_wins = CASE WHEN NEW.winner_id = player_b_id THEN player_b_wins + 1 ELSE player_b_wins END,
        total_matches = total_matches + 1,
        last_match_at = NOW(),
        updated_at = NOW()
    WHERE id = h2h_id;

    RETURN NEW;
END;
$$;

-- Verification
DO $$
BEGIN
    RAISE NOTICE 'H2H Handicap Fix Applied:';
    RAISE NOTICE '- Gradual reduction: handicap decreases by 1 when underdog wins';
    RAISE NOTICE '- Sport-specific caps: TT=7, Badminton=12, Tennis/Padel=3';
    RAISE NOTICE '- Example: 4 wins (handicap 3) -> underdog wins -> handicap 2';
END $$;
