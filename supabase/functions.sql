-- ========================================================================
-- SC Champions - Supabase Functions (Migration from Firebase Cloud Functions)
-- ========================================================================
-- Run this in Supabase SQL Editor to create all functions and triggers

-- ========================================================================
-- CONFIGURATION
-- ========================================================================
DO $$
BEGIN
    -- Create config table if not exists
    CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Insert default ELO config
    INSERT INTO config (key, value) VALUES
    ('elo', '{
        "default_rating": 800,
        "k_factor": 32,
        "season_point_factor": 0.2,
        "handicap_season_points": 8,
        "handicap_elo_change": 8,
        "gates": [800, 850, 900, 1000, 1100, 1300, 1600]
    }'::jsonb)
    ON CONFLICT (key) DO NOTHING;

    -- Insert season reset config
    INSERT INTO config (key, value) VALUES
    ('season_reset', '{"last_reset_date": null}'::jsonb)
    ON CONFLICT (key) DO NOTHING;
END $$;

-- ========================================================================
-- HELPER FUNCTIONS
-- ========================================================================

-- Get highest Elo gate a player has reached (DISABLED - no gates)
CREATE OR REPLACE FUNCTION get_highest_elo_gate(current_elo INTEGER, highest_elo INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- No gates - always return 0
    RETURN 0;
END;
$$;

-- Apply Elo gate protection (DISABLED - no protection)
CREATE OR REPLACE FUNCTION apply_elo_gate(new_elo INTEGER, current_elo INTEGER, highest_elo INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- No gate protection - only prevent negative Elo
    RETURN GREATEST(new_elo, 0);
END;
$$;

-- Calculate ELO ratings
CREATE OR REPLACE FUNCTION calculate_elo(
    winner_elo INTEGER,
    loser_elo INTEGER,
    k_factor INTEGER DEFAULT 32
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
    expected_winner := 1.0 / (1.0 + POWER(10, (loser_elo - winner_elo)::FLOAT / 400));
    expected_loser := 1.0 - expected_winner;

    calc_winner_elo := ROUND(winner_elo + k_factor * (1 - expected_winner));
    calc_loser_elo := ROUND(loser_elo + k_factor * (0 - expected_loser));
    calc_delta := ABS(calc_winner_elo - winner_elo);

    RETURN QUERY SELECT calc_winner_elo, calc_loser_elo, calc_delta;
END;
$$;

-- ========================================================================
-- FUNCTION 1: Process Singles Match Result
-- ========================================================================
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

        -- Apply Elo gate protection
        protected_loser_elo := apply_elo_gate(new_loser_elo, loser_elo, loser_highest_elo);
    ELSE
        -- Standard match: Calculate Elo dynamically
        SELECT * INTO elo_result FROM calculate_elo(winner_elo, loser_elo, k_factor);

        new_winner_elo := elo_result.new_winner_elo;
        new_loser_elo := elo_result.new_loser_elo;

        -- Apply Elo gate protection
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

    -- Mark match as processed
    NEW.processed := true;
    NEW.winner_elo_change := new_winner_elo - winner_elo;
    NEW.loser_elo_change := protected_loser_elo - loser_elo;
    NEW.season_points_awarded := season_point_change;

    RETURN NEW;
END;
$$;

-- Create trigger for singles matches
DROP TRIGGER IF EXISTS trigger_process_match_result ON matches;
CREATE TRIGGER trigger_process_match_result
    BEFORE INSERT ON matches
    FOR EACH ROW
    EXECUTE FUNCTION process_match_result();

-- ========================================================================
-- FUNCTION 2: Process Doubles Match Result
-- ========================================================================
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
    INSERT INTO doubles_pairings (id, player1_id, player2_id, club_id, player1_name, player2_name, current_elo_rating)
    VALUES (
        team_a_pairing,
        LEAST(NEW.team_a_player1_id, NEW.team_a_player2_id),
        GREATEST(NEW.team_a_player1_id, NEW.team_a_player2_id),
        NEW.club_id,
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id = NEW.team_a_player1_id),
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id = NEW.team_a_player2_id),
        800
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO doubles_pairings (id, player1_id, player2_id, club_id, player1_name, player2_name, current_elo_rating)
    VALUES (
        team_b_pairing,
        LEAST(NEW.team_b_player1_id, NEW.team_b_player2_id),
        GREATEST(NEW.team_b_player1_id, NEW.team_b_player2_id),
        NEW.club_id,
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id = NEW.team_b_player1_id),
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id = NEW.team_b_player2_id),
        800
    ) ON CONFLICT (id) DO NOTHING;

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
        -- Standard match: Calculate Elo based on PAIRING ratings
        SELECT * INTO elo_result FROM calculate_elo(
            CASE WHEN NEW.winning_team = 'A' THEN team_a_elo ELSE team_b_elo END,
            CASE WHEN NEW.winning_team = 'A' THEN team_b_elo ELSE team_a_elo END,
            k_factor
        );

        season_point_change := ROUND(elo_result.elo_delta * 0.2 / 2);
        xp_per_player := ROUND(elo_result.elo_delta / 2);
        winner_elo_change := elo_result.elo_delta;
        loser_elo_change := -elo_result.elo_delta;

        -- Update PAIRING Elo (winner)
        UPDATE doubles_pairings SET
            current_elo_rating = current_elo_rating + elo_result.elo_delta,
            matches_played = COALESCE(matches_played, 0) + 1,
            matches_won = COALESCE(matches_won, 0) + 1,
            win_rate = (COALESCE(matches_won, 0) + 1)::REAL / (COALESCE(matches_played, 0) + 1)::REAL,
            last_played = NOW(),
            updated_at = NOW()
        WHERE id = winner_pairing;

        -- Update PAIRING Elo (loser) with floor at 100
        UPDATE doubles_pairings SET
            current_elo_rating = GREATEST(100, current_elo_rating - elo_result.elo_delta),
            matches_played = COALESCE(matches_played, 0) + 1,
            matches_lost = COALESCE(matches_lost, 0) + 1,
            win_rate = COALESCE(matches_won, 0)::REAL / (COALESCE(matches_played, 0) + 1)::REAL,
            last_played = NOW(),
            updated_at = NOW()
        WHERE id = loser_pairing;
    END IF;

    -- Update individual player stats (wins/losses, points, XP - but NOT individual doubles_elo_rating)
    FOREACH player_id IN ARRAY winning_players LOOP
        UPDATE profiles SET
            points = COALESCE(points, 0) + season_point_change,
            xp = COALESCE(xp, 0) + COALESCE(xp_per_player, 0),
            doubles_wins = COALESCE(doubles_wins, 0) + 1,
            updated_at = NOW()
        WHERE id = player_id;
    END LOOP;

    FOREACH player_id IN ARRAY losing_players LOOP
        UPDATE profiles SET
            doubles_losses = COALESCE(doubles_losses, 0) + 1,
            updated_at = NOW()
        WHERE id = player_id;
    END LOOP;

    -- Store Elo changes on the match record
    IF NEW.winning_team = 'A' THEN
        NEW.team_a_elo_change := winner_elo_change;
        NEW.team_b_elo_change := loser_elo_change;
    ELSE
        NEW.team_a_elo_change := loser_elo_change;
        NEW.team_b_elo_change := winner_elo_change;
    END IF;
    NEW.season_points_awarded := season_point_change;

    -- Add points_history for winning players (with partner name)
    SELECT CONCAT(first_name, ' ', last_name) INTO partner_name_1 FROM profiles WHERE id = winning_players[1];
    SELECT CONCAT(first_name, ' ', last_name) INTO partner_name_2 FROM profiles WHERE id = winning_players[2];

    INSERT INTO points_history (user_id, points, xp, elo_change, reason, timestamp, created_at)
    VALUES (
        winning_players[1],
        season_point_change,
        COALESCE(xp_per_player, 0),
        winner_elo_change,
        'Doppel gewonnen (mit ' || COALESCE(partner_name_2, 'Partner') || ')',
        NOW(),
        NOW()
    );

    INSERT INTO points_history (user_id, points, xp, elo_change, reason, timestamp, created_at)
    VALUES (
        winning_players[2],
        season_point_change,
        COALESCE(xp_per_player, 0),
        winner_elo_change,
        'Doppel gewonnen (mit ' || COALESCE(partner_name_1, 'Partner') || ')',
        NOW(),
        NOW()
    );

    -- Add points_history for losing players (with partner name)
    SELECT CONCAT(first_name, ' ', last_name) INTO partner_name_1 FROM profiles WHERE id = losing_players[1];
    SELECT CONCAT(first_name, ' ', last_name) INTO partner_name_2 FROM profiles WHERE id = losing_players[2];

    INSERT INTO points_history (user_id, points, xp, elo_change, reason, timestamp, created_at)
    VALUES (
        losing_players[1],
        0,
        0,
        loser_elo_change,
        'Doppel verloren (mit ' || COALESCE(partner_name_2, 'Partner') || ')',
        NOW(),
        NOW()
    );

    INSERT INTO points_history (user_id, points, xp, elo_change, reason, timestamp, created_at)
    VALUES (
        losing_players[2],
        0,
        0,
        loser_elo_change,
        'Doppel verloren (mit ' || COALESCE(partner_name_1, 'Partner') || ')',
        NOW(),
        NOW()
    );

    -- Mark match as processed
    NEW.processed := true;

    RETURN NEW;
END;
$$;

-- Create trigger for doubles matches
DROP TRIGGER IF EXISTS trigger_process_doubles_match ON doubles_matches;
CREATE TRIGGER trigger_process_doubles_match
    BEFORE INSERT ON doubles_matches
    FOR EACH ROW
    EXECUTE FUNCTION process_doubles_match_result();

-- ========================================================================
-- FUNCTION 3: Claim Invitation Code
-- ========================================================================
CREATE OR REPLACE FUNCTION claim_invitation_code(
    p_user_id UUID,
    p_code TEXT,
    p_code_id UUID,
    p_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    code_data RECORD;
    existing_profile RECORD;
    old_player_data RECORD;
BEGIN
    -- Get code
    SELECT * INTO code_data FROM invitation_codes WHERE id = p_code_id;

    IF code_data IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Code nicht gefunden');
    END IF;

    -- Validate code
    IF code_data.code != p_code THEN
        RETURN jsonb_build_object('success', false, 'error', 'Code stimmt nicht überein');
    END IF;

    IF code_data.used = true THEN
        RETURN jsonb_build_object('success', false, 'error', 'Code wurde bereits verwendet');
    END IF;

    IF code_data.superseded = true THEN
        RETURN jsonb_build_object('success', false, 'error', 'Code wurde ersetzt');
    END IF;

    IF code_data.expires_at < NOW() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Code ist abgelaufen');
    END IF;

    -- Check if profile already exists
    SELECT * INTO existing_profile FROM profiles WHERE id = p_user_id;

    IF existing_profile IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Profil existiert bereits');
    END IF;

    -- Check if this is a migration (existing offline player)
    IF code_data.player_id IS NOT NULL THEN
        -- Get old player data
        SELECT * INTO old_player_data FROM profiles WHERE id = code_data.player_id;

        IF old_player_data IS NOT NULL THEN
            -- Create new profile with old data
            INSERT INTO profiles (
                id, email, first_name, last_name, club_id, role,
                points, xp, elo_rating, highest_elo, wins, losses,
                doubles_elo_rating, doubles_highest_elo, doubles_wins, doubles_losses,
                league, onboarding_complete, is_offline, display_name,
                created_at, migrated_from, migrated_at
            ) VALUES (
                p_user_id, COALESCE(p_email, old_player_data.email),
                old_player_data.first_name, old_player_data.last_name,
                old_player_data.club_id, old_player_data.role,
                old_player_data.points, old_player_data.xp,
                old_player_data.elo_rating, old_player_data.highest_elo,
                old_player_data.wins, old_player_data.losses,
                old_player_data.doubles_elo_rating, old_player_data.doubles_highest_elo,
                old_player_data.doubles_wins, old_player_data.doubles_losses,
                old_player_data.league, false, true, old_player_data.display_name,
                NOW(), code_data.player_id, NOW()
            );

            -- Delete old offline profile
            DELETE FROM profiles WHERE id = code_data.player_id;
        END IF;
    ELSE
        -- Create new profile
        INSERT INTO profiles (
            id, email, first_name, last_name, club_id, role,
            points, xp, elo_rating, highest_elo, wins, losses,
            onboarding_complete, is_offline, created_at
        ) VALUES (
            p_user_id, p_email,
            code_data.first_name, code_data.last_name,
            code_data.club_id, COALESCE(code_data.role, 'player'),
            0, 0, 800, 800, 0, 0,
            false, true, NOW()
        );
    END IF;

    -- Mark code as used
    UPDATE invitation_codes SET
        used = true,
        used_by = p_user_id,
        used_at = NOW()
    WHERE id = p_code_id;

    RETURN jsonb_build_object('success', true, 'message', 'Code erfolgreich eingelöst');
END;
$$;

-- ========================================================================
-- FUNCTION 4: Process Approved Match Request (Singles)
-- ========================================================================
CREATE OR REPLACE FUNCTION process_approved_match_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only process when status changes to 'approved'
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        -- Create match from request
        INSERT INTO matches (
            club_id, winner_id, loser_id,
            set1_winner, set1_loser, set2_winner, set2_loser,
            set3_winner, set3_loser, set4_winner, set4_loser,
            set5_winner, set5_loser, handicap_used,
            requested_by, approved_by, created_at
        ) VALUES (
            NEW.club_id, NEW.winner_id, NEW.loser_id,
            NEW.set1_winner, NEW.set1_loser, NEW.set2_winner, NEW.set2_loser,
            NEW.set3_winner, NEW.set3_loser, NEW.set4_winner, NEW.set4_loser,
            NEW.set5_winner, NEW.set5_loser, NEW.handicap_used,
            NEW.requested_by, NEW.approved_by, NOW()
        );

        -- Delete the request
        DELETE FROM match_requests WHERE id = NEW.id;

        RETURN NULL; -- Prevent the update since we're deleting
    END IF;

    RETURN NEW;
END;
$$;

-- Create trigger for match requests
DROP TRIGGER IF EXISTS trigger_process_approved_match_request ON match_requests;
CREATE TRIGGER trigger_process_approved_match_request
    AFTER UPDATE ON match_requests
    FOR EACH ROW
    EXECUTE FUNCTION process_approved_match_request();

-- ========================================================================
-- FUNCTION 6: Process Approved Doubles Match Request
-- ========================================================================
CREATE OR REPLACE FUNCTION process_approved_doubles_match_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only process when status changes to 'approved'
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        -- Create doubles match from request (extract from JSONB team_a and team_b)
        INSERT INTO doubles_matches (
            club_id, winning_team,
            team_a_player1_id, team_a_player2_id, team_a_pairing_id,
            team_b_player1_id, team_b_player2_id, team_b_pairing_id,
            sets, match_mode, handicap_used, handicap, is_cross_club, played_at, created_at
        ) VALUES (
            NEW.club_id, NEW.winning_team,
            (NEW.team_a->>'player1_id')::UUID,
            (NEW.team_a->>'player2_id')::UUID,
            NEW.team_a->>'pairing_id',
            (NEW.team_b->>'player1_id')::UUID,
            (NEW.team_b->>'player2_id')::UUID,
            NEW.team_b->>'pairing_id',
            NEW.sets, COALESCE(NEW.match_mode, 'best-of-5'), COALESCE(NEW.handicap_used, false), NEW.handicap, NEW.is_cross_club, NOW(), NOW()
        );

        -- Delete the request
        DELETE FROM doubles_match_requests WHERE id = NEW.id;

        RETURN NULL;
    END IF;

    RETURN NEW;
END;
$$;

-- Create trigger for doubles match requests
DROP TRIGGER IF EXISTS trigger_process_approved_doubles_request ON doubles_match_requests;
CREATE TRIGGER trigger_process_approved_doubles_request
    AFTER UPDATE ON doubles_match_requests
    FOR EACH ROW
    EXECUTE FUNCTION process_approved_doubles_match_request();

-- ========================================================================
-- FUNCTION 7: Cleanup Expired Invitation Codes
-- ========================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_invitation_codes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM invitation_codes
    WHERE expires_at < NOW()
    AND used = false;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$;

-- ========================================================================
-- FUNCTION 7: Season Reset
-- ========================================================================
CREATE OR REPLACE FUNCTION perform_season_reset(p_club_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    club_record RECORD;
    clubs_reset INTEGER := 0;
    players_reset INTEGER := 0;
    total_players INTEGER := 0;
BEGIN
    -- Process clubs (all clubs if p_club_id is NULL)
    FOR club_record IN
        SELECT id FROM clubs
        WHERE (p_club_id IS NULL OR id = p_club_id)
    LOOP
        -- Reset points for all players in club
        UPDATE profiles SET
            points = 0,
            last_season_reset = NOW(),
            updated_at = NOW()
        WHERE club_id = club_record.id AND role = 'player';

        -- Note: League promotions/demotions would need more complex logic
        -- This is simplified to just reset points

        clubs_reset := clubs_reset + 1;

        SELECT COUNT(*) INTO total_players
        FROM profiles
        WHERE club_id = club_record.id AND role = 'player';

        players_reset := players_reset + total_players;
    END LOOP;

    -- Update config
    UPDATE config SET
        value = jsonb_set(value, '{last_reset_date}', to_jsonb(NOW()::TEXT)),
        updated_at = NOW()
    WHERE key = 'season_reset';

    RETURN jsonb_build_object(
        'success', true,
        'clubs_reset', clubs_reset,
        'players_reset', players_reset,
        'reset_date', NOW()
    );
END;
$$;

-- ========================================================================
-- FUNCTION 10: Anonymize Account
-- ========================================================================
CREATE OR REPLACE FUNCTION anonymize_account(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    random_suffix TEXT;
BEGIN
    -- Generate random suffix
    random_suffix := substr(md5(random()::text), 1, 8);

    -- Anonymize profile
    UPDATE profiles SET
        email = 'deleted_' || random_suffix || '@anonymous.local',
        first_name = 'Gelöschter',
        last_name = 'Nutzer',
        display_name = 'Gelöschter Nutzer',
        avatar_url = NULL,
        phone = NULL,
        birthdate = NULL,
        gender = NULL,
        is_anonymized = true,
        anonymized_at = NOW(),
        updated_at = NOW()
    WHERE id = p_user_id;

    -- Delete sensitive subcollection data
    -- Note: In Supabase, related data should be handled by CASCADE or separate deletes

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Account anonymisiert'
    );
END;
$$;

-- ========================================================================
-- FUNCTION 11: Handle Club Request (Join/Leave)
-- ========================================================================
CREATE OR REPLACE FUNCTION handle_club_request(
    p_request_id UUID,
    p_action TEXT, -- 'approve' or 'reject'
    p_handled_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    request_data RECORD;
BEGIN
    -- Get request
    SELECT * INTO request_data FROM club_requests WHERE id = p_request_id;

    IF request_data IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage nicht gefunden');
    END IF;

    IF request_data.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage wurde bereits bearbeitet');
    END IF;

    IF p_action = 'approve' THEN
        IF request_data.type = 'join' THEN
            -- Add user to club
            UPDATE profiles SET
                club_id = request_data.club_id,
                club_joined_at = NOW(),
                updated_at = NOW()
            WHERE id = request_data.user_id;
        ELSIF request_data.type = 'leave' THEN
            -- Remove user from club
            UPDATE profiles SET
                club_id = NULL,
                club_joined_at = NULL,
                updated_at = NOW()
            WHERE id = request_data.user_id;
        END IF;

        -- Update request status
        UPDATE club_requests SET
            status = 'approved',
            handled_by = p_handled_by,
            handled_at = NOW()
        WHERE id = p_request_id;

        RETURN jsonb_build_object('success', true, 'message', 'Anfrage genehmigt');
    ELSIF p_action = 'reject' THEN
        UPDATE club_requests SET
            status = 'rejected',
            handled_by = p_handled_by,
            handled_at = NOW()
        WHERE id = p_request_id;

        RETURN jsonb_build_object('success', true, 'message', 'Anfrage abgelehnt');
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Ungültige Aktion');
    END IF;
END;
$$;

-- ========================================================================
-- FUNCTION 12: Auto Create Club on Invitation
-- ========================================================================
CREATE OR REPLACE FUNCTION auto_create_club_on_invitation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    existing_club RECORD;
BEGIN
    -- Check if club exists
    SELECT * INTO existing_club FROM clubs WHERE id = NEW.club_id;

    IF existing_club IS NULL THEN
        -- Create club
        INSERT INTO clubs (id, name, created_at)
        VALUES (NEW.club_id, NEW.club_id, NOW())
        ON CONFLICT (id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;

-- Create trigger for auto club creation
DROP TRIGGER IF EXISTS trigger_auto_create_club_invitation ON invitation_codes;
CREATE TRIGGER trigger_auto_create_club_invitation
    BEFORE INSERT ON invitation_codes
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_club_on_invitation();

-- ========================================================================
-- PG_CRON SCHEDULED JOBS (Run in Supabase Dashboard > Database > Extensions)
-- ========================================================================
-- Enable pg_cron extension first:
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cleanup jobs (uncomment after enabling pg_cron):
-- SELECT cron.schedule('cleanup-expired-codes', '0 3 * * *', 'SELECT cleanup_expired_invitation_codes()');
-- SELECT cron.schedule('check-season-reset', '0 0 * * *', 'SELECT perform_season_reset()');

-- ========================================================================
-- DONE!
-- ========================================================================
-- Run this entire file in Supabase SQL Editor to set up all functions
