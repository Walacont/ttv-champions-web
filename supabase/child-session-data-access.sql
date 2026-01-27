-- ============================================
-- Child Session Data Access Functions
-- ============================================
-- These SECURITY DEFINER functions allow children logged in via PIN
-- to access data that would otherwise be blocked by RLS.
-- ============================================

-- ============================================
-- PART 1: View any profile (for child sessions)
-- ============================================

CREATE OR REPLACE FUNCTION get_profile_for_child_session(
    p_child_id UUID,  -- The logged-in child's ID (for validation)
    p_profile_id UUID -- The profile to view
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_valid_session BOOLEAN;
    v_profile RECORD;
    v_club RECORD;
BEGIN
    -- Verify the child has valid PIN credentials
    SELECT EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = p_child_id
        AND p.pin_hash IS NOT NULL
        AND (
            p.account_type = 'child'
            OR p.is_offline = TRUE
            OR EXISTS (SELECT 1 FROM guardian_links gl WHERE gl.child_id = p.id)
        )
    ) INTO v_has_valid_session;

    IF NOT v_has_valid_session THEN
        RETURN json_build_object('success', false, 'error', 'Keine gültige Sitzung');
    END IF;

    -- Get the requested profile
    SELECT
        p.id,
        p.first_name,
        p.last_name,
        p.display_name,
        p.avatar_url,
        p.elo_rating,
        p.highest_elo,
        p.points,
        p.xp,
        p.grundlagen_completed,
        p.club_id,
        p.privacy_settings,
        p.age_mode
    INTO v_profile
    FROM profiles p
    WHERE p.id = p_profile_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Profil nicht gefunden');
    END IF;

    -- Get club if exists
    IF v_profile.club_id IS NOT NULL THEN
        SELECT id, name INTO v_club FROM clubs WHERE id = v_profile.club_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'profile', json_build_object(
            'id', v_profile.id,
            'first_name', v_profile.first_name,
            'last_name', v_profile.last_name,
            'display_name', v_profile.display_name,
            'avatar_url', v_profile.avatar_url,
            'elo_rating', v_profile.elo_rating,
            'highest_elo', v_profile.highest_elo,
            'points', v_profile.points,
            'xp', v_profile.xp,
            'grundlagen_completed', v_profile.grundlagen_completed,
            'club_id', v_profile.club_id,
            'privacy_settings', v_profile.privacy_settings,
            'age_mode', v_profile.age_mode,
            'clubs', CASE WHEN v_club.id IS NOT NULL THEN
                json_build_object('id', v_club.id, 'name', v_club.name)
            ELSE NULL END
        )
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION get_profile_for_child_session TO anon;
GRANT EXECUTE ON FUNCTION get_profile_for_child_session TO authenticated;

-- ============================================
-- PART 2: Get club leaderboard (for child sessions)
-- ============================================

CREATE OR REPLACE FUNCTION get_leaderboard_for_child_session(
    p_child_id UUID,
    p_club_id UUID,
    p_type TEXT DEFAULT 'skill',  -- 'skill', 'effort', 'season'
    p_limit INT DEFAULT 50
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_valid_session BOOLEAN;
    v_leaderboard JSON;
BEGIN
    -- Verify the child has valid PIN credentials
    SELECT EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = p_child_id
        AND p.pin_hash IS NOT NULL
        AND (
            p.account_type = 'child'
            OR p.is_offline = TRUE
            OR EXISTS (SELECT 1 FROM guardian_links gl WHERE gl.child_id = p.id)
        )
    ) INTO v_has_valid_session;

    IF NOT v_has_valid_session THEN
        RETURN json_build_object('success', false, 'error', 'Keine gültige Sitzung');
    END IF;

    -- Get leaderboard based on type
    IF p_type = 'skill' THEN
        SELECT json_agg(row_to_json(t)) INTO v_leaderboard
        FROM (
            SELECT
                p.id,
                p.first_name,
                p.last_name,
                p.display_name,
                p.avatar_url,
                p.elo_rating,
                p.xp,
                p.club_id,
                c.name as club_name
            FROM profiles p
            LEFT JOIN clubs c ON c.id = p.club_id
            WHERE (p_club_id IS NULL OR p.club_id = p_club_id)
            AND p.is_player = true
            AND (p.leaderboard_preferences->>'skill')::boolean IS NOT FALSE
            ORDER BY p.elo_rating DESC NULLS LAST
            LIMIT p_limit
        ) t;
    ELSIF p_type = 'effort' THEN
        SELECT json_agg(row_to_json(t)) INTO v_leaderboard
        FROM (
            SELECT
                p.id,
                p.first_name,
                p.last_name,
                p.display_name,
                p.avatar_url,
                p.elo_rating,
                p.xp,
                p.club_id,
                c.name as club_name
            FROM profiles p
            LEFT JOIN clubs c ON c.id = p.club_id
            WHERE (p_club_id IS NULL OR p.club_id = p_club_id)
            AND p.is_player = true
            AND (p.leaderboard_preferences->>'effort')::boolean IS NOT FALSE
            ORDER BY p.xp DESC NULLS LAST
            LIMIT p_limit
        ) t;
    ELSE -- season
        SELECT json_agg(row_to_json(t)) INTO v_leaderboard
        FROM (
            SELECT
                p.id,
                p.first_name,
                p.last_name,
                p.display_name,
                p.avatar_url,
                p.elo_rating,
                p.xp,
                p.points,
                p.club_id,
                c.name as club_name
            FROM profiles p
            LEFT JOIN clubs c ON c.id = p.club_id
            WHERE (p_club_id IS NULL OR p.club_id = p_club_id)
            AND p.is_player = true
            AND (p.leaderboard_preferences->>'season')::boolean IS NOT FALSE
            ORDER BY p.points DESC NULLS LAST
            LIMIT p_limit
        ) t;
    END IF;

    RETURN json_build_object(
        'success', true,
        'leaderboard', COALESCE(v_leaderboard, '[]'::json)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION get_leaderboard_for_child_session TO anon;
GRANT EXECUTE ON FUNCTION get_leaderboard_for_child_session TO authenticated;

-- ============================================
-- PART 3: Get recent club activity (for child sessions)
-- ============================================

CREATE OR REPLACE FUNCTION get_club_activity_for_child_session(
    p_child_id UUID,
    p_club_id UUID,
    p_limit INT DEFAULT 20
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_valid_session BOOLEAN;
    v_activities JSON;
BEGIN
    -- Verify the child has valid PIN credentials
    SELECT EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = p_child_id
        AND p.pin_hash IS NOT NULL
        AND (
            p.account_type = 'child'
            OR p.is_offline = TRUE
            OR EXISTS (SELECT 1 FROM guardian_links gl WHERE gl.child_id = p.id)
        )
    ) INTO v_has_valid_session;

    IF NOT v_has_valid_session THEN
        RETURN json_build_object('success', false, 'error', 'Keine gültige Sitzung');
    END IF;

    -- Get recent matches from the club
    SELECT json_agg(row_to_json(t)) INTO v_activities
    FROM (
        SELECT
            m.id,
            m.created_at,
            m.player_a_id,
            m.player_b_id,
            m.player_a_score,
            m.player_b_score,
            m.winner_id,
            pa.first_name as player_a_first_name,
            pa.last_name as player_a_last_name,
            pa.avatar_url as player_a_avatar,
            pb.first_name as player_b_first_name,
            pb.last_name as player_b_last_name,
            pb.avatar_url as player_b_avatar
        FROM matches m
        JOIN profiles pa ON pa.id = m.player_a_id
        JOIN profiles pb ON pb.id = m.player_b_id
        WHERE m.status = 'approved'
        AND (pa.club_id = p_club_id OR pb.club_id = p_club_id)
        ORDER BY m.created_at DESC
        LIMIT p_limit
    ) t;

    RETURN json_build_object(
        'success', true,
        'activities', COALESCE(v_activities, '[]'::json)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION get_club_activity_for_child_session TO anon;
GRANT EXECUTE ON FUNCTION get_club_activity_for_child_session TO authenticated;

-- ============================================
-- Verification
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Child Session Data Access Functions Created:';
    RAISE NOTICE '- get_profile_for_child_session: View any profile';
    RAISE NOTICE '- get_leaderboard_for_child_session: View club leaderboards';
    RAISE NOTICE '- get_club_activity_for_child_session: View recent club matches';
END $$;
