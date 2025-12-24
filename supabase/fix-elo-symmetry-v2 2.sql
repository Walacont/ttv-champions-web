-- =========================================
-- Fix Elo Symmetry V2 - Truly Symmetric Changes
-- =========================================
-- Probleme behoben:
-- 1. Asymmetrie durch separate Rundungen (+15/-16 statt +16/-16)
-- 2. 800 Gate komplett entfernt
-- 3. K-Faktor = 16 (Q-TTR Standard)

-- =========================================
-- STEP 1: Fixed calculate_elo Function
-- =========================================
-- Der Delta wird EINMAL berechnet und gerundet, dann symmetrisch angewendet
CREATE OR REPLACE FUNCTION calculate_elo(
    winner_elo INTEGER,
    loser_elo INTEGER,
    k_factor INTEGER DEFAULT 16
)
RETURNS TABLE(new_winner_elo INTEGER, new_loser_elo INTEGER, elo_delta INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
    expected_winner FLOAT;
    delta INTEGER;
BEGIN
    -- Q-TTR Formula: Divisor 150 instead of 400
    expected_winner := 1.0 / (1.0 + POWER(10, (loser_elo - winner_elo)::FLOAT / 150));

    -- Calculate delta ONCE and round it
    delta := ROUND(k_factor * (1 - expected_winner));

    -- Ensure minimum delta of 1
    IF delta < 1 THEN
        delta := 1;
    END IF;

    -- Apply delta SYMMETRICALLY (same value for both!)
    RETURN QUERY SELECT
        winner_elo + delta,      -- Winner gains delta
        loser_elo - delta,       -- Loser loses SAME delta
        delta;
END;
$$;

-- =========================================
-- STEP 2: Updated Match Trigger
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
    elo_delta INTEGER;
    season_point_change INTEGER;
    winner_xp_gain INTEGER;
    k_factor INTEGER := 16;
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

    -- Get current Elo ratings (default 1000)
    winner_elo := COALESCE(winner_data.elo_rating, 1000);
    loser_elo := COALESCE(loser_data.elo_rating, 1000);
    winner_highest_elo := COALESCE(winner_data.highest_elo, winner_elo);
    loser_highest_elo := COALESCE(loser_data.highest_elo, loser_elo);

    IF COALESCE(NEW.handicap_used, false) THEN
        -- Handicap match: Fixed Elo changes (+8/-8)
        elo_delta := handicap_points;
        new_winner_elo := winner_elo + handicap_points;
        new_loser_elo := loser_elo - handicap_points;
        season_point_change := handicap_points;
        winner_xp_gain := 0;
    ELSE
        -- Standard match: Calculate Elo using Q-TTR formula
        SELECT * INTO elo_result FROM calculate_elo(winner_elo, loser_elo, k_factor);

        new_winner_elo := elo_result.new_winner_elo;
        new_loser_elo := elo_result.new_loser_elo;
        elo_delta := elo_result.elo_delta;

        -- Season points = Elo delta * 0.2
        season_point_change := ROUND(elo_delta * 0.2);
        winner_xp_gain := elo_delta;
    END IF;

    -- Update winner (NO floor protection!)
    UPDATE profiles SET
        elo_rating = new_winner_elo,
        highest_elo = GREATEST(new_winner_elo, winner_highest_elo),
        points = COALESCE(points, 0) + season_point_change,
        xp = COALESCE(xp, 0) + winner_xp_gain,
        wins = COALESCE(wins, 0) + 1,
        updated_at = NOW()
    WHERE id = NEW.winner_id;

    -- Update loser (NO floor protection - truly symmetric!)
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
        elo_delta,  -- Positive delta
        'Sieg gegen ' || loser_name,
        NOW(),
        NOW()
    );

    -- Add points_history entry for loser (SYMMETRIC: -delta)
    INSERT INTO points_history (user_id, points, xp, elo_change, reason, timestamp, created_at)
    VALUES (
        NEW.loser_id,
        0,
        0,
        -elo_delta,  -- Negative of SAME delta = truly symmetric!
        'Niederlage gegen ' || winner_name,
        NOW(),
        NOW()
    );

    -- Mark match as processed with symmetric values
    NEW.processed := true;
    NEW.winner_elo_change := elo_delta;
    NEW.loser_elo_change := -elo_delta;  -- Symmetric!
    NEW.season_points_awarded := season_point_change;

    RETURN NEW;
END;
$$;

-- =========================================
-- STEP 3: Clean up old triggers and create new one
-- =========================================
-- Remove ALL old triggers to avoid conflicts
DROP TRIGGER IF EXISTS trigger_process_match_result ON matches;
DROP TRIGGER IF EXISTS trigger_process_match_elo ON matches;
DROP TRIGGER IF EXISTS trigger_process_approved_match_request ON match_requests;

-- Drop old functions
DROP FUNCTION IF EXISTS process_match_elo();
DROP FUNCTION IF EXISTS process_approved_match_request();

-- Create the single correct trigger
CREATE TRIGGER trigger_process_match_result
    BEFORE INSERT ON matches
    FOR EACH ROW
    EXECUTE FUNCTION process_match_result();

-- =========================================
-- Verification
-- =========================================
DO $$
DECLARE
    result RECORD;
BEGIN
    -- Test with equal Elo (should give symmetric +8/-8 with K=16)
    SELECT * INTO result FROM calculate_elo(1000, 1000, 16);
    RAISE NOTICE 'Test 1000 vs 1000: Winner=%, Loser=%, Delta=%',
        result.new_winner_elo, result.new_loser_elo, result.elo_delta;

    -- Verify symmetry
    IF (result.new_winner_elo - 1000) != (1000 - result.new_loser_elo) THEN
        RAISE EXCEPTION 'FEHLER: Asymmetrische Berechnung!';
    ELSE
        RAISE NOTICE 'OK: Symmetrische Berechnung bestaetigt (+%/-%)',
            result.elo_delta, result.elo_delta;
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE 'Elo-System V2 aktiviert:';
    RAISE NOTICE '- Q-TTR Formel (Divisor 150)';
    RAISE NOTICE '- K-Faktor: 16';
    RAISE NOTICE '- KEIN Floor/Gate (Elo kann beliebig fallen)';
    RAISE NOTICE '- Garantiert symmetrisch: Winner +X, Loser -X (gleicher Betrag!)';
END $$;
