-- Fix anonymize_account function - properly delete auth account
-- Run this in Supabase SQL Editor to fix account deletion
-- This version includes guardian support and proper auth account deletion

CREATE OR REPLACE FUNCTION anonymize_account(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_own_account BOOLEAN;
    v_is_guardian_of_child BOOLEAN;
    random_suffix TEXT;
BEGIN
    -- Generate random suffix for anonymized email
    random_suffix := substr(md5(random()::text), 1, 8);

    -- Check if user is deleting their own account
    v_is_own_account := (p_user_id = auth.uid());

    -- Check if user is guardian of this child
    SELECT EXISTS (
        SELECT 1 FROM guardian_links
        WHERE guardian_id = auth.uid()
        AND child_id = p_user_id
    ) INTO v_is_guardian_of_child;

    -- Must be either own account or guardian of child
    IF NOT v_is_own_account AND NOT v_is_guardian_of_child THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Keine Berechtigung zum Löschen dieses Accounts'
        );
    END IF;

    -- If guardian is deleting a child, first remove the guardian link
    IF v_is_guardian_of_child AND NOT v_is_own_account THEN
        DELETE FROM guardian_links WHERE child_id = p_user_id;
    END IF;

    -- Anonymize the profile
    -- Note: Deleted profiles are identified by email LIKE 'deleted_%@anonymous.local'
    UPDATE profiles
    SET
        first_name = 'Gelöschter',
        last_name = 'Nutzer',
        email = 'deleted_' || random_suffix || '@anonymous.local',
        birthdate = NULL,
        gender = NULL,
        avatar_url = NULL,
        fcm_token = NULL,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- Delete notifications
    DELETE FROM notifications WHERE user_id = p_user_id;

    -- Delete points history
    DELETE FROM points_history WHERE user_id = p_user_id;

    -- Delete xp history
    DELETE FROM xp_history WHERE user_id = p_user_id;

    -- Delete friend relationships
    DELETE FROM friends WHERE user_id = p_user_id OR friend_id = p_user_id;

    -- Delete followers
    DELETE FROM followers WHERE follower_id = p_user_id OR followed_id = p_user_id;

    -- Clear any pending requests
    DELETE FROM club_requests WHERE player_id = p_user_id;
    DELETE FROM leave_club_requests WHERE player_id = p_user_id;
    DELETE FROM match_requests WHERE sender_id = p_user_id OR receiver_id = p_user_id;

    -- IMPORTANT: Delete the auth account so user cannot login anymore
    -- Only for regular accounts (not child accounts, which don't have auth accounts)
    -- Child accounts are deleted by guardians (v_is_guardian_of_child = true)
    IF v_is_own_account THEN
        DELETE FROM auth.users WHERE id = p_user_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Account wurde vollständig gelöscht'
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION anonymize_account(UUID) TO authenticated;
