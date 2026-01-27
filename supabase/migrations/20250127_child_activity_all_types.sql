-- ============================================
-- Extended Child Activity Access Functions
-- ============================================
-- Diese Migration erweitert die RPC-Funktion für Child Sessions,
-- um alle Aktivitätstypen zu laden:
-- - Singles Matches
-- - Doubles Matches
-- - Activity Events (club_join, club_leave, rank_up, ranking changes)
-- - Community Posts
-- - Community Polls
-- ============================================

-- ============================================
-- PART 1: Extended get_club_activities_for_child_session
-- ============================================

CREATE OR REPLACE FUNCTION get_club_activities_for_child_session(
    p_session_token TEXT,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_valid BOOLEAN;
    v_child_id UUID;
    v_error TEXT;
    v_club_id UUID;
    v_matches JSON;
    v_doubles_matches JSON;
    v_activity_events JSON;
    v_community_posts JSON;
    v_community_polls JSON;
    v_member_ids UUID[];
BEGIN
    -- Validate session token
    SELECT is_valid, child_id, error_message
    INTO v_session_valid, v_child_id, v_error
    FROM validate_child_session_token(p_session_token);

    IF NOT v_session_valid THEN
        RETURN json_build_object('success', false, 'error', COALESCE(v_error, 'Ungültige Session'));
    END IF;

    -- Get child's club_id
    SELECT club_id INTO v_club_id FROM profiles WHERE id = v_child_id;

    IF v_club_id IS NULL THEN
        RETURN json_build_object(
            'success', true,
            'matches', '[]'::json,
            'doubles_matches', '[]'::json,
            'activity_events', '[]'::json,
            'community_posts', '[]'::json,
            'community_polls', '[]'::json,
            'member_ids', '[]'::json
        );
    END IF;

    -- Get all member IDs from the child's club
    SELECT ARRAY_AGG(id) INTO v_member_ids
    FROM profiles
    WHERE club_id = v_club_id;

    -- ============================================
    -- 1. Singles Matches
    -- ============================================
    SELECT json_agg(m ORDER BY m.created_at DESC)
    INTO v_matches
    FROM (
        SELECT
            id,
            player_a_id,
            player_b_id,
            winner_id,
            loser_id,
            sets,
            winner_elo_change,
            loser_elo_change,
            match_mode,
            handicap,
            played_at,
            created_at
        FROM matches
        WHERE (player_a_id = ANY(v_member_ids) OR player_b_id = ANY(v_member_ids))
        ORDER BY created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) m;

    -- ============================================
    -- 2. Doubles Matches
    -- ============================================
    SELECT json_agg(dm ORDER BY dm.created_at DESC)
    INTO v_doubles_matches
    FROM (
        SELECT
            id,
            team_a_player1_id,
            team_a_player2_id,
            team_b_player1_id,
            team_b_player2_id,
            winning_team,
            sets,
            team_a_sets_won,
            team_b_sets_won,
            played_at,
            created_at
        FROM doubles_matches
        WHERE (
            team_a_player1_id = ANY(v_member_ids) OR
            team_a_player2_id = ANY(v_member_ids) OR
            team_b_player1_id = ANY(v_member_ids) OR
            team_b_player2_id = ANY(v_member_ids)
        )
        ORDER BY created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) dm;

    -- ============================================
    -- 3. Activity Events (club_join, club_leave, rank_up, ranking changes)
    -- ============================================
    SELECT json_agg(ae ORDER BY ae.created_at DESC)
    INTO v_activity_events
    FROM (
        SELECT
            id,
            user_id,
            club_id,
            event_type,
            event_data,
            created_at
        FROM activity_events
        WHERE user_id = ANY(v_member_ids)
        ORDER BY created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) ae;

    -- ============================================
    -- 4. Community Posts (club visibility or public from club members)
    -- ============================================
    SELECT json_agg(cp ORDER BY cp.created_at DESC)
    INTO v_community_posts
    FROM (
        SELECT
            id,
            user_id,
            club_id,
            content,
            image_url,
            visibility,
            likes_count,
            comments_count,
            created_at
        FROM community_posts
        WHERE deleted_at IS NULL
        AND (
            -- Club posts from club members
            (club_id = v_club_id)
            OR
            -- Public/followers posts from club members
            (user_id = ANY(v_member_ids) AND visibility IN ('public', 'followers'))
        )
        -- Exclude training summaries (they have special format)
        AND content NOT LIKE 'TRAINING_SUMMARY|%'
        ORDER BY created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) cp;

    -- ============================================
    -- 5. Community Polls (club visibility or public from club members)
    -- ============================================
    SELECT json_agg(poll ORDER BY poll.created_at DESC)
    INTO v_community_polls
    FROM (
        SELECT
            id,
            user_id,
            club_id,
            question,
            options,
            visibility,
            duration_days,
            ends_at,
            total_votes,
            comments_count,
            created_at
        FROM community_polls
        WHERE deleted_at IS NULL
        AND (
            -- Club polls from club
            (club_id = v_club_id)
            OR
            -- Public/followers polls from club members
            (user_id = ANY(v_member_ids) AND visibility IN ('public', 'followers'))
        )
        ORDER BY created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) poll;

    RETURN json_build_object(
        'success', true,
        'matches', COALESCE(v_matches, '[]'::json),
        'doubles_matches', COALESCE(v_doubles_matches, '[]'::json),
        'activity_events', COALESCE(v_activity_events, '[]'::json),
        'community_posts', COALESCE(v_community_posts, '[]'::json),
        'community_polls', COALESCE(v_community_polls, '[]'::json),
        'member_ids', to_json(v_member_ids),
        'club_id', v_club_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION get_club_activities_for_child_session TO anon;
GRANT EXECUTE ON FUNCTION get_club_activities_for_child_session TO authenticated;

-- ============================================
-- Verification
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Extended Child Activity Access Installed!';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'The get_club_activities_for_child_session function now returns:';
    RAISE NOTICE '  - matches (singles)';
    RAISE NOTICE '  - doubles_matches';
    RAISE NOTICE '  - activity_events (club_join, club_leave, rank_up, ranking changes)';
    RAISE NOTICE '  - community_posts';
    RAISE NOTICE '  - community_polls';
    RAISE NOTICE '  - member_ids';
    RAISE NOTICE '  - club_id';
    RAISE NOTICE '===========================================';
END $$;
