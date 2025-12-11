-- Remove ALL Elo Gates
-- This allows Elo to go below 800 and removes all gate protection
-- Run this in Supabase SQL Editor

-- 1. Update get_highest_elo_gate to return 0 (no gates)
CREATE OR REPLACE FUNCTION get_highest_elo_gate(current_elo INTEGER, highest_elo INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- No gates - always return 0
    RETURN 0;
END;
$$;

-- 2. Update apply_elo_gate to NOT apply any protection
CREATE OR REPLACE FUNCTION apply_elo_gate(new_elo INTEGER, current_elo INTEGER, highest_elo INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- No gate protection - just return the new elo as-is
    -- Only protect against going below 0
    RETURN GREATEST(new_elo, 0);
END;
$$;

-- 3. Update the match trigger to not use gates
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
    k_factor INTEGER := 32;
    handicap_points INTEGER := 8;
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

    -- Get current Elo ratings (default 800)
    winner_elo := COALESCE(winner_data.elo_rating, 800);
    loser_elo := COALESCE(loser_data.elo_rating, 800);
    winner_highest_elo := COALESCE(winner_data.highest_elo, winner_elo);
    loser_highest_elo := COALESCE(loser_data.highest_elo, loser_elo);

    -- Calculate new Elo ratings
    SELECT * INTO elo_result FROM calculate_elo(winner_elo, loser_elo, k_factor);
    new_winner_elo := elo_result.new_winner_elo;
    new_loser_elo := elo_result.new_loser_elo;

    -- NO GATE PROTECTION - only prevent negative Elo
    new_loser_elo := GREATEST(new_loser_elo, 0);

    -- Calculate season points (based on Elo change, capped at 15)
    season_point_change := LEAST(elo_result.elo_delta, 15);

    -- Handicap bonus
    IF COALESCE(NEW.handicap_used, false) THEN
        season_point_change := season_point_change + handicap_points;
    END IF;

    -- Calculate XP (same as season points for now)
    winner_xp_gain := season_point_change;

    -- Update winner profile
    UPDATE profiles SET
        elo_rating = new_winner_elo,
        highest_elo = GREATEST(COALESCE(highest_elo, 0), new_winner_elo),
        season_points = COALESCE(season_points, 0) + season_point_change,
        xp = COALESCE(xp, 0) + winner_xp_gain,
        matches_played = COALESCE(matches_played, 0) + 1,
        matches_won = COALESCE(matches_won, 0) + 1,
        win_streak = COALESCE(win_streak, 0) + 1,
        loss_streak = 0
    WHERE id = NEW.winner_id;

    -- Update loser profile
    UPDATE profiles SET
        elo_rating = new_loser_elo,
        matches_played = COALESCE(matches_played, 0) + 1,
        matches_lost = COALESCE(matches_lost, 0) + 1,
        loss_streak = COALESCE(loss_streak, 0) + 1,
        win_streak = 0
    WHERE id = NEW.loser_id;

    -- Update match record
    NEW.elo_change := elo_result.elo_delta;
    NEW.player_a_elo_before := CASE WHEN NEW.winner_id = NEW.player_a_id THEN winner_elo ELSE loser_elo END;
    NEW.player_b_elo_before := CASE WHEN NEW.winner_id = NEW.player_b_id THEN winner_elo ELSE loser_elo END;
    NEW.player_a_elo_after := CASE WHEN NEW.winner_id = NEW.player_a_id THEN new_winner_elo ELSE new_loser_elo END;
    NEW.player_b_elo_after := CASE WHEN NEW.winner_id = NEW.player_b_id THEN new_winner_elo ELSE new_loser_elo END;
    NEW.processed := true;

    -- Insert points history for winner
    INSERT INTO points_history (user_id, points_change, xp_change, elo_change, reason, sport_id)
    VALUES (NEW.winner_id, season_point_change, winner_xp_gain, elo_result.elo_delta,
            'Match gewonnen', NEW.sport_id);

    -- Insert points history for loser (negative elo change)
    INSERT INTO points_history (user_id, points_change, xp_change, elo_change, reason, sport_id)
    VALUES (NEW.loser_id, 0, 0, -elo_result.elo_delta,
            'Match verloren', NEW.sport_id);

    RETURN NEW;
END;
$$;

-- Verify the changes
SELECT 'Elo gates removed successfully. Elo can now go below 800 (minimum 0).' as status;
