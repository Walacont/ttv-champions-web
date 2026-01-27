-- ============================================
-- Fix: Remove non-existent 'status' column from matches query
-- The matches table does not have a 'status' column
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
        RETURN json_build_object('success', false, 'error', COALESCE(v_error, 'Ungueltige Session'));
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
    -- Using correct column names from the matches table
    -- Note: 'status' column does not exist in matches table
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
-- Verification
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Fixed get_club_activities_for_child_session';
    RAISE NOTICE 'Removed non-existent status column from matches query';
    RAISE NOTICE '===========================================';
END $$;
