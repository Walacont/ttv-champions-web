-- Update match trigger to:
-- 1. Remove Elo Gate at 800
-- 2. Add points_history entries for match results

-- =========================================
-- Remove Elo Gate at 800
-- =========================================
CREATE OR REPLACE FUNCTION get_highest_elo_gate(current_elo INTEGER, highest_elo INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    -- Removed 800 from gates - now starts at 850
    gates INTEGER[] := ARRAY[850, 900, 1000, 1100, 1300, 1600];
    max_reached INTEGER;
    i INTEGER;
BEGIN
    max_reached := GREATEST(current_elo, COALESCE(highest_elo, 0));

    FOR i IN REVERSE array_length(gates, 1)..1 LOOP
        IF max_reached >= gates[i] THEN
            RETURN gates[i];
        END IF;
    END LOOP;

    RETURN 0; -- No gate below 850
END;
$$;

-- =========================================
-- Updated match trigger with points_history
-- =========================================
CREATE OR REPLACE FUNCTION process_match_result()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    winner_data RECORD;
    loser_data RECORD;
    winner_elo INTEGER;
    loser_elo INTEGER;
    winner_highest_elo INTEGER;
    loser_highest_elo INTEGER;
    new_winner_elo INTEGER;
    new_loser_elo INTEGER;
    protected_loser_elo INTEGER;
    elo_result RECORD;
    season_point_change INTEGER;
    winner_xp_gain INTEGER;
    k_factor INTEGER := 32;
    handicap_points INTEGER := 8;
    winner_name TEXT;
    loser_name TEXT;
BEGIN
    -- Skip if already processed
    IF NEW.processed = true THEN
        RETURN NEW;
    END IF;

    -- Validate data
    IF NEW.winner_id IS NULL OR NEW.loser_id IS NULL THEN
        RAISE EXCEPTION 'Invalid match data: missing player IDs';
    END IF;

    -- Get player data
    SELECT * INTO winner_data FROM profiles WHERE id = NEW.winner_id;
    SELECT * INTO loser_data FROM profiles WHERE id = NEW.loser_id;

    IF winner_data IS NULL OR loser_data IS NULL THEN
        RAISE EXCEPTION 'Player not found';
    END IF;

    winner_name := COALESCE(winner_data.display_name, 'Spieler');
    loser_name := COALESCE(loser_data.display_name, 'Spieler');

    -- Get current Elo ratings (default 800)
    winner_elo := COALESCE(winner_data.elo_rating, 800);
    loser_elo := COALESCE(loser_data.elo_rating, 800);
    winner_highest_elo := COALESCE(winner_data.highest_elo, winner_elo);
    loser_highest_elo := COALESCE(loser_data.highest_elo, loser_elo);

    IF COALESCE(NEW.handicap_used, false) THEN
        -- Handicap match: Fixed Elo changes (+8/-8), no XP
        season_point_change := handicap_points;
        winner_xp_gain := 0;

        new_winner_elo := winner_elo + handicap_points;
        new_loser_elo := loser_elo - handicap_points;

        -- Apply Elo gate protection (but no longer at 800)
        protected_loser_elo := apply_elo_gate(new_loser_elo, loser_elo, loser_highest_elo);
    ELSE
        -- Standard match: Calculate Elo dynamically
        SELECT * INTO elo_result FROM calculate_elo(winner_elo, loser_elo, k_factor);

        new_winner_elo := elo_result.new_winner_elo;
        new_loser_elo := elo_result.new_loser_elo;

        -- Apply Elo gate protection (but no longer at 800)
        protected_loser_elo := apply_elo_gate(new_loser_elo, loser_elo, loser_highest_elo);

        -- Calculate season points (Elo delta * 0.2)
        season_point_change := ROUND(elo_result.elo_delta * 0.2);
        winner_xp_gain := elo_result.elo_delta;
    END IF;

    -- Update winner
    UPDATE profiles SET
        elo_rating = new_winner_elo,
        highest_elo = GREATEST(new_winner_elo, winner_highest_elo),
        points = COALESCE(points, 0) + season_point_change,
        xp = COALESCE(xp, 0) + winner_xp_gain,
        wins = COALESCE(wins, 0) + 1,
        updated_at = NOW()
    WHERE id = NEW.winner_id;

    -- Update loser
    UPDATE profiles SET
        elo_rating = protected_loser_elo,
        highest_elo = GREATEST(protected_loser_elo, loser_highest_elo),
        losses = COALESCE(losses, 0) + 1,
        updated_at = NOW()
    WHERE id = NEW.loser_id;

    -- Add points_history entry for winner
    INSERT INTO points_history (user_id, points, xp, elo_change, reason, timestamp, created_at)
    VALUES (
        NEW.winner_id,
        season_point_change,
        winner_xp_gain,
        new_winner_elo - winner_elo,
        'Sieg gegen ' || loser_name,
        NOW(),
        NOW()
    );

    -- Add points_history entry for loser (only Elo change, no points)
    INSERT INTO points_history (user_id, points, xp, elo_change, reason, timestamp, created_at)
    VALUES (
        NEW.loser_id,
        0,
        0,
        protected_loser_elo - loser_elo,
        'Niederlage gegen ' || winner_name,
        NOW(),
        NOW()
    );

    -- Mark match as processed
    NEW.processed := true;
    NEW.winner_elo_change := new_winner_elo - winner_elo;
    NEW.loser_elo_change := protected_loser_elo - loser_elo;
    NEW.season_points_awarded := season_point_change;

    RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_process_match_result ON matches;
CREATE TRIGGER trigger_process_match_result
    BEFORE INSERT ON matches
    FOR EACH ROW
    EXECUTE FUNCTION process_match_result();

-- Verify
DO $$
BEGIN
    RAISE NOTICE 'Match trigger updated: Elo Gate 800 removed, points_history entries added';
END $$;
