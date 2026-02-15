-- =====================================================
-- Match Corrections - Schema & Reversal Function
-- =====================================================
-- Allows players to request corrections on accepted matches.
-- Correction = reverse old match effects + insert new match.
-- Old match stays as audit trail with is_corrected = true.
-- =====================================================

-- =====================================================
-- STEP 1: New columns on match_requests
-- =====================================================

-- Links a correction request to the original match
ALTER TABLE match_requests
ADD COLUMN IF NOT EXISTS corrects_match_id UUID REFERENCES matches(id) ON DELETE SET NULL;

-- Reason for the correction
ALTER TABLE match_requests
ADD COLUMN IF NOT EXISTS correction_reason TEXT;

-- =====================================================
-- STEP 2: New columns on matches
-- =====================================================

-- Marks superseded matches
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS is_corrected BOOLEAN DEFAULT FALSE;

-- Points to the replacement match
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS corrected_by_match_id UUID REFERENCES matches(id) ON DELETE SET NULL;

-- =====================================================
-- STEP 3: Unique partial index to prevent concurrent corrections
-- =====================================================
-- Only one pending correction request per match at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_correction
ON match_requests(corrects_match_id)
WHERE corrects_match_id IS NOT NULL
AND status IN ('pending_player', 'pending_coach', 'approved');

-- =====================================================
-- STEP 4: reverse_match_effects() function
-- =====================================================
-- SECURITY DEFINER to bypass RLS for profile updates.
-- Validates, reverses Elo/XP/points/wins/losses, updates H2H, marks match.

CREATE OR REPLACE FUNCTION reverse_match_effects(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_match RECORD;
    v_season RECORD;
    v_winner_elo_change INTEGER;
    v_loser_elo_change INTEGER;
    v_season_points INTEGER;
    v_xp_gain INTEGER;
    v_h2h_id UUID;
    v_ordered_a UUID;
    v_ordered_b UUID;
BEGIN
    -- 1. Fetch the match
    SELECT * INTO v_match
    FROM matches
    WHERE id = p_match_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Match not found');
    END IF;

    -- 1b. Verify caller is a participant (skip for internal/service calls)
    IF auth.uid() IS NOT NULL
       AND auth.uid() != v_match.player_a_id
       AND auth.uid() != v_match.player_b_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: not a match participant');
    END IF;

    -- 2. Check not already corrected
    IF v_match.is_corrected = true THEN
        RETURN jsonb_build_object('success', false, 'error', 'Match already corrected');
    END IF;

    -- 3. Check not a tournament match
    IF v_match.tournament_match_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Tournament matches cannot be corrected');
    END IF;

    -- 4. Check within current season
    IF v_match.sport_id IS NOT NULL THEN
        SELECT s.id, s.start_date, s.end_date INTO v_season
        FROM seasons s
        WHERE s.sport_id = v_match.sport_id
        AND s.is_active = true
        LIMIT 1;

        IF FOUND THEN
            IF v_match.played_at::date < v_season.start_date THEN
                RETURN jsonb_build_object('success', false, 'error', 'Match is from a previous season');
            END IF;
        END IF;
    END IF;

    -- 5. Read stored values
    v_winner_elo_change := COALESCE(v_match.winner_elo_change, 0);
    v_loser_elo_change := COALESCE(v_match.loser_elo_change, 0);
    v_season_points := COALESCE(v_match.season_points_awarded, 0);

    -- XP: for non-handicap matches xp_gain = winner_elo_change, for handicap xp_gain = 0
    IF COALESCE(v_match.handicap_used, false) THEN
        v_xp_gain := 0;
    ELSE
        v_xp_gain := v_winner_elo_change;
    END IF;

    -- 6. Reverse winner profile
    -- Floor at 400 for elo, 0 for others. Do NOT touch highest_elo.
    UPDATE profiles SET
        elo_rating = GREATEST(400, COALESCE(elo_rating, 800) - v_winner_elo_change),
        points = GREATEST(0, COALESCE(points, 0) - v_season_points),
        xp = GREATEST(0, COALESCE(xp, 0) - v_xp_gain),
        wins = GREATEST(0, COALESCE(wins, 0) - 1),
        singles_matches_played = GREATEST(0, COALESCE(singles_matches_played, 0) - 1),
        updated_at = NOW()
    WHERE id = v_match.winner_id;

    -- 7. Reverse loser profile
    -- loser_elo_change is negative, so subtracting it adds elo back
    UPDATE profiles SET
        elo_rating = GREATEST(400, COALESCE(elo_rating, 800) - v_loser_elo_change),
        losses = GREATEST(0, COALESCE(losses, 0) - 1),
        singles_matches_played = GREATEST(0, COALESCE(singles_matches_played, 0) - 1),
        updated_at = NOW()
    WHERE id = v_match.loser_id;

    -- 8. Create reversal entries in points_history
    INSERT INTO points_history (user_id, points, reason, created_at, elo_change, xp)
    VALUES
        (v_match.winner_id, -v_season_points, 'Korrektur', NOW(), -v_winner_elo_change, -v_xp_gain),
        (v_match.loser_id, 0, 'Korrektur', NOW(), -v_loser_elo_change, 0);

    -- 9. Reset H2H stats for the player pair
    -- Decrement match/win counts, reset streak to 0
    IF v_match.winner_id < v_match.loser_id THEN
        v_ordered_a := v_match.winner_id;
        v_ordered_b := v_match.loser_id;
    ELSE
        v_ordered_a := v_match.loser_id;
        v_ordered_b := v_match.winner_id;
    END IF;

    UPDATE head_to_head_stats SET
        total_matches = GREATEST(0, total_matches - 1),
        player_a_wins = CASE
            WHEN v_match.winner_id = player_a_id THEN GREATEST(0, player_a_wins - 1)
            ELSE player_a_wins
        END,
        player_b_wins = CASE
            WHEN v_match.winner_id = player_b_id THEN GREATEST(0, player_b_wins - 1)
            ELSE player_b_wins
        END,
        -- TODO: Streak reset to 0 for MVP. Full recalculation from match history
        -- would be more accurate but expensive. Track as tech debt.
        consecutive_wins = 0,
        current_streak_winner_id = NULL,
        suggested_handicap = 0,
        last_winner_id = NULL,
        updated_at = NOW()
    WHERE player_a_id = v_ordered_a AND player_b_id = v_ordered_b;

    -- 10. Mark match as corrected
    UPDATE matches SET
        is_corrected = true
    WHERE id = p_match_id;

    RETURN jsonb_build_object(
        'success', true,
        'reversed_winner_elo', v_winner_elo_change,
        'reversed_loser_elo', v_loser_elo_change,
        'reversed_season_points', v_season_points,
        'reversed_xp', v_xp_gain
    );
END;
$$;

-- =====================================================
-- STEP 5: Index for efficient queries
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_matches_is_corrected
ON matches(is_corrected) WHERE is_corrected = true;

CREATE INDEX IF NOT EXISTS idx_match_requests_corrects
ON match_requests(corrects_match_id) WHERE corrects_match_id IS NOT NULL;

-- =====================================================
-- STEP 6: accept_match_correction() - atomic correction
-- =====================================================
-- Single RPC that handles the entire accept flow in one transaction:
-- validates request, updates status, reverses old match, creates new match.
-- If any step fails, everything is rolled back.

CREATE OR REPLACE FUNCTION accept_match_correction(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request RECORD;
    v_original_match RECORD;
    v_new_match_id UUID;
    v_reverse_result JSONB;
BEGIN
    -- 1. Fetch and validate the correction request
    SELECT * INTO v_request
    FROM match_requests
    WHERE id = p_request_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Correction request not found');
    END IF;

    IF v_request.corrects_match_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not a correction request');
    END IF;

    IF v_request.status NOT IN ('pending_player', 'pending_coach') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request already processed');
    END IF;

    -- 2. Verify caller is the opponent (player_b accepts)
    IF auth.uid() != v_request.player_b_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only the opponent can accept a correction');
    END IF;

    -- 3. Update request status to approved
    UPDATE match_requests
    SET status = 'approved',
        approvals = jsonb_set(
            COALESCE(approvals::jsonb, '{}'::jsonb),
            '{player_b}',
            'true'::jsonb
        ),
        updated_at = NOW()
    WHERE id = p_request_id;

    -- 4. Reverse old match effects
    v_reverse_result := reverse_match_effects(v_request.corrects_match_id);

    IF NOT (v_reverse_result->>'success')::boolean THEN
        RAISE EXCEPTION 'Reversal failed: %', v_reverse_result->>'error';
    END IF;

    -- 5. Get original match's played_at for the new match
    SELECT played_at INTO v_original_match
    FROM matches
    WHERE id = v_request.corrects_match_id;

    -- 6. Insert the corrected match
    INSERT INTO matches (
        player_a_id, player_b_id, sport_id, club_id,
        winner_id, loser_id, sets,
        player_a_sets_won, player_b_sets_won,
        handicap_used, match_mode, played_at
    ) VALUES (
        v_request.player_a_id, v_request.player_b_id,
        v_request.sport_id, v_request.club_id,
        v_request.winner_id, v_request.loser_id,
        v_request.sets,
        COALESCE(v_request.player_a_sets_won, 0),
        COALESCE(v_request.player_b_sets_won, 0),
        COALESCE(v_request.handicap_used, false),
        COALESCE(v_request.match_mode, 'best-of-5'),
        COALESCE(v_original_match.played_at, v_request.created_at)
    ) RETURNING id INTO v_new_match_id;

    -- 7. Link old match to new match
    UPDATE matches
    SET corrected_by_match_id = v_new_match_id
    WHERE id = v_request.corrects_match_id;

    RETURN jsonb_build_object(
        'success', true,
        'new_match_id', v_new_match_id
    );

EXCEPTION
    WHEN OTHERS THEN
        -- Entire transaction rolls back on any failure
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- =====================================================
-- STEP 7: Trigger to validate correction participant
-- =====================================================
-- Ensures correction requests can only be created by participants
-- of the original match. Prevents bypassing client-side checks.

CREATE OR REPLACE FUNCTION validate_correction_participant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.corrects_match_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM matches
            WHERE id = NEW.corrects_match_id
            AND (player_a_id = auth.uid() OR player_b_id = auth.uid())
        ) THEN
            RAISE EXCEPTION 'You must be a participant of the original match to request a correction';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_correction_participant ON match_requests;
CREATE TRIGGER trg_validate_correction_participant
BEFORE INSERT ON match_requests
FOR EACH ROW
EXECUTE FUNCTION validate_correction_participant();

-- =====================================================
-- Verification
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE 'Match Corrections migration applied:';
    RAISE NOTICE '- match_requests.corrects_match_id, correction_reason columns added';
    RAISE NOTICE '- matches.is_corrected, corrected_by_match_id columns added';
    RAISE NOTICE '- Unique partial index prevents concurrent corrections (incl. approved)';
    RAISE NOTICE '- reverse_match_effects() reverses Elo/XP/points/wins/losses/H2H';
    RAISE NOTICE '- accept_match_correction() atomic accept flow (status + reversal + new match)';
    RAISE NOTICE '- Trigger validates correction requester is a match participant';
END $$;
