-- ============================================
-- Child Mode Privacy Settings Fix
-- ============================================
-- Diese Migration stellt sicher, dass die Privacy-Einstellungen
-- auch im Child Mode respektiert werden:
-- - Spieler mit leaderboard_visibility='none' werden aus Ranglisten ausgeblendet
-- - Matches von Spielern mit matches_visibility='none' werden nicht gezeigt
-- ============================================

-- ============================================
-- PART 1: Fix get_leaderboard_for_child_session
-- Exclude players with leaderboard_visibility='none' from leaderboards
-- Note: Uses leaderboard_visibility (NOT searchable!) for leaderboard filtering
-- ============================================

CREATE OR REPLACE FUNCTION get_leaderboard_for_child_session(
    p_session_token TEXT,
    p_club_id UUID,
    p_type TEXT DEFAULT 'skill',
    p_limit INT DEFAULT 50
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_valid BOOLEAN;
    v_child_id UUID;
    v_child_club_id UUID;
    v_error TEXT;
    v_leaderboard JSON;
BEGIN
    -- Validate session token
    SELECT is_valid, child_id, error_message
    INTO v_session_valid, v_child_id, v_error
    FROM validate_child_session_token(p_session_token);

    IF NOT v_session_valid THEN
        RETURN json_build_object('success', false, 'error', COALESCE(v_error, 'Ungültige Session'));
    END IF;

    -- Get child's club_id for privacy context
    SELECT club_id INTO v_child_club_id FROM profiles WHERE id = v_child_id;

    IF p_type = 'skill' THEN
        SELECT json_agg(row_to_json(t)) INTO v_leaderboard FROM (
            SELECT p.id, p.first_name, p.last_name, p.display_name, p.avatar_url,
                   p.elo_rating, p.xp, p.club_id, c.name as club_name
            FROM profiles p
            LEFT JOIN clubs c ON c.id = p.club_id
            WHERE (p_club_id IS NULL OR p.club_id = p_club_id)
            AND p.is_player = true
            -- Privacy filter: use leaderboard_visibility (NOT searchable!)
            AND (
                -- Own profile always visible
                p.id = v_child_id
                OR
                -- Same club members visible (unless leaderboard_visibility='none')
                (v_child_club_id IS NOT NULL AND p.club_id = v_child_club_id
                 AND COALESCE(p.privacy_settings->>'leaderboard_visibility', 'global') != 'none')
                OR
                -- Global visibility
                (COALESCE(p.privacy_settings->>'leaderboard_visibility', 'global') = 'global')
            )
            ORDER BY p.elo_rating DESC NULLS LAST
            LIMIT p_limit
        ) t;
    ELSIF p_type = 'effort' THEN
        SELECT json_agg(row_to_json(t)) INTO v_leaderboard FROM (
            SELECT p.id, p.first_name, p.last_name, p.display_name, p.avatar_url,
                   p.elo_rating, p.xp, p.club_id, c.name as club_name
            FROM profiles p
            LEFT JOIN clubs c ON c.id = p.club_id
            WHERE (p_club_id IS NULL OR p.club_id = p_club_id)
            AND p.is_player = true
            -- Privacy filter: use leaderboard_visibility
            AND (
                p.id = v_child_id
                OR
                (v_child_club_id IS NOT NULL AND p.club_id = v_child_club_id
                 AND COALESCE(p.privacy_settings->>'leaderboard_visibility', 'global') != 'none')
                OR
                (COALESCE(p.privacy_settings->>'leaderboard_visibility', 'global') = 'global')
            )
            ORDER BY p.xp DESC NULLS LAST
            LIMIT p_limit
        ) t;
    ELSE
        SELECT json_agg(row_to_json(t)) INTO v_leaderboard FROM (
            SELECT p.id, p.first_name, p.last_name, p.display_name, p.avatar_url,
                   p.elo_rating, p.xp, p.points, p.club_id, c.name as club_name
            FROM profiles p
            LEFT JOIN clubs c ON c.id = p.club_id
            WHERE (p_club_id IS NULL OR p.club_id = p_club_id)
            AND p.is_player = true
            -- Privacy filter: use leaderboard_visibility
            AND (
                p.id = v_child_id
                OR
                (v_child_club_id IS NOT NULL AND p.club_id = v_child_club_id
                 AND COALESCE(p.privacy_settings->>'leaderboard_visibility', 'global') != 'none')
                OR
                (COALESCE(p.privacy_settings->>'leaderboard_visibility', 'global') = 'global')
            )
            ORDER BY p.points DESC NULLS LAST
            LIMIT p_limit
        ) t;
    END IF;

    RETURN json_build_object('success', true, 'leaderboard', COALESCE(v_leaderboard, '[]'::json));
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION get_leaderboard_for_child_session TO anon;
GRANT EXECUTE ON FUNCTION get_leaderboard_for_child_session TO authenticated;

-- ============================================
-- PART 2: Fix get_club_activities_for_child_session
-- Respect matches_visibility privacy setting
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

    -- Get ALL member IDs from the child's club (NO privacy filter here!)
    -- Privacy filtering happens in each individual query with the appropriate field
    SELECT ARRAY_AGG(id) INTO v_member_ids
    FROM profiles
    WHERE club_id = v_club_id
    AND is_player = true;

    -- ============================================
    -- 1. Singles Matches (with matches_visibility filter)
    -- ============================================
    SELECT json_agg(m ORDER BY m.created_at DESC)
    INTO v_matches
    FROM (
        SELECT
            mat.id,
            mat.player_a_id,
            mat.player_b_id,
            mat.winner_id,
            mat.loser_id,
            mat.sets,
            mat.winner_elo_change,
            mat.loser_elo_change,
            mat.match_mode,
            mat.handicap,
            mat.played_at,
            mat.created_at
        FROM matches mat
        JOIN profiles pa ON pa.id = mat.player_a_id
        JOIN profiles pb ON pb.id = mat.player_b_id
        WHERE (mat.player_a_id = ANY(v_member_ids) OR mat.player_b_id = ANY(v_member_ids))
        -- Privacy check using matches_visibility
        AND (
            -- Child is a player in this match - always visible
            mat.player_a_id = v_child_id OR mat.player_b_id = v_child_id
            OR
            -- Both players allow visibility based on matches_visibility
            (
                -- Player A visibility check
                (
                    COALESCE(pa.privacy_settings->>'matches_visibility', 'global') = 'global'
                    OR (COALESCE(pa.privacy_settings->>'matches_visibility', 'global') IN ('club_only', 'followers_only') AND pa.club_id = v_club_id)
                )
                AND
                -- Player B visibility check
                (
                    COALESCE(pb.privacy_settings->>'matches_visibility', 'global') = 'global'
                    OR (COALESCE(pb.privacy_settings->>'matches_visibility', 'global') IN ('club_only', 'followers_only') AND pb.club_id = v_club_id)
                )
            )
        )
        ORDER BY mat.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) m;

    -- ============================================
    -- 2. Doubles Matches (with matches_visibility filter)
    -- ============================================
    SELECT json_agg(dm ORDER BY dm.created_at DESC)
    INTO v_doubles_matches
    FROM (
        SELECT
            mat.id,
            mat.team_a_player1_id,
            mat.team_a_player2_id,
            mat.team_b_player1_id,
            mat.team_b_player2_id,
            mat.winning_team,
            mat.sets,
            mat.team_a_sets_won,
            mat.team_b_sets_won,
            mat.played_at,
            mat.created_at
        FROM doubles_matches mat
        JOIN profiles p1 ON p1.id = mat.team_a_player1_id
        JOIN profiles p2 ON p2.id = mat.team_a_player2_id
        JOIN profiles p3 ON p3.id = mat.team_b_player1_id
        JOIN profiles p4 ON p4.id = mat.team_b_player2_id
        WHERE (
            mat.team_a_player1_id = ANY(v_member_ids) OR
            mat.team_a_player2_id = ANY(v_member_ids) OR
            mat.team_b_player1_id = ANY(v_member_ids) OR
            mat.team_b_player2_id = ANY(v_member_ids)
        )
        -- Privacy check using matches_visibility
        AND (
            -- Child is a player - always visible
            mat.team_a_player1_id = v_child_id OR mat.team_a_player2_id = v_child_id
            OR mat.team_b_player1_id = v_child_id OR mat.team_b_player2_id = v_child_id
            OR
            -- All 4 players allow visibility
            (
                -- Player 1
                (
                    COALESCE(p1.privacy_settings->>'matches_visibility', 'global') = 'global'
                    OR (COALESCE(p1.privacy_settings->>'matches_visibility', 'global') IN ('club_only', 'followers_only') AND p1.club_id = v_club_id)
                )
                AND
                -- Player 2
                (
                    COALESCE(p2.privacy_settings->>'matches_visibility', 'global') = 'global'
                    OR (COALESCE(p2.privacy_settings->>'matches_visibility', 'global') IN ('club_only', 'followers_only') AND p2.club_id = v_club_id)
                )
                AND
                -- Player 3
                (
                    COALESCE(p3.privacy_settings->>'matches_visibility', 'global') = 'global'
                    OR (COALESCE(p3.privacy_settings->>'matches_visibility', 'global') IN ('club_only', 'followers_only') AND p3.club_id = v_club_id)
                )
                AND
                -- Player 4
                (
                    COALESCE(p4.privacy_settings->>'matches_visibility', 'global') = 'global'
                    OR (COALESCE(p4.privacy_settings->>'matches_visibility', 'global') IN ('club_only', 'followers_only') AND p4.club_id = v_club_id)
                )
            )
        )
        ORDER BY mat.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) dm;

    -- ============================================
    -- 3. Activity Events (with searchable filter)
    -- For general activity events, searchable is appropriate
    -- ============================================
    SELECT json_agg(ae ORDER BY ae.created_at DESC)
    INTO v_activity_events
    FROM (
        SELECT
            ev.id,
            ev.user_id,
            ev.club_id,
            ev.event_type,
            ev.event_data,
            ev.created_at
        FROM activity_events ev
        JOIN profiles p ON p.id = ev.user_id
        WHERE ev.user_id = ANY(v_member_ids)
        -- Privacy using searchable
        AND (
            ev.user_id = v_child_id
            OR COALESCE(p.privacy_settings->>'searchable', 'global') = 'global'
            OR (COALESCE(p.privacy_settings->>'searchable', 'global') IN ('club_only', 'followers_only') AND p.club_id = v_club_id)
        )
        ORDER BY ev.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) ae;

    -- ============================================
    -- 4. Community Posts (with searchable filter)
    -- ============================================
    SELECT json_agg(cp ORDER BY cp.created_at DESC)
    INTO v_community_posts
    FROM (
        SELECT
            post.id,
            post.user_id,
            post.club_id,
            post.content,
            post.image_url,
            post.visibility,
            post.likes_count,
            post.comments_count,
            post.created_at
        FROM community_posts post
        JOIN profiles p ON p.id = post.user_id
        WHERE post.deleted_at IS NULL
        AND (
            (post.club_id = v_club_id)
            OR
            (post.user_id = ANY(v_member_ids) AND post.visibility IN ('public', 'followers'))
        )
        -- Privacy using searchable
        AND (
            post.user_id = v_child_id
            OR COALESCE(p.privacy_settings->>'searchable', 'global') = 'global'
            OR (COALESCE(p.privacy_settings->>'searchable', 'global') IN ('club_only', 'followers_only') AND p.club_id = v_club_id)
        )
        -- Exclude training summaries
        AND post.content NOT LIKE 'TRAINING_SUMMARY|%'
        ORDER BY post.created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) cp;

    -- ============================================
    -- 5. Community Polls (with searchable filter)
    -- ============================================
    SELECT json_agg(poll ORDER BY poll.created_at DESC)
    INTO v_community_polls
    FROM (
        SELECT
            pl.id,
            pl.user_id,
            pl.club_id,
            pl.question,
            pl.options,
            pl.visibility,
            pl.duration_days,
            pl.ends_at,
            pl.total_votes,
            pl.comments_count,
            pl.created_at
        FROM community_polls pl
        JOIN profiles p ON p.id = pl.user_id
        WHERE pl.deleted_at IS NULL
        AND (
            (pl.club_id = v_club_id)
            OR
            (pl.user_id = ANY(v_member_ids) AND pl.visibility IN ('public', 'followers'))
        )
        -- Privacy using searchable
        AND (
            pl.user_id = v_child_id
            OR COALESCE(p.privacy_settings->>'searchable', 'global') = 'global'
            OR (COALESCE(p.privacy_settings->>'searchable', 'global') IN ('club_only', 'followers_only') AND p.club_id = v_club_id)
        )
        ORDER BY pl.created_at DESC
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
-- PART 3: Fix get_profiles_for_child_session
-- Respect privacy settings when fetching profiles
-- ============================================

CREATE OR REPLACE FUNCTION get_profiles_for_child_session(
    p_session_token TEXT,
    p_profile_ids UUID[]
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
    v_child_club_id UUID;
    v_profiles JSON;
BEGIN
    -- Validate session token
    SELECT is_valid, child_id, error_message
    INTO v_session_valid, v_child_id, v_error
    FROM validate_child_session_token(p_session_token);

    IF NOT v_session_valid THEN
        RETURN json_build_object('success', false, 'error', COALESCE(v_error, 'Ungültige Session'));
    END IF;

    -- Get child's club_id for privacy filtering
    SELECT club_id INTO v_child_club_id FROM profiles WHERE id = v_child_id;

    -- Get profiles - respect privacy settings
    SELECT json_agg(json_build_object(
        'id', p.id,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'elo_rating', p.elo_rating,
        'club_id', p.club_id,
        'privacy_settings', p.privacy_settings
    ))
    INTO v_profiles
    FROM profiles p
    WHERE p.id = ANY(p_profile_ids)
    AND (
        -- Own profile always visible
        p.id = v_child_id
        OR
        -- Same club members (unless searchable='none')
        (
            v_child_club_id IS NOT NULL
            AND p.club_id = v_child_club_id
            AND COALESCE(p.privacy_settings->>'searchable', 'global') != 'none'
        )
        OR
        -- Global visibility
        (COALESCE(p.privacy_settings->>'searchable', 'global') = 'global')
        -- Note: 'club_only' users are only visible to same club (handled above)
        -- 'friends_only' not applicable for child sessions (no following)
        -- 'none' always hidden
    );

    RETURN json_build_object(
        'success', true,
        'profiles', COALESCE(v_profiles, '[]'::json)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION get_profiles_for_child_session TO anon;
GRANT EXECUTE ON FUNCTION get_profiles_for_child_session TO authenticated;

-- ============================================
-- Verification
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Child Mode Privacy Fix Applied!';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Fixed functions:';
    RAISE NOTICE '  - get_leaderboard_for_child_session: uses leaderboard_visibility';
    RAISE NOTICE '  - get_club_activities_for_child_session: respects matches_visibility';
    RAISE NOTICE '  - get_profiles_for_child_session: respects searchable setting';
    RAISE NOTICE '';
    RAISE NOTICE 'Privacy rules applied:';
    RAISE NOTICE '  - leaderboard_visibility=none: hidden from leaderboard';
    RAISE NOTICE '  - leaderboard_visibility=club_only: visible only to same club';
    RAISE NOTICE '  - leaderboard_visibility=global: visible to everyone';
    RAISE NOTICE '  - matches_visibility=none: matches not shown';
    RAISE NOTICE '  - matches_visibility=club_only: matches visible to same club';
    RAISE NOTICE '===========================================';
END $$;
