-- ============================================
-- Fix: Child PIN Login - Username not found issue
-- ============================================
-- This migration fixes the validate_child_pin_login function
-- to properly find children regardless of their account setup.
-- ============================================

-- ============================================
-- PART 1: Ensure pgcrypto is available
-- ============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- PART 2: Drop and recreate the function with better logic
-- ============================================

DROP FUNCTION IF EXISTS validate_child_pin_login(TEXT, TEXT);

CREATE OR REPLACE FUNCTION validate_child_pin_login(
    p_username TEXT,
    p_pin TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_child RECORD;
    v_guardian RECORD;
    v_normalized_username TEXT;
    v_profile_exists BOOLEAN;
BEGIN
    -- Normalize username
    v_normalized_username := LOWER(TRIM(COALESCE(p_username, '')));

    -- Check if username is empty
    IF v_normalized_username = '' OR LENGTH(v_normalized_username) < 3 THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Bitte gib einen gültigen Benutzernamen ein (min. 3 Zeichen)'
        );
    END IF;

    -- First, check if ANY profile with this username exists
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE username = v_normalized_username
    ) INTO v_profile_exists;

    IF NOT v_profile_exists THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Benutzername nicht gefunden. Bitte überprüfe die Eingabe.'
        );
    END IF;

    -- Now find the child profile with credentials
    -- Accept profiles that:
    -- 1. Have account_type = 'child', OR
    -- 2. Are offline players (is_offline = true), OR
    -- 3. Are linked via guardian_links
    SELECT
        p.id,
        p.first_name,
        p.last_name,
        p.age_mode,
        p.club_id,
        p.pin_hash,
        p.account_type,
        p.is_offline
    INTO v_child
    FROM profiles p
    WHERE p.username = v_normalized_username
    AND (
        p.account_type = 'child'
        OR p.is_offline = TRUE
        OR EXISTS (
            SELECT 1 FROM guardian_links gl
            WHERE gl.child_id = p.id
        )
    );

    IF NOT FOUND THEN
        -- Profile exists but doesn't meet child/offline criteria
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Dieser Benutzername ist für einen Erwachsenen-Account. Bitte nutze den E-Mail Login.'
        );
    END IF;

    -- Check if PIN is set
    IF v_child.pin_hash IS NULL OR v_child.pin_hash = '' THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Kein PIN gesetzt. Bitte den Vormund kontaktieren, um die Zugangsdaten einzurichten.'
        );
    END IF;

    -- Verify PIN using pgcrypto crypt function
    IF v_child.pin_hash != crypt(p_pin, v_child.pin_hash) THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Falscher PIN. Bitte versuche es erneut.'
        );
    END IF;

    -- Get guardian ID for session (if any)
    SELECT gl.guardian_id INTO v_guardian
    FROM guardian_links gl
    WHERE gl.child_id = v_child.id
    AND gl.is_primary = TRUE
    LIMIT 1;

    -- Return child data for session
    RETURN json_build_object(
        'success', TRUE,
        'child_id', v_child.id,
        'first_name', v_child.first_name,
        'last_name', v_child.last_name,
        'age_mode', v_child.age_mode,
        'club_id', v_child.club_id,
        'guardian_id', v_guardian.guardian_id
    );

EXCEPTION WHEN OTHERS THEN
    -- Log the actual error for debugging (will be visible in Supabase logs)
    RAISE WARNING 'validate_child_pin_login error: %', SQLERRM;

    RETURN json_build_object(
        'success', FALSE,
        'error', 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.'
    );
END;
$$;

-- Allow anonymous and authenticated users to call this function
GRANT EXECUTE ON FUNCTION validate_child_pin_login TO anon;
GRANT EXECUTE ON FUNCTION validate_child_pin_login TO authenticated;

-- ============================================
-- PART 3: Helper function to check child login status
-- ============================================

CREATE OR REPLACE FUNCTION check_child_login_setup(p_username TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_normalized_username TEXT;
    v_profile RECORD;
BEGIN
    v_normalized_username := LOWER(TRIM(COALESCE(p_username, '')));

    SELECT
        p.id,
        p.first_name,
        p.last_name,
        p.username,
        p.account_type,
        p.is_offline,
        (p.pin_hash IS NOT NULL AND p.pin_hash != '') as has_pin,
        EXISTS (SELECT 1 FROM guardian_links gl WHERE gl.child_id = p.id) as has_guardian
    INTO v_profile
    FROM profiles p
    WHERE p.username = v_normalized_username;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'found', FALSE,
            'message', 'Kein Profil mit diesem Benutzernamen gefunden'
        );
    END IF;

    RETURN json_build_object(
        'found', TRUE,
        'first_name', v_profile.first_name,
        'account_type', v_profile.account_type,
        'is_offline', v_profile.is_offline,
        'has_pin', v_profile.has_pin,
        'has_guardian', v_profile.has_guardian,
        'can_use_child_login', (
            v_profile.account_type = 'child'
            OR v_profile.is_offline = TRUE
            OR v_profile.has_guardian
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION check_child_login_setup TO anon;
GRANT EXECUTE ON FUNCTION check_child_login_setup TO authenticated;

-- ============================================
-- PART 4: Verification
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Child PIN Login Fix Applied!';
    RAISE NOTICE 'Function updated: validate_child_pin_login';
    RAISE NOTICE 'New function added: check_child_login_setup (for debugging)';
END $$;
