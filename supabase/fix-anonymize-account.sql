-- Fix anonymize_account function - properly delete auth account
-- Run this in Supabase SQL Editor to fix account deletion

CREATE OR REPLACE FUNCTION anonymize_account(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    random_suffix TEXT;
    user_exists BOOLEAN;
BEGIN
    -- Check if user exists
    SELECT EXISTS(SELECT 1 FROM profiles WHERE id = p_user_id) INTO user_exists;

    IF NOT user_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Benutzer nicht gefunden'
        );
    END IF;

    -- Generate random suffix
    random_suffix := substr(md5(random()::text), 1, 8);

    -- Anonymize profile first (only using columns that actually exist in the schema)
    UPDATE profiles SET
        email = 'deleted_' || random_suffix || '@anonymous.local',
        first_name = 'Gelöschter',
        last_name = 'Nutzer',
        avatar_url = NULL,
        birthdate = NULL,
        gender = NULL,
        fcm_token = NULL,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- Delete sensitive data from related tables
    DELETE FROM points_history WHERE user_id = p_user_id;
    DELETE FROM xp_history WHERE user_id = p_user_id;

    -- IMPORTANT: Delete the auth account so user cannot login anymore
    -- This requires the function to be owned by a superuser or have appropriate privileges
    DELETE FROM auth.users WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Account vollständig gelöscht'
    );
END;
$$;
