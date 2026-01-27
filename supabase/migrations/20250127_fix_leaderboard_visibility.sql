-- ============================================
-- Fix Leaderboard Privacy: Use leaderboard_visibility instead of searchable
-- ============================================
-- Problem: Die Funktion get_leaderboard_for_child_session prüfte bisher
-- das Feld 'searchable' statt 'leaderboard_visibility'.
--
-- searchable = Kontroliert die Spielersuche
-- leaderboard_visibility = Kontroliert die Ranglisten-Sichtbarkeit
--
-- Diese Migration korrigiert das, sodass Spieler die in der Rangliste
-- unsichtbar sein wollen (leaderboard_visibility='none') auch wirklich
-- ausgeblendet werden.
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

-- ============================================
-- Verification
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Leaderboard Privacy Fix Applied!';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Changed: get_leaderboard_for_child_session';
    RAISE NOTICE 'Now uses: leaderboard_visibility (was: searchable)';
    RAISE NOTICE '';
    RAISE NOTICE 'Privacy rules:';
    RAISE NOTICE '  - leaderboard_visibility=none: hidden from leaderboard';
    RAISE NOTICE '  - leaderboard_visibility=club_only: visible to same club';
    RAISE NOTICE '  - leaderboard_visibility=global: visible to everyone';
    RAISE NOTICE '===========================================';
END $$;
