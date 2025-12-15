-- Fix anonymize_account function - remove non-existent columns
-- Run this in Supabase SQL Editor to fix account deletion

CREATE OR REPLACE FUNCTION anonymize_account(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    random_suffix TEXT;
BEGIN
    -- Generate random suffix
    random_suffix := substr(md5(random()::text), 1, 8);

    -- Anonymize profile (only using columns that actually exist in the schema)
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

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Account anonymisiert'
    );
END;
$$;
