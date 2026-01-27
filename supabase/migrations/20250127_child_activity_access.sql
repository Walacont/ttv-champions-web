-- ============================================
-- Child Activity Access Functions
-- ============================================
-- Diese Migration fügt RPC-Funktionen hinzu, die Kindern
-- den Zugriff auf Club-Aktivitäten und Profile ermöglichen.
-- ============================================

-- ============================================
-- PART 1: Get multiple profiles for child session
-- (für Activity Feed - um Spielernamen zu zeigen)
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

    -- Get profiles - children can see profiles from their club and public profiles
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
        -- Can see own profile
        p.id = v_child_id
        -- Can see same club members
        OR (v_child_club_id IS NOT NULL AND p.club_id = v_child_club_id)
        -- Can see public profiles
        OR (p.privacy_settings->>'visibility' = 'public' OR p.privacy_settings IS NULL)
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
-- PART 2: Get club member count for child session
-- ============================================

CREATE OR REPLACE FUNCTION get_club_member_count_for_child_session(
    p_session_token TEXT
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
    v_member_count INT;
    v_club_name TEXT;
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
        RETURN json_build_object('success', true, 'member_count', 0, 'club_id', null, 'club_name', null);
    END IF;

    -- Get club name
    SELECT name INTO v_club_name FROM clubs WHERE id = v_club_id;

    -- Count members
    SELECT COUNT(*) INTO v_member_count
    FROM profiles
    WHERE club_id = v_club_id;

    RETURN json_build_object(
        'success', true,
        'member_count', v_member_count,
        'club_id', v_club_id,
        'club_name', v_club_name
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION get_club_member_count_for_child_session TO anon;
GRANT EXECUTE ON FUNCTION get_club_member_count_for_child_session TO authenticated;

-- ============================================
-- PART 3: Get club activities for child session
-- (Matches, Polls, etc. für den Activity Feed)
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
    v_polls JSON;
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
            'polls', '[]'::json,
            'member_ids', '[]'::json
        );
    END IF;

    -- Get all member IDs from the child's club
    SELECT ARRAY_AGG(id) INTO v_member_ids
    FROM profiles
    WHERE club_id = v_club_id;

    -- Get matches involving club members
    SELECT json_agg(m ORDER BY m.created_at DESC)
    INTO v_matches
    FROM (
        SELECT
            id, player_a_id, player_b_id,
            player_a_score, player_b_score,
            player_a_sets, player_b_sets,
            winner_id, status, match_type,
            elo_change_a, elo_change_b,
            created_at, completed_at
        FROM matches
        WHERE (player_a_id = ANY(v_member_ids) OR player_b_id = ANY(v_member_ids))
        ORDER BY created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) m;

    -- Get polls from the club
    SELECT json_agg(p ORDER BY p.created_at DESC)
    INTO v_polls
    FROM (
        SELECT
            id, club_id, creator_id, question,
            visibility, is_anonymous, status,
            ends_at, created_at
        FROM polls
        WHERE club_id = v_club_id
        ORDER BY created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) p;

    RETURN json_build_object(
        'success', true,
        'matches', COALESCE(v_matches, '[]'::json),
        'polls', COALESCE(v_polls, '[]'::json),
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
-- PART 4: Get poll options and votes for child session
-- ============================================

CREATE OR REPLACE FUNCTION get_poll_details_for_child_session(
    p_session_token TEXT,
    p_poll_id UUID
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
    v_poll RECORD;
    v_options JSON;
    v_votes JSON;
    v_total_votes INT;
BEGIN
    -- Validate session token
    SELECT is_valid, child_id, error_message
    INTO v_session_valid, v_child_id, v_error
    FROM validate_child_session_token(p_session_token);

    IF NOT v_session_valid THEN
        RETURN json_build_object('success', false, 'error', COALESCE(v_error, 'Ungültige Session'));
    END IF;

    -- Get child's club_id
    SELECT club_id INTO v_child_club_id FROM profiles WHERE id = v_child_id;

    -- Get poll
    SELECT * INTO v_poll FROM polls WHERE id = p_poll_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Umfrage nicht gefunden');
    END IF;

    -- Check if child can see this poll (same club or public)
    IF v_poll.club_id != v_child_club_id AND v_poll.visibility != 'public' THEN
        RETURN json_build_object('success', false, 'error', 'Keine Berechtigung');
    END IF;

    -- Get options with vote counts
    SELECT json_agg(json_build_object(
        'id', po.id,
        'option_text', po.option_text,
        'vote_count', (SELECT COUNT(*) FROM poll_votes pv WHERE pv.option_id = po.id)
    ))
    INTO v_options
    FROM poll_options po
    WHERE po.poll_id = p_poll_id;

    -- Get total votes
    SELECT COUNT(*) INTO v_total_votes
    FROM poll_votes pv
    JOIN poll_options po ON pv.option_id = po.id
    WHERE po.poll_id = p_poll_id;

    -- Get votes if not anonymous
    IF v_poll.is_anonymous = false THEN
        SELECT json_agg(json_build_object(
            'user_id', pv.user_id,
            'option_id', pv.option_id,
            'voted_at', pv.voted_at
        ))
        INTO v_votes
        FROM poll_votes pv
        JOIN poll_options po ON pv.option_id = po.id
        WHERE po.poll_id = p_poll_id;
    ELSE
        v_votes := '[]'::json;
    END IF;

    RETURN json_build_object(
        'success', true,
        'poll', json_build_object(
            'id', v_poll.id,
            'question', v_poll.question,
            'visibility', v_poll.visibility,
            'is_anonymous', v_poll.is_anonymous,
            'status', v_poll.status,
            'ends_at', v_poll.ends_at,
            'created_at', v_poll.created_at,
            'creator_id', v_poll.creator_id
        ),
        'options', COALESCE(v_options, '[]'::json),
        'votes', v_votes,
        'total_votes', v_total_votes
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION get_poll_details_for_child_session TO anon;
GRANT EXECUTE ON FUNCTION get_poll_details_for_child_session TO authenticated;

-- ============================================
-- PART 5: Get events/training for child session calendar
-- ============================================

CREATE OR REPLACE FUNCTION get_calendar_events_for_child_session(
    p_session_token TEXT,
    p_start_date DATE,
    p_end_date DATE
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
    v_events JSON;
    v_participations JSON;
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

    -- Get events where child is invited or club events
    SELECT json_agg(e ORDER BY e.start_time)
    INTO v_events
    FROM (
        SELECT DISTINCT ON (ev.id)
            ev.id,
            ev.title,
            ev.description,
            ev.event_type,
            ev.start_time,
            ev.end_time,
            ev.location,
            ev.club_id,
            ev.created_by,
            ev.max_participants,
            ev.status
        FROM events ev
        LEFT JOIN event_invitations ei ON ei.event_id = ev.id
        WHERE
            ev.start_time >= p_start_date
            AND ev.start_time <= p_end_date + interval '1 day'
            AND (
                -- Club events
                (v_club_id IS NOT NULL AND ev.club_id = v_club_id)
                -- Personal invitations
                OR ei.user_id = v_child_id
            )
        ORDER BY ev.id, ev.start_time
    ) e;

    -- Get child's participations
    SELECT json_agg(json_build_object(
        'event_id', ep.event_id,
        'status', ep.status,
        'responded_at', ep.responded_at
    ))
    INTO v_participations
    FROM event_participations ep
    JOIN events ev ON ev.id = ep.event_id
    WHERE ep.user_id = v_child_id
    AND ev.start_time >= p_start_date
    AND ev.start_time <= p_end_date + interval '1 day';

    RETURN json_build_object(
        'success', true,
        'events', COALESCE(v_events, '[]'::json),
        'participations', COALESCE(v_participations, '[]'::json),
        'club_id', v_club_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION get_calendar_events_for_child_session TO anon;
GRANT EXECUTE ON FUNCTION get_calendar_events_for_child_session TO authenticated;

-- ============================================
-- Verification
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Child Activity Access Functions Installed!';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'New functions:';
    RAISE NOTICE '  - get_profiles_for_child_session(token, ids[])';
    RAISE NOTICE '  - get_club_member_count_for_child_session(token)';
    RAISE NOTICE '  - get_club_activities_for_child_session(token, limit, offset)';
    RAISE NOTICE '  - get_poll_details_for_child_session(token, poll_id)';
    RAISE NOTICE '  - get_calendar_events_for_child_session(token, start, end)';
    RAISE NOTICE '===========================================';
END $$;
