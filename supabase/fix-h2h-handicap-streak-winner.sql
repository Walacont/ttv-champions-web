-- =========================================
-- FIX: H2H Handicap Complete Logic Rewrite
-- =========================================
-- Problems fixed:
-- 1. When underdog wins, current_streak_winner_id was set to NULL
--    even though handicap was only reduced (not reset to 0)
-- 2. When original streak winner wins again after underdog won,
--    handicap was incorrectly reduced instead of increased
--
-- New Logic:
-- - If there's an active handicap (streak_winner exists and handicap > 0):
--   - If streak_winner wins again: INCREASE handicap (+1)
--   - If other player (underdog) wins: DECREASE handicap (-1)
-- - If no active handicap:
--   - Track consecutive wins normally
--   - After 2 consecutive wins, set handicap = wins - 1
--
-- Example:
-- - A wins 5x in a row = handicap 4, streak_winner = A
-- - B wins = handicap 3, streak_winner = A (preserved!)
-- - A wins = handicap 4, streak_winner = A (increased!)
-- - B wins = handicap 3, streak_winner = A
-- - B wins = handicap 2, streak_winner = A
-- - B wins = handicap 1, streak_winner = A
-- - B wins = handicap 0, streak_winner = NULL
-- =========================================

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
    prev_streak_winner UUID;
    new_consecutive INTEGER;
    new_handicap INTEGER;
    new_streak_winner UUID;
    sport_handicap_cap INTEGER;
BEGIN
    -- Get or create h2h record
    h2h_id := get_or_create_h2h_stats(NEW.winner_id, NEW.loser_id);

    -- Get previous state (including current_streak_winner_id!)
    SELECT last_winner_id, consecutive_wins, suggested_handicap, current_streak_winner_id
    INTO prev_last_winner, prev_consecutive, prev_handicap, prev_streak_winner
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

    -- Check if there's an active handicap situation
    IF prev_streak_winner IS NOT NULL AND prev_handicap > 0 THEN
        -- ACTIVE HANDICAP MODE: Someone has a streak with handicap
        IF NEW.winner_id = prev_streak_winner THEN
            -- Streak winner (favorite) wins again -> INCREASE handicap
            new_consecutive := prev_consecutive + 1;
            new_handicap := LEAST(prev_handicap + 1, sport_handicap_cap);
            new_streak_winner := prev_streak_winner;
        ELSE
            -- Underdog wins -> DECREASE handicap by 1
            new_consecutive := 1;
            new_handicap := prev_handicap - 1;

            IF new_handicap > 0 THEN
                -- Still has handicap, keep streak winner
                new_streak_winner := prev_streak_winner;
            ELSE
                -- Handicap is now 0, reset streak winner
                new_streak_winner := NULL;
            END IF;
        END IF;
    ELSE
        -- NO ACTIVE HANDICAP: Normal streak tracking
        IF prev_last_winner IS NULL OR prev_last_winner = NEW.winner_id THEN
            -- Same winner or first match - increment streak
            new_consecutive := prev_consecutive + 1;

            -- Handicap starts after 2 consecutive wins
            -- 2 wins = 1, 3 wins = 2, 4 wins = 3, etc. (capped by sport)
            IF new_consecutive >= 2 THEN
                new_handicap := LEAST(new_consecutive - 1, sport_handicap_cap);
                new_streak_winner := NEW.winner_id;
            ELSE
                new_handicap := 0;
                new_streak_winner := NULL;
            END IF;
        ELSE
            -- Different winner, reset streak
            new_consecutive := 1;
            new_handicap := 0;
            new_streak_winner := NULL;
        END IF;
    END IF;

    -- Update the h2h stats
    UPDATE head_to_head_stats SET
        last_winner_id = NEW.winner_id,
        consecutive_wins = new_consecutive,
        current_streak_winner_id = new_streak_winner,
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
    RAISE NOTICE 'H2H Handicap Complete Logic Fix Applied:';
    RAISE NOTICE '';
    RAISE NOTICE 'Active Handicap Mode (when streak_winner exists and handicap > 0):';
    RAISE NOTICE '  - Streak winner wins again -> handicap +1';
    RAISE NOTICE '  - Underdog wins -> handicap -1';
    RAISE NOTICE '';
    RAISE NOTICE 'Example:';
    RAISE NOTICE '  A wins 5x -> handicap 4, streak_winner=A';
    RAISE NOTICE '  B wins   -> handicap 3, streak_winner=A (preserved!)';
    RAISE NOTICE '  A wins   -> handicap 4, streak_winner=A (increased!)';
    RAISE NOTICE '  B wins   -> handicap 3, streak_winner=A';
    RAISE NOTICE '  B wins 3x-> handicap 0, streak_winner=NULL';
END $$;
