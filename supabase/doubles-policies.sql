-- SC Champions - Doubles Matches RLS Policies & Triggers
-- =========================================
-- Row Level Security policies for doubles matches tables
-- and trigger for processing doubles match results

-- =========================================
-- ENABLE RLS ON TABLES
-- =========================================

ALTER TABLE doubles_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE doubles_match_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE doubles_pairings ENABLE ROW LEVEL SECURITY;

-- =========================================
-- DOUBLES MATCHES POLICIES
-- =========================================

-- Read policy: Players can read matches they participated in OR club matches OR cross-club matches
DROP POLICY IF EXISTS "doubles_matches_read" ON doubles_matches;
CREATE POLICY "doubles_matches_read" ON doubles_matches
FOR SELECT USING (
    auth.uid() IS NOT NULL AND (
        -- Admin can read all
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
        -- Cross-club matches (club_id is null)
        OR club_id IS NULL
        -- Same club matches
        OR (SELECT club_id FROM profiles WHERE id = auth.uid()) = club_id
        -- Player is in team A
        OR team_a_player1_id = auth.uid()
        OR team_a_player2_id = auth.uid()
        -- Player is in team B
        OR team_b_player1_id = auth.uid()
        OR team_b_player2_id = auth.uid()
    )
);

-- Create policy: Coaches can create matches in their club OR cross-club
DROP POLICY IF EXISTS "doubles_matches_create" ON doubles_matches;
CREATE POLICY "doubles_matches_create" ON doubles_matches
FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('coach', 'admin')
    AND (
        club_id IS NULL
        OR (SELECT club_id FROM profiles WHERE id = auth.uid()) = club_id
    )
);

-- Update policy: Coaches can update matches
DROP POLICY IF EXISTS "doubles_matches_update" ON doubles_matches;
CREATE POLICY "doubles_matches_update" ON doubles_matches
FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('coach', 'admin')
    AND (
        club_id IS NULL
        OR (SELECT club_id FROM profiles WHERE id = auth.uid()) = club_id
    )
);

-- Delete policy: Coaches can delete matches
DROP POLICY IF EXISTS "doubles_matches_delete" ON doubles_matches;
CREATE POLICY "doubles_matches_delete" ON doubles_matches
FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('coach', 'admin')
    AND (
        club_id IS NULL
        OR (SELECT club_id FROM profiles WHERE id = auth.uid()) = club_id
    )
);

-- =========================================
-- DOUBLES MATCH REQUESTS POLICIES
-- =========================================

-- Read policy: Complex rules based on status
DROP POLICY IF EXISTS "doubles_match_requests_read" ON doubles_match_requests;
CREATE POLICY "doubles_match_requests_read" ON doubles_match_requests
FOR SELECT USING (
    auth.uid() IS NOT NULL AND (
        -- Initiator can always read
        initiated_by = auth.uid()
        -- Players in teams can read
        OR (team_a->>'player1_id')::UUID = auth.uid()
        OR (team_a->>'player2_id')::UUID = auth.uid()
        OR (team_b->>'player1_id')::UUID = auth.uid()
        OR (team_b->>'player2_id')::UUID = auth.uid()
        -- Coaches can read pending_coach requests
        OR (
            (SELECT role FROM profiles WHERE id = auth.uid()) IN ('coach', 'admin')
            AND status = 'pending_coach'
        )
        -- Same club can see pending requests
        OR (
            (SELECT club_id FROM profiles WHERE id = auth.uid()) = club_id
            AND status IN ('pending_opponent', 'pending_coach')
        )
    )
);

-- Create policy: Players can create requests
DROP POLICY IF EXISTS "doubles_match_requests_create" ON doubles_match_requests;
CREATE POLICY "doubles_match_requests_create" ON doubles_match_requests
FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND initiated_by = auth.uid()
);

-- Update policy: For opponent confirmations and coach approvals
DROP POLICY IF EXISTS "doubles_match_requests_update" ON doubles_match_requests;
CREATE POLICY "doubles_match_requests_update" ON doubles_match_requests
FOR UPDATE USING (
    auth.uid() IS NOT NULL AND (
        -- Initiator can update
        initiated_by = auth.uid()
        -- Players in teams can update (for confirmations)
        OR (team_a->>'player1_id')::UUID = auth.uid()
        OR (team_a->>'player2_id')::UUID = auth.uid()
        OR (team_b->>'player1_id')::UUID = auth.uid()
        OR (team_b->>'player2_id')::UUID = auth.uid()
        -- Coaches can update for approval
        OR (
            (SELECT role FROM profiles WHERE id = auth.uid()) IN ('coach', 'admin')
            AND status = 'pending_coach'
        )
    )
);

-- =========================================
-- DOUBLES PAIRINGS POLICIES
-- =========================================

-- Read policy: All authenticated users can read (for leaderboards)
DROP POLICY IF EXISTS "doubles_pairings_read" ON doubles_pairings;
CREATE POLICY "doubles_pairings_read" ON doubles_pairings
FOR SELECT USING (auth.uid() IS NOT NULL);

-- Write policy: Only system/triggers can write (no direct user writes)
-- Pairings are updated by triggers when matches are processed

-- =========================================
-- DOUBLES MATCH PROCESSING TRIGGER
-- =========================================

CREATE OR REPLACE FUNCTION process_doubles_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    team_a_avg_elo INTEGER;
    team_b_avg_elo INTEGER;
    winner_elo INTEGER;
    loser_elo INTEGER;
    elo_delta INTEGER;
    k_factor INTEGER := 32;
    winner_team TEXT;
    winner_pairing_id TEXT;
    loser_pairing_id TEXT;
    season_points INTEGER;
BEGIN
    -- Skip if already processed or no winning_team
    IF NEW.winning_team IS NULL THEN
        RETURN NEW;
    END IF;

    -- Calculate pairing IDs (sorted player IDs)
    IF NEW.team_a_player1_id < NEW.team_a_player2_id THEN
        winner_pairing_id := CASE WHEN NEW.winning_team = 'A'
            THEN NEW.team_a_player1_id || '_' || NEW.team_a_player2_id
            ELSE NEW.team_b_player1_id || '_' || NEW.team_b_player2_id END;
        loser_pairing_id := CASE WHEN NEW.winning_team = 'A'
            THEN NEW.team_b_player1_id || '_' || NEW.team_b_player2_id
            ELSE NEW.team_a_player1_id || '_' || NEW.team_a_player2_id END;
    ELSE
        winner_pairing_id := CASE WHEN NEW.winning_team = 'A'
            THEN NEW.team_a_player2_id || '_' || NEW.team_a_player1_id
            ELSE NEW.team_b_player2_id || '_' || NEW.team_b_player1_id END;
        loser_pairing_id := CASE WHEN NEW.winning_team = 'A'
            THEN NEW.team_b_player2_id || '_' || NEW.team_b_player1_id
            ELSE NEW.team_a_player2_id || '_' || NEW.team_a_player1_id END;
    END IF;

    -- Get or create pairings with their ELO ratings
    INSERT INTO doubles_pairings (id, player1_id, player2_id, club_id, player1_name, player2_name)
    SELECT
        winner_pairing_id,
        LEAST(
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_a_player1_id ELSE NEW.team_b_player1_id END,
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_a_player2_id ELSE NEW.team_b_player2_id END
        ),
        GREATEST(
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_a_player1_id ELSE NEW.team_b_player1_id END,
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_a_player2_id ELSE NEW.team_b_player2_id END
        ),
        NEW.club_id,
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id =
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_a_player1_id ELSE NEW.team_b_player1_id END),
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id =
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_a_player2_id ELSE NEW.team_b_player2_id END)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO doubles_pairings (id, player1_id, player2_id, club_id, player1_name, player2_name)
    SELECT
        loser_pairing_id,
        LEAST(
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_b_player1_id ELSE NEW.team_a_player1_id END,
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_b_player2_id ELSE NEW.team_a_player2_id END
        ),
        GREATEST(
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_b_player1_id ELSE NEW.team_a_player1_id END,
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_b_player2_id ELSE NEW.team_a_player2_id END
        ),
        NEW.club_id,
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id =
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_b_player1_id ELSE NEW.team_a_player1_id END),
        (SELECT first_name || ' ' || last_name FROM profiles WHERE id =
            CASE WHEN NEW.winning_team = 'A' THEN NEW.team_b_player2_id ELSE NEW.team_a_player2_id END)
    ON CONFLICT (id) DO NOTHING;

    -- Get current ELO ratings
    SELECT COALESCE(current_elo_rating, 1000) INTO winner_elo
    FROM doubles_pairings WHERE id = winner_pairing_id;

    SELECT COALESCE(current_elo_rating, 1000) INTO loser_elo
    FROM doubles_pairings WHERE id = loser_pairing_id;

    -- Calculate ELO change
    elo_delta := ROUND(k_factor * (1.0 - (1.0 / (1.0 + POWER(10.0, (loser_elo - winner_elo)::NUMERIC / 400.0)))));

    -- Update winner pairing
    UPDATE doubles_pairings
    SET
        matches_played = matches_played + 1,
        matches_won = matches_won + 1,
        current_elo_rating = current_elo_rating + elo_delta,
        win_rate = (matches_won + 1)::REAL / (matches_played + 1)::REAL,
        last_played = NOW()
    WHERE id = winner_pairing_id;

    -- Update loser pairing
    UPDATE doubles_pairings
    SET
        matches_played = matches_played + 1,
        matches_lost = matches_lost + 1,
        current_elo_rating = GREATEST(100, current_elo_rating - elo_delta),
        win_rate = matches_won::REAL / (matches_played + 1)::REAL,
        last_played = NOW()
    WHERE id = loser_pairing_id;

    -- Update individual player stats
    UPDATE profiles
    SET
        doubles_matches_played = COALESCE(doubles_matches_played, 0) + 1,
        doubles_matches_won = CASE
            WHEN id IN (
                CASE WHEN NEW.winning_team = 'A' THEN NEW.team_a_player1_id ELSE NEW.team_b_player1_id END,
                CASE WHEN NEW.winning_team = 'A' THEN NEW.team_a_player2_id ELSE NEW.team_b_player2_id END
            ) THEN COALESCE(doubles_matches_won, 0) + 1
            ELSE COALESCE(doubles_matches_won, 0)
        END,
        doubles_matches_lost = CASE
            WHEN id IN (
                CASE WHEN NEW.winning_team = 'A' THEN NEW.team_b_player1_id ELSE NEW.team_a_player1_id END,
                CASE WHEN NEW.winning_team = 'A' THEN NEW.team_b_player2_id ELSE NEW.team_a_player2_id END
            ) THEN COALESCE(doubles_matches_lost, 0) + 1
            ELSE COALESCE(doubles_matches_lost, 0)
        END
    WHERE id IN (
        NEW.team_a_player1_id, NEW.team_a_player2_id,
        NEW.team_b_player1_id, NEW.team_b_player2_id
    );

    RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS process_doubles_match_trigger ON doubles_matches;
CREATE TRIGGER process_doubles_match_trigger
    AFTER INSERT ON doubles_matches
    FOR EACH ROW
    EXECUTE FUNCTION process_doubles_match();

-- =========================================
-- APPROVED REQUEST PROCESSING TRIGGER
-- =========================================

CREATE OR REPLACE FUNCTION process_approved_doubles_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only process when status changes to 'approved'
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        -- Create the doubles match from the request
        INSERT INTO doubles_matches (
            club_id,
            team_a_player1_id,
            team_a_player2_id,
            team_b_player1_id,
            team_b_player2_id,
            winning_team,
            sets,
            match_mode,
            handicap_used,
            handicap,
            is_cross_club,
            created_by
        ) VALUES (
            NEW.club_id,
            (NEW.team_a->>'player1_id')::UUID,
            (NEW.team_a->>'player2_id')::UUID,
            (NEW.team_b->>'player1_id')::UUID,
            (NEW.team_b->>'player2_id')::UUID,
            NEW.winning_team,
            NEW.sets,
            COALESCE(NEW.match_mode, 'best-of-5'),
            COALESCE(NEW.handicap_used, false),
            NEW.handicap,
            NEW.is_cross_club,
            NEW.initiated_by
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS process_approved_doubles_request_trigger ON doubles_match_requests;
CREATE TRIGGER process_approved_doubles_request_trigger
    AFTER UPDATE ON doubles_match_requests
    FOR EACH ROW
    EXECUTE FUNCTION process_approved_doubles_request();
