-- ============================================
-- CREATE SPORT CONTEXT RPC FUNCTION
-- ============================================
-- This function returns the user's active sport context
-- including sport details, club, and role
--
-- FIXED: Now queries sports table directly and LEFT JOINs profile_club_sports
-- This allows users to select a sport even if they're not in a club for that sport yet

CREATE OR REPLACE FUNCTION public.get_user_sport_context(p_user_id uuid)
RETURNS TABLE (
    sport_id uuid,
    sport_name text,
    display_name text,
    config jsonb,
    club_id uuid,
    club_name text,
    role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_active_sport_id uuid;
BEGIN
    -- Get user's active sport from profile
    SELECT active_sport_id INTO v_active_sport_id
    FROM profiles
    WHERE id = p_user_id;

    -- If no active sport set, get first sport from profile_club_sports
    IF v_active_sport_id IS NULL THEN
        SELECT pcs.sport_id INTO v_active_sport_id
        FROM profile_club_sports pcs
        WHERE pcs.user_id = p_user_id
        ORDER BY pcs.created_at ASC
        LIMIT 1;
    END IF;

    -- If still no sport found, return empty
    IF v_active_sport_id IS NULL THEN
        RETURN;
    END IF;

    -- Return full context
    -- FIXED: Query sports table first, then LEFT JOIN profile_club_sports
    -- This way the query returns data even if user isn't in a club for that sport
    RETURN QUERY
    SELECT
        s.id as sport_id,
        s.name as sport_name,
        s.display_name,
        s.config,
        pcs.club_id,
        c.name as club_name,
        pcs.role
    FROM sports s
    LEFT JOIN profile_club_sports pcs ON pcs.sport_id = s.id AND pcs.user_id = p_user_id
    LEFT JOIN clubs c ON c.id = pcs.club_id
    WHERE s.id = v_active_sport_id
    LIMIT 1;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_user_sport_context(uuid) TO authenticated;
