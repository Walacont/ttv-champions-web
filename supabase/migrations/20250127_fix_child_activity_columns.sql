-- ============================================
-- Fix column names in child activity RPC functions
-- ============================================

-- PART 1: Fix get_club_activities_for_child_session
-- The matches table has: winner_elo_change, loser_elo_change, sets (JSONB), winner_id, loser_id
-- Not: player_a_score, player_b_score, player_a_sets, player_b_sets, elo_change_a, elo_change_b

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
    -- Using correct column names: winner_id, loser_id, winner_elo_change, loser_elo_change, sets
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
            status,
            match_mode,
            handicap,
            played_at,
            created_at
        FROM matches
        WHERE (player_a_id = ANY(v_member_ids) OR player_b_id = ANY(v_member_ids))
        ORDER BY created_at DESC
        LIMIT p_limit OFFSET p_offset
    ) m;

    -- Get polls from the club (if polls table exists)
    BEGIN
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
    EXCEPTION WHEN undefined_table THEN
        v_polls := '[]'::json;
    END;

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
-- PART 2: Fix get_calendar_events_for_child_session
-- The events table has: organizer_id (not created_by), start_date + start_time (not start_time as timestamp)
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
    -- Using correct column names: organizer_id, start_date, start_time
    SELECT json_agg(e ORDER BY e.start_date, e.start_time)
    INTO v_events
    FROM (
        SELECT DISTINCT ON (ev.id)
            ev.id,
            ev.title,
            ev.description,
            ev.event_type,
            ev.event_category,
            ev.start_date,
            ev.start_time,
            ev.end_time,
            ev.location,
            ev.club_id,
            ev.organizer_id,
            ev.max_participants,
            ev.repeat_type,
            ev.repeat_end_date,
            ev.target_type,
            ev.target_subgroup_ids
        FROM events ev
        LEFT JOIN event_invitations ei ON ei.event_id = ev.id
        WHERE
            ev.start_date >= p_start_date
            AND ev.start_date <= p_end_date
            AND ev.cancelled = false
            AND (
                -- Club events
                (v_club_id IS NOT NULL AND ev.club_id = v_club_id)
                -- Personal invitations
                OR ei.user_id = v_child_id
            )
        ORDER BY ev.id, ev.start_date, ev.start_time
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
    AND ev.start_date >= p_start_date
    AND ev.start_date <= p_end_date;

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
    RAISE NOTICE 'Child Activity RPC Column Fix Applied';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Fixed column names in:';
    RAISE NOTICE '  - get_club_activities_for_child_session (matches: winner_id, loser_id, sets, winner_elo_change, loser_elo_change)';
    RAISE NOTICE '  - get_calendar_events_for_child_session (events: organizer_id, start_date, start_time)';
    RAISE NOTICE '===========================================';
END $$;
