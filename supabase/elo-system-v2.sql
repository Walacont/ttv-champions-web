-- =========================================
-- SC Champions - Advanced ELO System v2
-- =========================================
-- Features:
-- - A-Factor based on experience (games played)
-- - Youth factor for U18/U21 players
-- - Decoupled calculation (each player uses own factor)
-- - Sport-specific handicap thresholds
-- - Fixed ±8 points for handicap games
-- - Rating floor at 400
-- - Gradual H2H handicap adjustment (-1 instead of reset)
-- =========================================

-- =========================================
-- STEP 1: Add singles_matches_played to profiles
-- =========================================
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS singles_matches_played INTEGER DEFAULT 0;

-- Update existing counts from matches table
UPDATE profiles p
SET singles_matches_played = (
    SELECT COUNT(*)
    FROM matches m
    WHERE (m.player_a_id = p.id OR m.player_b_id = p.id)
      AND m.processed = true
);

-- =========================================
-- STEP 2: Create sport-specific ELO configuration
-- =========================================
CREATE TABLE IF NOT EXISTS elo_sport_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sport_id UUID REFERENCES sports(id) ON DELETE CASCADE,
    sport_key TEXT UNIQUE, -- 'table-tennis', 'badminton', 'tennis', 'padel'

    -- Handicap thresholds
    handicap_threshold INTEGER DEFAULT 40,      -- Points difference to trigger handicap
    handicap_per_points INTEGER DEFAULT 40,     -- Points per handicap point
    handicap_cap INTEGER DEFAULT 7,             -- Maximum handicap points
    fixed_handicap_change INTEGER DEFAULT 8,    -- Fixed ELO change for handicap games

    -- A-Factor settings (can be customized per sport)
    a_factor_new INTEGER DEFAULT 32,            -- Games 1-10
    a_factor_stabilizing INTEGER DEFAULT 24,    -- Games 11-20
    a_factor_established INTEGER DEFAULT 16,    -- Games 21+
    a_factor_youth INTEGER DEFAULT 20,          -- U18/U21 permanent

    -- Rating limits
    rating_floor INTEGER DEFAULT 400,           -- Minimum rating
    rating_default INTEGER DEFAULT 800,         -- Starting rating

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default configurations
INSERT INTO elo_sport_config (sport_key, handicap_threshold, handicap_per_points, handicap_cap, fixed_handicap_change)
VALUES
    ('table-tennis', 40, 40, 7, 8),
    ('badminton', 40, 40, 12, 8),
    ('tennis', 150, 150, 3, 8),
    ('padel', 150, 150, 3, 8)
ON CONFLICT (sport_key) DO UPDATE SET
    handicap_threshold = EXCLUDED.handicap_threshold,
    handicap_per_points = EXCLUDED.handicap_per_points,
    handicap_cap = EXCLUDED.handicap_cap,
    fixed_handicap_change = EXCLUDED.fixed_handicap_change,
    updated_at = NOW();

-- =========================================
-- STEP 3: Helper function to calculate age from birthdate
-- =========================================
CREATE OR REPLACE FUNCTION get_player_age(p_birthdate TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_birthdate IS NULL OR p_birthdate = '' THEN
        RETURN NULL;
    END IF;

    BEGIN
        RETURN EXTRACT(YEAR FROM AGE(CURRENT_DATE, p_birthdate::DATE))::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;
END;
$$;

-- =========================================
-- STEP 4: Function to get A-Factor for a player
-- =========================================
CREATE OR REPLACE FUNCTION get_a_factor(
    p_player_id UUID,
    p_sport_key TEXT DEFAULT 'table-tennis'
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_matches_played INTEGER;
    v_birthdate TEXT;
    v_age INTEGER;
    v_config RECORD;
BEGIN
    -- Get sport config
    SELECT * INTO v_config FROM elo_sport_config WHERE sport_key = p_sport_key;
    IF NOT FOUND THEN
        -- Default values
        v_config.a_factor_new := 32;
        v_config.a_factor_stabilizing := 24;
        v_config.a_factor_established := 16;
        v_config.a_factor_youth := 20;
    END IF;

    -- Get player data
    SELECT singles_matches_played, birthdate
    INTO v_matches_played, v_birthdate
    FROM profiles
    WHERE id = p_player_id;

    v_matches_played := COALESCE(v_matches_played, 0);

    -- Check if youth player (U21 = under 21)
    v_age := get_player_age(v_birthdate);
    IF v_age IS NOT NULL AND v_age < 21 THEN
        RETURN v_config.a_factor_youth; -- 20
    END IF;

    -- Determine factor based on matches played
    IF v_matches_played < 10 THEN
        RETURN v_config.a_factor_new; -- 32 (Initialization phase)
    ELSIF v_matches_played < 20 THEN
        RETURN v_config.a_factor_stabilizing; -- 24 (Stabilization phase)
    ELSE
        RETURN v_config.a_factor_established; -- 16 (Established player)
    END IF;
END;
$$;

-- =========================================
-- STEP 5: Advanced ELO calculation with decoupled system
-- =========================================
CREATE OR REPLACE FUNCTION calculate_elo_advanced(
    p_winner_id UUID,
    p_loser_id UUID,
    p_winner_elo INTEGER,
    p_loser_elo INTEGER,
    p_handicap_used BOOLEAN DEFAULT FALSE,
    p_sport_key TEXT DEFAULT 'table-tennis'
)
RETURNS TABLE(
    new_winner_elo INTEGER,
    new_loser_elo INTEGER,
    winner_elo_change INTEGER,
    loser_elo_change INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_winner_factor INTEGER;
    v_loser_factor INTEGER;
    v_expected_winner NUMERIC;
    v_expected_loser NUMERIC;
    v_winner_change INTEGER;
    v_loser_change INTEGER;
    v_new_winner INTEGER;
    v_new_loser INTEGER;
    v_config RECORD;
BEGIN
    -- Get sport config
    SELECT * INTO v_config FROM elo_sport_config WHERE sport_key = p_sport_key;
    IF NOT FOUND THEN
        v_config.fixed_handicap_change := 8;
        v_config.rating_floor := 400;
    END IF;

    -- If handicap was used, apply fixed change
    IF p_handicap_used THEN
        v_winner_change := v_config.fixed_handicap_change;
        v_loser_change := -v_config.fixed_handicap_change;
    ELSE
        -- Get individual A-factors
        v_winner_factor := get_a_factor(p_winner_id, p_sport_key);
        v_loser_factor := get_a_factor(p_loser_id, p_sport_key);

        -- Calculate expected scores (standard ELO formula)
        v_expected_winner := 1.0 / (1.0 + POWER(10.0, (p_loser_elo - p_winner_elo)::NUMERIC / 400.0));
        v_expected_loser := 1.0 - v_expected_winner;

        -- Decoupled calculation: each player uses their own factor
        -- Winner: Factor * (1 - expected)
        -- Loser: Factor * (0 - expected)
        v_winner_change := ROUND(v_winner_factor * (1.0 - v_expected_winner));
        v_loser_change := ROUND(v_loser_factor * (0.0 - v_expected_loser));
    END IF;

    -- Calculate new ratings
    v_new_winner := p_winner_elo + v_winner_change;
    v_new_loser := p_loser_elo + v_loser_change;

    -- Apply rating floor
    IF v_new_loser < v_config.rating_floor THEN
        v_new_loser := v_config.rating_floor;
        v_loser_change := v_new_loser - p_loser_elo;
    END IF;

    RETURN QUERY SELECT v_new_winner, v_new_loser, v_winner_change, v_loser_change;
END;
$$;

-- =========================================
-- STEP 6: Function to check if handicap should be used
-- =========================================
CREATE OR REPLACE FUNCTION should_use_handicap(
    p_player_a_elo INTEGER,
    p_player_b_elo INTEGER,
    p_sport_key TEXT DEFAULT 'table-tennis'
)
RETURNS TABLE(
    use_handicap BOOLEAN,
    handicap_points INTEGER,
    stronger_player TEXT,
    elo_difference INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_config RECORD;
    v_diff INTEGER;
    v_handicap INTEGER;
    v_stronger TEXT;
BEGIN
    -- Get sport config
    SELECT * INTO v_config FROM elo_sport_config WHERE sport_key = p_sport_key;
    IF NOT FOUND THEN
        v_config.handicap_threshold := 40;
        v_config.handicap_per_points := 40;
        v_config.handicap_cap := 7;
    END IF;

    -- Calculate absolute difference
    v_diff := ABS(p_player_a_elo - p_player_b_elo);

    -- Determine stronger player
    IF p_player_a_elo > p_player_b_elo THEN
        v_stronger := 'A';
    ELSIF p_player_b_elo > p_player_a_elo THEN
        v_stronger := 'B';
    ELSE
        v_stronger := NULL;
    END IF;

    -- Check if handicap should be used
    IF v_diff >= v_config.handicap_threshold THEN
        -- Calculate handicap points
        v_handicap := LEAST(
            FLOOR(v_diff::NUMERIC / v_config.handicap_per_points)::INTEGER,
            v_config.handicap_cap
        );
        RETURN QUERY SELECT TRUE, v_handicap, v_stronger, v_diff;
    ELSE
        RETURN QUERY SELECT FALSE, 0, v_stronger, v_diff;
    END IF;
END;
$$;

-- =========================================
-- STEP 7: Updated match processing trigger
-- =========================================
CREATE OR REPLACE FUNCTION process_match_elo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_winner_current_elo INTEGER;
    v_loser_current_elo INTEGER;
    v_winner_highest_elo INTEGER;
    v_sport_key TEXT;
    v_elo_result RECORD;
BEGIN
    -- Only process if winner_id is set and not already processed
    IF NEW.winner_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Check if ELO was already calculated
    IF NEW.elo_change IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Get sport key (default to table-tennis)
    -- Note: Using s.name instead of s.key (sports table has 'name' column)
    SELECT COALESCE(s.name, 'table-tennis') INTO v_sport_key
    FROM sports s WHERE s.id = NEW.sport_id;
    v_sport_key := COALESCE(v_sport_key, 'table-tennis');

    -- Get current ELO ratings
    SELECT elo_rating, highest_elo
    INTO v_winner_current_elo, v_winner_highest_elo
    FROM profiles WHERE id = NEW.winner_id;

    SELECT elo_rating
    INTO v_loser_current_elo
    FROM profiles WHERE id = NEW.loser_id;

    -- Fallback to 800 if no ELO
    v_winner_current_elo := COALESCE(v_winner_current_elo, 800);
    v_loser_current_elo := COALESCE(v_loser_current_elo, 800);
    v_winner_highest_elo := COALESCE(v_winner_highest_elo, v_winner_current_elo);

    -- Calculate ELO with advanced system
    SELECT * INTO v_elo_result FROM calculate_elo_advanced(
        NEW.winner_id,
        NEW.loser_id,
        v_winner_current_elo,
        v_loser_current_elo,
        COALESCE(NEW.handicap_used, FALSE),
        v_sport_key
    );

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
    -- Store winner's change as the main elo_change
    NEW.elo_change := v_elo_result.winner_elo_change;
    -- Store individual changes
    NEW.winner_elo_change := v_elo_result.winner_elo_change;
    NEW.loser_elo_change := v_elo_result.loser_elo_change;

    -- Update winner profile
    UPDATE profiles
    SET
        elo_rating = v_elo_result.new_winner_elo,
        highest_elo = GREATEST(v_winner_highest_elo, v_elo_result.new_winner_elo),
        singles_matches_played = COALESCE(singles_matches_played, 0) + 1,
        updated_at = NOW()
    WHERE id = NEW.winner_id;

    -- Update loser profile
    UPDATE profiles
    SET
        elo_rating = v_elo_result.new_loser_elo,
        singles_matches_played = COALESCE(singles_matches_played, 0) + 1,
        updated_at = NOW()
    WHERE id = NEW.loser_id;

    RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS trigger_process_match_elo ON matches;
CREATE TRIGGER trigger_process_match_elo
    BEFORE INSERT OR UPDATE ON matches
    FOR EACH ROW
    EXECUTE FUNCTION process_match_elo();

-- =========================================
-- STEP 8: Add winner_elo_change and loser_elo_change columns to matches
-- =========================================
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS winner_elo_change INTEGER,
ADD COLUMN IF NOT EXISTS loser_elo_change INTEGER;

-- =========================================
-- STEP 9: Updated H2H with gradual handicap adjustment
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
    new_consecutive INTEGER;
    new_handicap INTEGER;
BEGIN
    -- Get or create h2h record
    h2h_id := get_or_create_h2h_stats(NEW.winner_id, NEW.loser_id);

    -- Get previous state
    SELECT last_winner_id, consecutive_wins, suggested_handicap
    INTO prev_last_winner, prev_consecutive, prev_handicap
    FROM head_to_head_stats WHERE id = h2h_id;

    prev_consecutive := COALESCE(prev_consecutive, 0);
    prev_handicap := COALESCE(prev_handicap, 0);

    -- Check if same player won again or different winner
    IF prev_last_winner IS NULL OR prev_last_winner = NEW.winner_id THEN
        -- Same winner or first match - increment streak
        new_consecutive := prev_consecutive + 1;

        -- Increase handicap: starts after 2 wins
        -- 2 wins = 1, 3 wins = 2, 4 wins = 3, etc. (max 7)
        IF new_consecutive >= 2 THEN
            new_handicap := LEAST(new_consecutive - 1, 7);
        ELSE
            new_handicap := 0;
        END IF;
    ELSE
        -- DIFFERENT WINNER - underdog won!
        -- GRADUAL adjustment: decrease by 1 instead of resetting to 0
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

-- =========================================
-- STEP 10: Verification & Summary
-- =========================================
DO $$
DECLARE
    v_profiles_with_matches INTEGER;
    v_configs INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_profiles_with_matches FROM profiles WHERE singles_matches_played > 0;
    SELECT COUNT(*) INTO v_configs FROM elo_sport_config;

    RAISE NOTICE '=========================================';
    RAISE NOTICE 'SC Champions - Advanced ELO System v2';
    RAISE NOTICE '=========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'A-Factor System:';
    RAISE NOTICE '  - Games 1-10:  Factor 32 (Initialization)';
    RAISE NOTICE '  - Games 11-20: Factor 24 (Stabilization)';
    RAISE NOTICE '  - Games 21+:   Factor 16 (Established)';
    RAISE NOTICE '  - Youth U21:   Factor 20 (Permanent)';
    RAISE NOTICE '';
    RAISE NOTICE 'Handicap System:';
    RAISE NOTICE '  - Fixed ±8 points when handicap is used';
    RAISE NOTICE '  - Sport-specific thresholds configured';
    RAISE NOTICE '';
    RAISE NOTICE 'H2H Handicap:';
    RAISE NOTICE '  - Gradual adjustment: -1 when underdog wins';
    RAISE NOTICE '  - No more instant reset to 0!';
    RAISE NOTICE '';
    RAISE NOTICE 'Rating Floor: 400 (minimum rating)';
    RAISE NOTICE '';
    RAISE NOTICE 'Stats:';
    RAISE NOTICE '  - Profiles with matches: %', v_profiles_with_matches;
    RAISE NOTICE '  - Sport configs: %', v_configs;
    RAISE NOTICE '=========================================';
END $$;

-- Show sport configurations
SELECT sport_key, handicap_threshold, handicap_per_points, handicap_cap, fixed_handicap_change,
       a_factor_new, a_factor_stabilizing, a_factor_established, a_factor_youth, rating_floor
FROM elo_sport_config
ORDER BY sport_key;
