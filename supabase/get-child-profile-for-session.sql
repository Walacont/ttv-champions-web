-- ============================================
-- Migration: Get child profile for session (bypasses RLS for child login)
-- This function allows children logged in via code OR PIN to fetch their profile
-- ============================================

CREATE OR REPLACE FUNCTION get_child_profile_for_session(
    p_child_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile RECORD;
    v_club RECORD;
    v_has_valid_session BOOLEAN;
    v_has_pin_credentials BOOLEAN;
BEGIN
    -- Check for valid session via login code (old method)
    SELECT EXISTS (
        SELECT 1 FROM child_login_codes
        WHERE child_id = p_child_id
        AND used_at IS NOT NULL
        AND used_at > now() - interval '24 hours'
    ) INTO v_has_valid_session;

    -- Check for PIN-based credentials (new method)
    -- If the child has a PIN set and is either:
    -- 1. account_type = 'child', OR
    -- 2. is_offline = true, OR
    -- 3. Has a guardian link
    SELECT EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = p_child_id
        AND p.pin_hash IS NOT NULL
        AND (
            p.account_type = 'child'
            OR p.is_offline = TRUE
            OR EXISTS (
                SELECT 1 FROM guardian_links gl
                WHERE gl.child_id = p.id
            )
        )
    ) INTO v_has_pin_credentials;

    -- Allow access if either method is valid
    IF NOT v_has_valid_session AND NOT v_has_pin_credentials THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Keine gültige Sitzung gefunden'
        );
    END IF;

    -- Get profile data
    SELECT
        p.id,
        p.first_name,
        p.last_name,
        p.email,
        p.avatar_url,
        p.role,
        p.club_id,
        p.elo_rating,
        p.wins,
        p.losses,
        p.points,
        p.birthdate,
        p.age_mode,
        p.is_player,
        p.is_guardian,
        p.account_type,
        p.created_at
    INTO v_profile
    FROM profiles p
    WHERE p.id = p_child_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Profil nicht gefunden'
        );
    END IF;

    -- Get club data if exists
    IF v_profile.club_id IS NOT NULL THEN
        SELECT id, name INTO v_club
        FROM clubs
        WHERE id = v_profile.club_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'profile', json_build_object(
            'id', v_profile.id,
            'first_name', v_profile.first_name,
            'last_name', v_profile.last_name,
            'email', v_profile.email,
            'avatar_url', v_profile.avatar_url,
            'role', v_profile.role,
            'club_id', v_profile.club_id,
            'elo_rating', v_profile.elo_rating,
            'wins', v_profile.wins,
            'losses', v_profile.losses,
            'points', v_profile.points,
            'birthdate', v_profile.birthdate,
            'age_mode', v_profile.age_mode,
            'is_player', v_profile.is_player,
            'is_guardian', v_profile.is_guardian,
            'account_type', v_profile.account_type,
            'created_at', v_profile.created_at
        ),
        'club', CASE
            WHEN v_club.id IS NOT NULL THEN json_build_object(
                'id', v_club.id,
                'name', v_club.name
            )
            ELSE NULL
        END
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Grant execute to anonymous users (children aren't authenticated)
GRANT EXECUTE ON FUNCTION get_child_profile_for_session TO anon;
GRANT EXECUTE ON FUNCTION get_child_profile_for_session TO authenticated;

-- ============================================
-- Verification
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Migration Complete: get_child_profile_for_session function created';
    RAISE NOTICE 'This function allows children logged in via code OR PIN to fetch their profile';
END $$;
