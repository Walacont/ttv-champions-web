-- ============================================
-- Child Session Security System
-- ============================================
-- This migration implements secure server-side sessions for children:
-- 1. Session tokens stored in database (not just localStorage)
-- 2. Rate limiting for PIN attempts
-- 3. Token validation in all RPC functions
-- ============================================

-- ============================================
-- PART 1: Create child_sessions table
-- ============================================

CREATE TABLE IF NOT EXISTS child_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    session_token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ DEFAULT now(),
    user_agent TEXT,
    is_valid BOOLEAN DEFAULT true,

    CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_child_sessions_token ON child_sessions(session_token) WHERE is_valid = true;
CREATE INDEX IF NOT EXISTS idx_child_sessions_child_id ON child_sessions(child_id);
CREATE INDEX IF NOT EXISTS idx_child_sessions_expires ON child_sessions(expires_at);

-- ============================================
-- PART 2: Create PIN attempt tracking for rate limiting
-- ============================================

CREATE TABLE IF NOT EXISTS child_pin_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL,
    attempted_at TIMESTAMPTZ DEFAULT now(),
    success BOOLEAN DEFAULT false,
    ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_pin_attempts_username ON child_pin_attempts(username, attempted_at);

-- ============================================
-- PART 3: Helper function to validate session token
-- ============================================

CREATE OR REPLACE FUNCTION validate_child_session_token(p_session_token TEXT)
RETURNS TABLE (
    is_valid BOOLEAN,
    child_id UUID,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session RECORD;
BEGIN
    -- Find the session
    SELECT cs.*, p.first_name, p.last_name
    INTO v_session
    FROM child_sessions cs
    JOIN profiles p ON p.id = cs.child_id
    WHERE cs.session_token = p_session_token
    AND cs.is_valid = true;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::UUID, 'Session nicht gefunden'::TEXT;
        RETURN;
    END IF;

    -- Check if expired
    IF v_session.expires_at < now() THEN
        -- Mark session as invalid
        UPDATE child_sessions SET is_valid = false WHERE id = v_session.id;
        RETURN QUERY SELECT false, NULL::UUID, 'Session abgelaufen'::TEXT;
        RETURN;
    END IF;

    -- Update last activity
    UPDATE child_sessions
    SET last_activity_at = now()
    WHERE id = v_session.id;

    RETURN QUERY SELECT true, v_session.child_id, NULL::TEXT;
END;
$$;

-- ============================================
-- PART 4: Check rate limiting
-- ============================================

CREATE OR REPLACE FUNCTION check_pin_rate_limit(p_username TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_recent_attempts INT;
    v_lockout_until TIMESTAMPTZ;
    v_normalized_username TEXT;
BEGIN
    v_normalized_username := LOWER(TRIM(p_username));

    -- Count failed attempts in the last 15 minutes
    SELECT COUNT(*) INTO v_recent_attempts
    FROM child_pin_attempts
    WHERE username = v_normalized_username
    AND attempted_at > now() - interval '15 minutes'
    AND success = false;

    -- Allow max 5 failed attempts per 15 minutes
    IF v_recent_attempts >= 5 THEN
        -- Find when the oldest attempt in the window was
        SELECT MIN(attempted_at) + interval '15 minutes' INTO v_lockout_until
        FROM child_pin_attempts
        WHERE username = v_normalized_username
        AND attempted_at > now() - interval '15 minutes'
        AND success = false;

        RETURN json_build_object(
            'allowed', false,
            'reason', 'Zu viele Fehlversuche. Bitte warte ' ||
                      EXTRACT(MINUTES FROM (v_lockout_until - now()))::INT || ' Minuten.',
            'lockout_until', v_lockout_until,
            'attempts_remaining', 0
        );
    END IF;

    RETURN json_build_object(
        'allowed', true,
        'attempts_remaining', 5 - v_recent_attempts
    );
END;
$$;

GRANT EXECUTE ON FUNCTION check_pin_rate_limit TO anon;

-- ============================================
-- PART 5: Updated PIN login with session token
-- ============================================

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
    v_rate_check JSON;
    v_session_token TEXT;
    v_session_id UUID;
BEGIN
    v_normalized_username := LOWER(TRIM(COALESCE(p_username, '')));

    -- Check rate limiting first
    v_rate_check := check_pin_rate_limit(v_normalized_username);
    IF NOT (v_rate_check->>'allowed')::boolean THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', v_rate_check->>'reason',
            'rate_limited', TRUE
        );
    END IF;

    -- Check if username is empty
    IF v_normalized_username = '' OR LENGTH(v_normalized_username) < 3 THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Bitte gib einen gültigen Benutzernamen ein (min. 3 Zeichen)'
        );
    END IF;

    -- Check if profile exists
    SELECT EXISTS (
        SELECT 1 FROM profiles WHERE username = v_normalized_username
    ) INTO v_profile_exists;

    IF NOT v_profile_exists THEN
        -- Log failed attempt
        INSERT INTO child_pin_attempts (username, success) VALUES (v_normalized_username, false);
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Benutzername nicht gefunden. Bitte überprüfe die Eingabe.'
        );
    END IF;

    -- Find child profile with credentials
    SELECT
        p.id, p.first_name, p.last_name, p.age_mode, p.club_id,
        p.pin_hash, p.account_type, p.is_offline
    INTO v_child
    FROM profiles p
    WHERE p.username = v_normalized_username
    AND (
        p.account_type = 'child'
        OR p.is_offline = TRUE
        OR EXISTS (SELECT 1 FROM guardian_links gl WHERE gl.child_id = p.id)
    );

    IF NOT FOUND THEN
        INSERT INTO child_pin_attempts (username, success) VALUES (v_normalized_username, false);
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Dieser Benutzername ist für einen Erwachsenen-Account. Bitte nutze den E-Mail Login.'
        );
    END IF;

    -- Check if PIN is set
    IF v_child.pin_hash IS NULL OR v_child.pin_hash = '' THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Kein PIN gesetzt. Bitte den Vormund kontaktieren.'
        );
    END IF;

    -- Verify PIN
    IF v_child.pin_hash != crypt(p_pin, v_child.pin_hash) THEN
        -- Log failed attempt
        INSERT INTO child_pin_attempts (username, success) VALUES (v_normalized_username, false);

        -- Check remaining attempts
        v_rate_check := check_pin_rate_limit(v_normalized_username);

        RETURN json_build_object(
            'success', FALSE,
            'error', 'Falscher PIN. ' || (v_rate_check->>'attempts_remaining')::INT || ' Versuche übrig.',
            'attempts_remaining', (v_rate_check->>'attempts_remaining')::INT
        );
    END IF;

    -- PIN correct! Log successful attempt
    INSERT INTO child_pin_attempts (username, success) VALUES (v_normalized_username, true);

    -- Invalidate any existing sessions for this child (single session policy)
    UPDATE child_sessions
    SET is_valid = false
    WHERE child_id = v_child.id AND is_valid = true;

    -- Create new session token
    v_session_token := encode(gen_random_bytes(32), 'hex');

    INSERT INTO child_sessions (child_id, session_token, expires_at)
    VALUES (v_child.id, v_session_token, now() + interval '24 hours')
    RETURNING id INTO v_session_id;

    -- Get guardian ID
    SELECT gl.guardian_id INTO v_guardian
    FROM guardian_links gl
    WHERE gl.child_id = v_child.id AND gl.is_primary = TRUE
    LIMIT 1;

    -- Return session data
    RETURN json_build_object(
        'success', TRUE,
        'session_token', v_session_token,
        'child_id', v_child.id,
        'first_name', v_child.first_name,
        'last_name', v_child.last_name,
        'age_mode', v_child.age_mode,
        'club_id', v_child.club_id,
        'guardian_id', v_guardian.guardian_id,
        'expires_at', (now() + interval '24 hours')
    );

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'validate_child_pin_login error: %', SQLERRM;
    RETURN json_build_object(
        'success', FALSE,
        'error', 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION validate_child_pin_login TO anon;
GRANT EXECUTE ON FUNCTION validate_child_pin_login TO authenticated;

-- ============================================
-- PART 6: Logout function
-- ============================================

CREATE OR REPLACE FUNCTION logout_child_session(p_session_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE child_sessions
    SET is_valid = false
    WHERE session_token = p_session_token;

    RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION logout_child_session TO anon;

-- ============================================
-- PART 7: Updated get_child_profile_for_session
-- ============================================

CREATE OR REPLACE FUNCTION get_child_profile_for_session(p_session_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_session_valid BOOLEAN;
    v_child_id UUID;
    v_error TEXT;
    v_profile RECORD;
    v_club RECORD;
BEGIN
    -- Validate session token
    SELECT is_valid, child_id, error_message
    INTO v_session_valid, v_child_id, v_error
    FROM validate_child_session_token(p_session_token);

    IF NOT v_session_valid THEN
        RETURN json_build_object('success', false, 'error', COALESCE(v_error, 'Ungültige Session'));
    END IF;

    -- Get profile
    SELECT p.id, p.first_name, p.last_name, p.email, p.avatar_url, p.role, p.club_id,
           p.elo_rating, p.wins, p.losses, p.points, p.birthdate, p.age_mode,
           p.is_player, p.is_guardian, p.account_type, p.created_at, p.xp
    INTO v_profile
    FROM profiles p WHERE p.id = v_child_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Profil nicht gefunden');
    END IF;

    IF v_profile.club_id IS NOT NULL THEN
        SELECT id, name INTO v_club FROM clubs WHERE id = v_profile.club_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'profile', json_build_object(
            'id', v_profile.id, 'first_name', v_profile.first_name, 'last_name', v_profile.last_name,
            'email', v_profile.email, 'avatar_url', v_profile.avatar_url, 'role', v_profile.role,
            'club_id', v_profile.club_id, 'elo_rating', v_profile.elo_rating, 'wins', v_profile.wins,
            'losses', v_profile.losses, 'points', v_profile.points, 'xp', v_profile.xp,
            'birthdate', v_profile.birthdate, 'age_mode', v_profile.age_mode,
            'is_player', v_profile.is_player, 'is_guardian', v_profile.is_guardian,
            'account_type', v_profile.account_type, 'created_at', v_profile.created_at
        ),
        'club', CASE WHEN v_club.id IS NOT NULL THEN
            json_build_object('id', v_club.id, 'name', v_club.name) ELSE NULL END
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION get_child_profile_for_session TO anon;
GRANT EXECUTE ON FUNCTION get_child_profile_for_session TO authenticated;

-- ============================================
-- PART 8: Updated get_profile_for_child_session
-- ============================================

CREATE OR REPLACE FUNCTION get_profile_for_child_session(
    p_session_token TEXT,
    p_profile_id UUID
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
    v_profile RECORD;
    v_club RECORD;
BEGIN
    -- Validate session token
    SELECT is_valid, child_id, error_message
    INTO v_session_valid, v_child_id, v_error
    FROM validate_child_session_token(p_session_token);

    IF NOT v_session_valid THEN
        RETURN json_build_object('success', false, 'error', COALESCE(v_error, 'Ungültige Session'));
    END IF;

    -- Get requested profile
    SELECT p.id, p.first_name, p.last_name, p.display_name, p.avatar_url,
           p.elo_rating, p.highest_elo, p.points, p.xp, p.grundlagen_completed,
           p.club_id, p.privacy_settings, p.age_mode
    INTO v_profile
    FROM profiles p WHERE p.id = p_profile_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Profil nicht gefunden');
    END IF;

    IF v_profile.club_id IS NOT NULL THEN
        SELECT id, name INTO v_club FROM clubs WHERE id = v_profile.club_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'profile', json_build_object(
            'id', v_profile.id, 'first_name', v_profile.first_name, 'last_name', v_profile.last_name,
            'display_name', v_profile.display_name, 'avatar_url', v_profile.avatar_url,
            'elo_rating', v_profile.elo_rating, 'highest_elo', v_profile.highest_elo,
            'points', v_profile.points, 'xp', v_profile.xp,
            'grundlagen_completed', v_profile.grundlagen_completed, 'club_id', v_profile.club_id,
            'privacy_settings', v_profile.privacy_settings, 'age_mode', v_profile.age_mode,
            'clubs', CASE WHEN v_club.id IS NOT NULL THEN
                json_build_object('id', v_club.id, 'name', v_club.name) ELSE NULL END
        )
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION get_profile_for_child_session TO anon;
GRANT EXECUTE ON FUNCTION get_profile_for_child_session TO authenticated;

-- ============================================
-- PART 9: Updated get_leaderboard_for_child_session
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

    IF p_type = 'skill' THEN
        SELECT json_agg(row_to_json(t)) INTO v_leaderboard FROM (
            SELECT p.id, p.first_name, p.last_name, p.display_name, p.avatar_url,
                   p.elo_rating, p.xp, p.club_id, c.name as club_name
            FROM profiles p LEFT JOIN clubs c ON c.id = p.club_id
            WHERE (p_club_id IS NULL OR p.club_id = p_club_id) AND p.is_player = true
            ORDER BY p.elo_rating DESC NULLS LAST LIMIT p_limit
        ) t;
    ELSIF p_type = 'effort' THEN
        SELECT json_agg(row_to_json(t)) INTO v_leaderboard FROM (
            SELECT p.id, p.first_name, p.last_name, p.display_name, p.avatar_url,
                   p.elo_rating, p.xp, p.club_id, c.name as club_name
            FROM profiles p LEFT JOIN clubs c ON c.id = p.club_id
            WHERE (p_club_id IS NULL OR p.club_id = p_club_id) AND p.is_player = true
            ORDER BY p.xp DESC NULLS LAST LIMIT p_limit
        ) t;
    ELSE
        SELECT json_agg(row_to_json(t)) INTO v_leaderboard FROM (
            SELECT p.id, p.first_name, p.last_name, p.display_name, p.avatar_url,
                   p.elo_rating, p.xp, p.points, p.club_id, c.name as club_name
            FROM profiles p LEFT JOIN clubs c ON c.id = p.club_id
            WHERE (p_club_id IS NULL OR p.club_id = p_club_id) AND p.is_player = true
            ORDER BY p.points DESC NULLS LAST LIMIT p_limit
        ) t;
    END IF;

    RETURN json_build_object('success', true, 'leaderboard', COALESCE(v_leaderboard, '[]'::json));
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION get_leaderboard_for_child_session TO anon;
GRANT EXECUTE ON FUNCTION get_leaderboard_for_child_session TO authenticated;

-- ============================================
-- PART 10: Cleanup old sessions (run periodically)
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_expired_child_sessions()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted INT;
BEGIN
    -- Delete expired sessions older than 7 days
    DELETE FROM child_sessions
    WHERE expires_at < now() - interval '7 days'
    OR (is_valid = false AND created_at < now() - interval '1 day');

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    -- Also clean up old PIN attempts (older than 24 hours)
    DELETE FROM child_pin_attempts WHERE attempted_at < now() - interval '24 hours';

    RETURN v_deleted;
END;
$$;

-- ============================================
-- PART 11: RLS Policies for child_sessions
-- ============================================

ALTER TABLE child_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_pin_attempts ENABLE ROW LEVEL SECURITY;

-- Only allow service role to access these tables directly
-- All access should go through the SECURITY DEFINER functions

-- ============================================
-- Verification
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Child Session Security System Installed!';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'New tables: child_sessions, child_pin_attempts';
    RAISE NOTICE 'Features:';
    RAISE NOTICE '  - Server-side session tokens (not just localStorage)';
    RAISE NOTICE '  - Rate limiting: 5 attempts per 15 minutes';
    RAISE NOTICE '  - Single session policy (new login invalidates old)';
    RAISE NOTICE '  - 24-hour session expiry';
    RAISE NOTICE '  - All RPC functions now validate session tokens';
    RAISE NOTICE '===========================================';
END $$;
