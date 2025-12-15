-- =========================================
-- Fix Elo System to use Q-TTR Formula
-- =========================================
-- Changes:
-- 1. Remove ALL gate protection (symmetrical Elo changes)
-- 2. Use Q-TTR formula: P = 1 / (1 + 10^(Diff/150))
-- 3. Use K-factor = 16 (instead of 32)

-- =========================================
-- STEP 1: Remove Gate Protection
-- =========================================
-- New apply_elo_gate function that does nothing (no protection)
CREATE OR REPLACE FUNCTION apply_elo_gate(new_elo INTEGER, current_elo INTEGER, highest_elo INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- No gate protection - return the calculated Elo as-is
    RETURN new_elo;
END;
$$;

-- =========================================
-- STEP 2: Update Elo Calculation to Q-TTR
-- =========================================
-- Q-TTR Formula: P = 1 / (1 + 10^(Diff/150))
-- K-Factor: 16 (standard for adults in German TT)
CREATE OR REPLACE FUNCTION calculate_elo(
    winner_elo INTEGER,
    loser_elo INTEGER,
    k_factor INTEGER DEFAULT 16  -- Changed from 32 to 16
)
RETURNS TABLE(new_winner_elo INTEGER, new_loser_elo INTEGER, elo_delta INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
    expected_winner FLOAT;
    expected_loser FLOAT;
    calc_winner_elo INTEGER;
    calc_loser_elo INTEGER;
    calc_delta INTEGER;
BEGIN
    -- Q-TTR Formula uses divisor 150 instead of 400
    expected_winner := 1.0 / (1.0 + POWER(10, (loser_elo - winner_elo)::FLOAT / 150));
    expected_loser := 1.0 - expected_winner;

    -- Calculate new Elo ratings
    calc_winner_elo := ROUND(winner_elo + k_factor * (1 - expected_winner));
    calc_loser_elo := ROUND(loser_elo + k_factor * (0 - expected_loser));
    calc_delta := ABS(calc_winner_elo - winner_elo);

    RETURN QUERY SELECT calc_winner_elo, calc_loser_elo, calc_delta;
END;
$$;

-- =========================================
-- STEP 3: Update Match Trigger with K=16
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
    elo_result RECORD;
    season_point_change INTEGER;
    winner_xp_gain INTEGER;
    k_factor INTEGER := 16;  -- Q-TTR K-factor
    handicap_points INTEGER := 8;  -- Fixed for handicap matches
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

    -- Get current Elo ratings (default 1200 for Q-TTR)
    winner_elo := COALESCE(winner_data.elo_rating, 1200);
    loser_elo := COALESCE(loser_data.elo_rating, 1200);
    winner_highest_elo := COALESCE(winner_data.highest_elo, winner_elo);
    loser_highest_elo := COALESCE(loser_data.highest_elo, loser_elo);

    IF COALESCE(NEW.handicap_used, false) THEN
        -- Handicap match: Fixed Elo changes (+8/-8), no XP
        season_point_change := handicap_points;
        winner_xp_gain := 0;

        new_winner_elo := winner_elo + handicap_points;
        new_loser_elo := loser_elo - handicap_points;
    ELSE
        -- Standard match: Calculate Elo using Q-TTR formula
        SELECT * INTO elo_result FROM calculate_elo(winner_elo, loser_elo, k_factor);

        new_winner_elo := elo_result.new_winner_elo;
        new_loser_elo := elo_result.new_loser_elo;

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

    -- Update loser (NO gate protection - symmetrical changes)
    UPDATE profiles SET
        elo_rating = new_loser_elo,
        highest_elo = GREATEST(new_loser_elo, loser_highest_elo),
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

    -- Add points_history entry for loser (symmetrical Elo change)
    INSERT INTO points_history (user_id, points, xp, elo_change, reason, timestamp, created_at)
    VALUES (
        NEW.loser_id,
        0,
        0,
        new_loser_elo - loser_elo,  -- Now truly symmetrical
        'Niederlage gegen ' || winner_name,
        NOW(),
        NOW()
    );

    -- Mark match as processed
    NEW.processed := true;
    NEW.winner_elo_change := new_winner_elo - winner_elo;
    NEW.loser_elo_change := new_loser_elo - loser_elo;  -- Now symmetrical
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

-- =========================================
-- Verification
-- =========================================
DO $$
BEGIN
    RAISE NOTICE 'Q-TTR System aktiviert:';
    RAISE NOTICE '- Formel: P = 1 / (1 + 10^(Diff/150))';
    RAISE NOTICE '- K-Faktor: 16';
    RAISE NOTICE '- Keine Gate-Schutz mehr (symmetrisch +X/-X)';
    RAISE NOTICE '- Handicap: fest +8/-8';
END $$;
