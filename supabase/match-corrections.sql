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
AND status IN ('pending_player', 'pending_coach');

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
        -- Reset streak (recalculating from history is too expensive for MVP)
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
-- Verification
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE 'Match Corrections migration applied:';
    RAISE NOTICE '- match_requests.corrects_match_id, correction_reason columns added';
    RAISE NOTICE '- matches.is_corrected, corrected_by_match_id columns added';
    RAISE NOTICE '- Unique partial index prevents concurrent corrections';
    RAISE NOTICE '- reverse_match_effects() reverses Elo/XP/points/wins/losses/H2H';
END $$;
