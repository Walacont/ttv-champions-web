-- =====================================================
-- Fix: Add sport_id to doubles_matches and doubles_pairings
-- =====================================================

-- 1. Add sport_id column to doubles_pairings if not exists
ALTER TABLE doubles_pairings ADD COLUMN IF NOT EXISTS sport_id UUID REFERENCES sports(id);

-- 2. Add sport_id column to doubles_match_requests if not exists
ALTER TABLE doubles_match_requests ADD COLUMN IF NOT EXISTS sport_id UUID REFERENCES sports(id);

-- 3. Update process_doubles_match_result to include sport_id in pairings
CREATE OR REPLACE FUNCTION process_doubles_match_result()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    winning_players UUID[];
    losing_players UUID[];
    team_a_pairing TEXT;
    team_b_pairing TEXT;
    winner_pairing TEXT;
    loser_pairing TEXT;
    team_a_elo INTEGER;
    team_b_elo INTEGER;
    elo_result RECORD;
    season_point_change INTEGER;
    xp_per_player INTEGER;
    k_factor INTEGER := 32;
    handicap_points INTEGER := 8;
    player_id UUID;
    winner_elo_change INTEGER;
    loser_elo_change INTEGER;
    partner_name_1 TEXT;
    partner_name_2 TEXT;
BEGIN
    -- Skip if already processed
    IF NEW.processed = true THEN
        RETURN NEW;
    END IF;

    -- Determine winning and losing teams
    IF NEW.winning_team = 'A' THEN
        winning_players := ARRAY[NEW.team_a_player1_id, NEW.team_a_player2_id];
        losing_players := ARRAY[NEW.team_b_player1_id, NEW.team_b_player2_id];
    ELSE
        winning_players := ARRAY[NEW.team_b_player1_id, NEW.team_b_player2_id];
        losing_players := ARRAY[NEW.team_a_player1_id, NEW.team_a_player2_id];
    END IF;

    -- Calculate pairing IDs (sorted player IDs for consistency)
    IF NEW.team_a_player1_id < NEW.team_a_player2_id THEN
        team_a_pairing := NEW.team_a_player1_id || '_' || NEW.team_a_player2_id;
    ELSE
        team_a_pairing := NEW.team_a_player2_id || '_' || NEW.team_a_player1_id;
    END IF;

    IF NEW.team_b_player1_id < NEW.team_b_player2_id THEN
        team_b_pairing := NEW.team_b_player1_id || '_' || NEW.team_b_player2_id;
    ELSE
        team_b_pairing := NEW.team_b_player2_id || '_' || NEW.team_b_player1_id;
    END IF;

    -- Store pairing IDs on match record
    NEW.team_a_pairing_id := team_a_pairing;
    NEW.team_b_pairing_id := team_b_pairing;

    -- Determine winner/loser pairings
    IF NEW.winning_team = 'A' THEN
        winner_pairing := team_a_pairing;
        loser_pairing := team_b_pairing;
    ELSE
        winner_pairing := team_b_pairing;
        loser_pairing := team_a_pairing;
    END IF;

    -- Create pairings if they don't exist (start at 800 Elo)
    -- NOW INCLUDES sport_id!
    INSERT INTO doubles_pairings (id, player1_id, player2_id, club_id, sport_id, player1_name, player2_name, current_elo_rating)
    VALUES (
        team_a_pairing,
        LEAST(NEW.team_a_player1_id, NEW.team_a_player2_id),
        GREATEST(NEW.team_a_player1_id, NEW.team_a_player2_id),
        NEW.club_id,
        NEW.sport_id,
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id = NEW.team_a_player1_id),
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id = NEW.team_a_player2_id),
        800
    ) ON CONFLICT (id) DO UPDATE SET sport_id = COALESCE(doubles_pairings.sport_id, EXCLUDED.sport_id);

    INSERT INTO doubles_pairings (id, player1_id, player2_id, club_id, sport_id, player1_name, player2_name, current_elo_rating)
    VALUES (
        team_b_pairing,
        LEAST(NEW.team_b_player1_id, NEW.team_b_player2_id),
        GREATEST(NEW.team_b_player1_id, NEW.team_b_player2_id),
        NEW.club_id,
        NEW.sport_id,
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id = NEW.team_b_player1_id),
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id = NEW.team_b_player2_id),
        800
    ) ON CONFLICT (id) DO UPDATE SET sport_id = COALESCE(doubles_pairings.sport_id, EXCLUDED.sport_id);

    -- Get PAIRING Elo (not individual player average!)
    SELECT COALESCE(current_elo_rating, 800) INTO team_a_elo
    FROM doubles_pairings WHERE id = team_a_pairing;

    SELECT COALESCE(current_elo_rating, 800) INTO team_b_elo
    FROM doubles_pairings WHERE id = team_b_pairing;

    IF COALESCE(NEW.handicap_used, false) THEN
        -- Handicap match: Fixed changes
        season_point_change := handicap_points / 2;
        xp_per_player := 0;
        winner_elo_change := handicap_points;
        loser_elo_change := -handicap_points;

        -- Update PAIRING Elo (winner)
        UPDATE doubles_pairings SET
            current_elo_rating = current_elo_rating + handicap_points,
            matches_played = COALESCE(matches_played, 0) + 1,
            matches_won = COALESCE(matches_won, 0) + 1,
            win_rate = (COALESCE(matches_won, 0) + 1)::REAL / (COALESCE(matches_played, 0) + 1)::REAL,
            last_played = NOW(),
            updated_at = NOW()
        WHERE id = winner_pairing;

        -- Update PAIRING Elo (loser) with floor at 100
        UPDATE doubles_pairings SET
            current_elo_rating = GREATEST(100, current_elo_rating - handicap_points),
            matches_played = COALESCE(matches_played, 0) + 1,
            matches_lost = COALESCE(matches_lost, 0) + 1,
            win_rate = COALESCE(matches_won, 0)::REAL / (COALESCE(matches_played, 0) + 1)::REAL,
            last_played = NOW(),
            updated_at = NOW()
        WHERE id = loser_pairing;
    ELSE
        -- Standard match: Calculate Elo dynamically
        SELECT * INTO elo_result FROM calculate_elo(team_a_elo, team_b_elo, k_factor);

        IF NEW.winning_team = 'A' THEN
            winner_elo_change := elo_result.new_winner_elo - team_a_elo;
            loser_elo_change := elo_result.new_loser_elo - team_b_elo;
        ELSE
            winner_elo_change := elo_result.new_winner_elo - team_b_elo;
            loser_elo_change := elo_result.new_loser_elo - team_a_elo;
        END IF;

        season_point_change := ROUND(elo_result.elo_delta * 0.2);
        xp_per_player := ROUND(elo_result.elo_delta / 2);

        -- Update PAIRING Elo
        UPDATE doubles_pairings SET
            current_elo_rating = elo_result.new_winner_elo,
            matches_played = COALESCE(matches_played, 0) + 1,
            matches_won = COALESCE(matches_won, 0) + 1,
            win_rate = (COALESCE(matches_won, 0) + 1)::REAL / (COALESCE(matches_played, 0) + 1)::REAL,
            last_played = NOW(),
            updated_at = NOW()
        WHERE id = winner_pairing;

        UPDATE doubles_pairings SET
            current_elo_rating = elo_result.new_loser_elo,
            matches_played = COALESCE(matches_played, 0) + 1,
            matches_lost = COALESCE(matches_lost, 0) + 1,
            win_rate = COALESCE(matches_won, 0)::REAL / (COALESCE(matches_played, 0) + 1)::REAL,
            last_played = NOW(),
            updated_at = NOW()
        WHERE id = loser_pairing;
    END IF;

    -- Store Elo changes on match
    NEW.team_a_elo_change := CASE WHEN NEW.winning_team = 'A' THEN winner_elo_change ELSE loser_elo_change END;
    NEW.team_b_elo_change := CASE WHEN NEW.winning_team = 'B' THEN winner_elo_change ELSE loser_elo_change END;
    NEW.season_points_awarded := season_point_change;

    -- Update individual player stats
    FOREACH player_id IN ARRAY winning_players LOOP
        UPDATE profiles SET
            doubles_elo_rating = (SELECT current_elo_rating FROM doubles_pairings WHERE id = winner_pairing),
            doubles_matches_played = COALESCE(doubles_matches_played, 0) + 1,
            doubles_matches_won = COALESCE(doubles_matches_won, 0) + 1,
            xp = COALESCE(xp, 0) + xp_per_player,
            points = COALESCE(points, 0) + ROUND(season_point_change / 2),
            updated_at = NOW()
        WHERE id = player_id;
    END LOOP;

    FOREACH player_id IN ARRAY losing_players LOOP
        UPDATE profiles SET
            doubles_elo_rating = (SELECT current_elo_rating FROM doubles_pairings WHERE id = loser_pairing),
            doubles_matches_played = COALESCE(doubles_matches_played, 0) + 1,
            doubles_matches_lost = COALESCE(doubles_matches_lost, 0) + 1,
            updated_at = NOW()
        WHERE id = player_id;
    END LOOP;

    NEW.processed := true;
    RETURN NEW;
END;
$$;

-- Verify
SELECT 'sport_id columns added and trigger updated!' as status;
