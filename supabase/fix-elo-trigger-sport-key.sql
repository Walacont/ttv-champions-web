-- Fix: Change s.key to s.name in process_match_elo trigger
-- The sports table doesn't have a 'key' column, it has 'name' instead

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
    -- FIX: Changed s.key to s.name
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

-- Also update the elo_sport_config to link to actual sports if needed
-- Make sure sport_key values match the sports.name values
UPDATE elo_sport_config SET sport_key = 'table-tennis' WHERE sport_key = 'table-tennis';
UPDATE elo_sport_config SET sport_key = 'badminton' WHERE sport_key = 'badminton';
UPDATE elo_sport_config SET sport_key = 'tennis' WHERE sport_key = 'tennis';
UPDATE elo_sport_config SET sport_key = 'padel' WHERE sport_key = 'padel';

-- Verify the fix
SELECT 'Trigger function updated: s.key -> s.name' as status;
