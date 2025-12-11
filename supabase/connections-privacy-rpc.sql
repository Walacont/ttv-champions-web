-- ============================================
-- RPC Function: Get connections list with privacy checks
-- ============================================
-- Returns the followers or following list for a user,
-- respecting their privacy settings.
--
-- Privacy rules:
-- - 'global': Everyone can see the connections list
-- - 'club_only': Only club members can see it
-- - 'friends_only' / 'followers_only': Only followers can see it
-- - 'none': No one can see it (except the user themselves)
-- - Own profile: Always visible

-- Function to get followers of a user
CREATE OR REPLACE FUNCTION get_user_followers(
    p_profile_id UUID,
    p_viewer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_privacy_setting TEXT;
    v_profile_club_id UUID;
    v_viewer_club_id UUID;
    v_is_following BOOLEAN;
    v_can_view BOOLEAN := false;
    v_followers JSONB;
BEGIN
    -- Own profile - always allowed
    IF p_profile_id = p_viewer_id THEN
        v_can_view := true;
    ELSE
        -- Get profile's privacy settings and club
        SELECT
            COALESCE(privacy_settings->>'searchable', 'global'),
            club_id
        INTO v_privacy_setting, v_profile_club_id
        FROM profiles
        WHERE id = p_profile_id;

        -- Check based on privacy setting
        IF v_privacy_setting = 'global' THEN
            v_can_view := true;
        ELSIF v_privacy_setting = 'club_only' THEN
            -- Check if viewer is in same club
            SELECT club_id INTO v_viewer_club_id
            FROM profiles WHERE id = p_viewer_id;

            v_can_view := (v_profile_club_id IS NOT NULL AND v_profile_club_id = v_viewer_club_id);
        ELSIF v_privacy_setting IN ('friends_only', 'followers_only') THEN
            -- Check if viewer follows the profile
            SELECT EXISTS (
                SELECT 1 FROM friendships
                WHERE requester_id = p_viewer_id
                AND addressee_id = p_profile_id
                AND status = 'accepted'
            ) INTO v_is_following;

            v_can_view := v_is_following;
        END IF;
        -- 'none' = v_can_view stays false
    END IF;

    IF NOT v_can_view THEN
        RETURN jsonb_build_object(
            'success', false,
            'access_denied', true,
            'privacy_setting', v_privacy_setting,
            'message', CASE v_privacy_setting
                WHEN 'friends_only' THEN 'Folge dieser Person, um die Liste zu sehen'
                WHEN 'followers_only' THEN 'Folge dieser Person, um die Liste zu sehen'
                WHEN 'club_only' THEN 'Nur für Vereinsmitglieder sichtbar'
                WHEN 'none' THEN 'Diese Liste ist privat'
                ELSE 'Kein Zugriff'
            END
        );
    END IF;

    -- Get followers (people who follow this profile)
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', p.id,
            'first_name', p.first_name,
            'last_name', p.last_name,
            'avatar_url', p.avatar_url,
            'club_id', p.club_id,
            'club_name', c.name
        )
    )
    INTO v_followers
    FROM friendships f
    JOIN profiles p ON p.id = f.requester_id
    LEFT JOIN clubs c ON c.id = p.club_id
    WHERE f.addressee_id = p_profile_id
    AND f.status = 'accepted';

    RETURN jsonb_build_object(
        'success', true,
        'access_denied', false,
        'followers', COALESCE(v_followers, '[]'::jsonb)
    );
END;
$$;

-- Function to get following of a user (who they follow)
CREATE OR REPLACE FUNCTION get_user_following(
    p_profile_id UUID,
    p_viewer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_privacy_setting TEXT;
    v_profile_club_id UUID;
    v_viewer_club_id UUID;
    v_is_following BOOLEAN;
    v_can_view BOOLEAN := false;
    v_following JSONB;
BEGIN
    -- Own profile - always allowed
    IF p_profile_id = p_viewer_id THEN
        v_can_view := true;
    ELSE
        -- Get profile's privacy settings and club
        SELECT
            COALESCE(privacy_settings->>'searchable', 'global'),
            club_id
        INTO v_privacy_setting, v_profile_club_id
        FROM profiles
        WHERE id = p_profile_id;

        -- Check based on privacy setting
        IF v_privacy_setting = 'global' THEN
            v_can_view := true;
        ELSIF v_privacy_setting = 'club_only' THEN
            -- Check if viewer is in same club
            SELECT club_id INTO v_viewer_club_id
            FROM profiles WHERE id = p_viewer_id;

            v_can_view := (v_profile_club_id IS NOT NULL AND v_profile_club_id = v_viewer_club_id);
        ELSIF v_privacy_setting IN ('friends_only', 'followers_only') THEN
            -- Check if viewer follows the profile
            SELECT EXISTS (
                SELECT 1 FROM friendships
                WHERE requester_id = p_viewer_id
                AND addressee_id = p_profile_id
                AND status = 'accepted'
            ) INTO v_is_following;

            v_can_view := v_is_following;
        END IF;
    END IF;

    IF NOT v_can_view THEN
        RETURN jsonb_build_object(
            'success', false,
            'access_denied', true,
            'privacy_setting', v_privacy_setting,
            'message', CASE v_privacy_setting
                WHEN 'friends_only' THEN 'Folge dieser Person, um die Liste zu sehen'
                WHEN 'followers_only' THEN 'Folge dieser Person, um die Liste zu sehen'
                WHEN 'club_only' THEN 'Nur für Vereinsmitglieder sichtbar'
                WHEN 'none' THEN 'Diese Liste ist privat'
                ELSE 'Kein Zugriff'
            END
        );
    END IF;

    -- Get following (people this profile follows)
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', p.id,
            'first_name', p.first_name,
            'last_name', p.last_name,
            'avatar_url', p.avatar_url,
            'club_id', p.club_id,
            'club_name', c.name
        )
    )
    INTO v_following
    FROM friendships f
    JOIN profiles p ON p.id = f.addressee_id
    LEFT JOIN clubs c ON c.id = p.club_id
    WHERE f.requester_id = p_profile_id
    AND f.status = 'accepted';

    RETURN jsonb_build_object(
        'success', true,
        'access_denied', false,
        'following', COALESCE(v_following, '[]'::jsonb)
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_followers(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_following(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_followers(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_user_following(UUID, UUID) TO anon;
