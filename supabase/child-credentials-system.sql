-- ============================================
-- Child Credentials System: Username + PIN Login
-- ============================================
-- This migration adds support for:
-- 1. Permanent username for children (set by guardian)
-- 2. PIN-based authentication (4-6 digits)
-- 3. No more temporary codes needed for daily login
-- ============================================

-- ============================================
-- PART 0: Enable pgcrypto extension for password hashing
-- ============================================
-- Required for crypt() and gen_salt() functions used for PIN hashing

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- PART 1: Add username and pin_hash to profiles
-- ============================================

-- Add username column (unique, for children login)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS username TEXT;

-- Add pin_hash column (bcrypt hash of PIN)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS pin_hash TEXT;

-- Add unique constraint for username (only non-null values must be unique)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_unique'
    ) THEN
        CREATE UNIQUE INDEX profiles_username_unique ON profiles(username) WHERE username IS NOT NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Username unique index may already exist';
END $$;

-- Add constraint for valid username format
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'valid_username_format'
    ) THEN
        ALTER TABLE profiles
        ADD CONSTRAINT valid_username_format
        CHECK (
            username IS NULL OR
            (
                LENGTH(username) >= 3 AND
                LENGTH(username) <= 30 AND
                username ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$|^[a-z0-9]$'
            )
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Username format constraint may already exist';
END $$;

-- Index for fast username lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username) WHERE username IS NOT NULL;

-- ============================================
-- PART 2: Function to set child credentials
-- ============================================

CREATE OR REPLACE FUNCTION set_child_credentials(
    p_child_id UUID,
    p_username TEXT,
    p_pin TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_guardian_id UUID;
    v_is_guardian BOOLEAN;
    v_existing_username UUID;
    v_normalized_username TEXT;
BEGIN
    v_guardian_id := auth.uid();

    IF v_guardian_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Verify caller is guardian of this child
    SELECT EXISTS (
        SELECT 1 FROM guardian_links
        WHERE guardian_id = v_guardian_id
        AND child_id = p_child_id
    ) INTO v_is_guardian;

    IF NOT v_is_guardian THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Du bist nicht der Vormund dieses Kindes'
        );
    END IF;

    -- Validate username
    IF p_username IS NULL OR LENGTH(TRIM(p_username)) < 3 THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Benutzername muss mindestens 3 Zeichen haben'
        );
    END IF;

    -- Normalize username (lowercase, trim)
    v_normalized_username := LOWER(TRIM(p_username));

    -- Check username format (alphanumeric, dots, underscores, hyphens)
    IF NOT v_normalized_username ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$' AND NOT v_normalized_username ~ '^[a-z0-9]$' THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Benutzername darf nur Buchstaben, Zahlen, Punkte, Unterstriche und Bindestriche enthalten'
        );
    END IF;

    -- Check if username is already taken (by another user)
    SELECT id INTO v_existing_username
    FROM profiles
    WHERE username = v_normalized_username
    AND id != p_child_id;

    IF v_existing_username IS NOT NULL THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Dieser Benutzername ist bereits vergeben'
        );
    END IF;

    -- Validate PIN
    IF p_pin IS NULL OR LENGTH(p_pin) < 4 OR LENGTH(p_pin) > 6 THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'PIN muss 4-6 Ziffern haben'
        );
    END IF;

    -- Check PIN is only digits
    IF NOT p_pin ~ '^[0-9]{4,6}$' THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'PIN darf nur Ziffern enthalten'
        );
    END IF;

    -- Update child profile with credentials
    -- Store PIN as hash using pgcrypto
    UPDATE profiles
    SET
        username = v_normalized_username,
        pin_hash = crypt(p_pin, gen_salt('bf', 8)),
        updated_at = now()
    WHERE id = p_child_id;

    RETURN json_build_object(
        'success', TRUE,
        'username', v_normalized_username,
        'message', 'Zugangsdaten erfolgreich gespeichert'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', FALSE,
        'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION set_child_credentials TO authenticated;

-- ============================================
-- PART 3: Function to validate child login (username + PIN)
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
BEGIN
    -- Normalize username
    v_normalized_username := LOWER(TRIM(p_username));

    -- Find child by username
    -- Allow login for profiles that:
    -- 1. Have account_type = 'child', OR
    -- 2. Are linked via guardian_links (offline players connected to a guardian)
    SELECT
        p.id,
        p.first_name,
        p.last_name,
        p.age_mode,
        p.club_id,
        p.pin_hash,
        p.account_type
    INTO v_child
    FROM profiles p
    WHERE p.username = v_normalized_username
    AND (
        p.account_type = 'child'
        OR EXISTS (
            SELECT 1 FROM guardian_links gl
            WHERE gl.child_id = p.id
        )
    );

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Benutzername nicht gefunden'
        );
    END IF;

    -- Check if PIN is set
    IF v_child.pin_hash IS NULL THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Kein PIN gesetzt. Bitte den Vormund kontaktieren.'
        );
    END IF;

    -- Verify PIN
    IF v_child.pin_hash != crypt(p_pin, v_child.pin_hash) THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Falscher PIN'
        );
    END IF;

    -- Get guardian ID for session
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
    RETURN json_build_object(
        'success', FALSE,
        'error', 'Anmeldung fehlgeschlagen'
    );
END;
$$;

-- This function can be called without authentication (for child login)
GRANT EXECUTE ON FUNCTION validate_child_pin_login TO anon;
GRANT EXECUTE ON FUNCTION validate_child_pin_login TO authenticated;

-- ============================================
-- PART 4: Function to check username availability
-- ============================================

CREATE OR REPLACE FUNCTION check_username_available(
    p_username TEXT,
    p_child_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_normalized_username TEXT;
    v_existing_id UUID;
BEGIN
    v_normalized_username := LOWER(TRIM(p_username));

    -- Check format
    IF LENGTH(v_normalized_username) < 3 THEN
        RETURN json_build_object(
            'available', FALSE,
            'reason', 'Zu kurz (min. 3 Zeichen)'
        );
    END IF;

    IF LENGTH(v_normalized_username) > 30 THEN
        RETURN json_build_object(
            'available', FALSE,
            'reason', 'Zu lang (max. 30 Zeichen)'
        );
    END IF;

    IF NOT v_normalized_username ~ '^[a-z0-9][a-z0-9._-]*[a-z0-9]$' AND NOT v_normalized_username ~ '^[a-z0-9]$' THEN
        RETURN json_build_object(
            'available', FALSE,
            'reason', 'Ungültige Zeichen'
        );
    END IF;

    -- Check if taken
    SELECT id INTO v_existing_id
    FROM profiles
    WHERE username = v_normalized_username
    AND (p_child_id IS NULL OR id != p_child_id);

    IF v_existing_id IS NOT NULL THEN
        RETURN json_build_object(
            'available', FALSE,
            'reason', 'Bereits vergeben'
        );
    END IF;

    RETURN json_build_object(
        'available', TRUE,
        'normalized', v_normalized_username
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'available', FALSE,
        'reason', 'Fehler bei der Prüfung'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION check_username_available TO authenticated;

-- ============================================
-- PART 5: Function to generate username suggestion
-- ============================================

CREATE OR REPLACE FUNCTION suggest_username(
    p_first_name TEXT,
    p_birth_year INT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_base_username TEXT;
    v_suggestion TEXT;
    v_counter INT := 0;
    v_suggestions TEXT[] := '{}';
BEGIN
    -- Create base username from first name
    v_base_username := LOWER(TRIM(regexp_replace(p_first_name, '[^a-zA-Z0-9]', '', 'g')));

    IF LENGTH(v_base_username) < 3 THEN
        v_base_username := v_base_username || 'user';
    END IF;

    -- Try different combinations
    -- 1. Just the name
    v_suggestion := v_base_username;
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE username = v_suggestion) THEN
        v_suggestions := array_append(v_suggestions, v_suggestion);
    END IF;

    -- 2. Name + birth year
    IF p_birth_year IS NOT NULL THEN
        v_suggestion := v_base_username || p_birth_year::TEXT;
        IF NOT EXISTS (SELECT 1 FROM profiles WHERE username = v_suggestion) THEN
            v_suggestions := array_append(v_suggestions, v_suggestion);
        END IF;

        -- Short year version
        v_suggestion := v_base_username || (p_birth_year % 100)::TEXT;
        IF NOT EXISTS (SELECT 1 FROM profiles WHERE username = v_suggestion) THEN
            v_suggestions := array_append(v_suggestions, v_suggestion);
        END IF;
    END IF;

    -- 3. Name + random numbers
    WHILE array_length(v_suggestions, 1) < 3 AND v_counter < 100 LOOP
        v_suggestion := v_base_username || floor(random() * 1000)::INT::TEXT;
        IF NOT EXISTS (SELECT 1 FROM profiles WHERE username = v_suggestion) THEN
            IF NOT v_suggestion = ANY(v_suggestions) THEN
                v_suggestions := array_append(v_suggestions, v_suggestion);
            END IF;
        END IF;
        v_counter := v_counter + 1;
    END LOOP;

    RETURN json_build_object(
        'suggestions', v_suggestions
    );
END;
$$;

GRANT EXECUTE ON FUNCTION suggest_username TO authenticated;

-- ============================================
-- PART 6: Update get_guardian_children to include username
-- ============================================

CREATE OR REPLACE FUNCTION get_my_children()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_guardian_id UUID;
    v_children JSON;
BEGIN
    v_guardian_id := auth.uid();

    IF v_guardian_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT json_agg(
        json_build_object(
            'id', p.id,
            'first_name', p.first_name,
            'last_name', p.last_name,
            'display_name', p.display_name,
            'avatar_url', p.avatar_url,
            'birthdate', p.birthdate,
            'age', calculate_age(p.birthdate),
            'age_mode', p.age_mode,
            'club_id', p.club_id,
            'club_name', c.name,
            'username', p.username,
            'has_pin', (p.pin_hash IS NOT NULL),
            'xp', p.xp,
            'elo_rating', p.elo_rating,
            'relationship', gl.relationship,
            'is_primary', gl.is_primary,
            'permissions', gl.permissions,
            'other_guardians', (
                SELECT json_agg(json_build_object(
                    'first_name', gp.first_name,
                    'last_name', gp.last_name
                ))
                FROM guardian_links gl2
                JOIN profiles gp ON gp.id = gl2.guardian_id
                WHERE gl2.child_id = p.id
                AND gl2.guardian_id != v_guardian_id
            )
        )
    ) INTO v_children
    FROM guardian_links gl
    JOIN profiles p ON p.id = gl.child_id
    LEFT JOIN clubs c ON c.id = p.club_id
    WHERE gl.guardian_id = v_guardian_id;

    RETURN json_build_object(
        'success', TRUE,
        'children', COALESCE(v_children, '[]'::json)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', FALSE,
        'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_children TO authenticated;

-- ============================================
-- PART 7: Verification
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Child Credentials System Migration Complete!';
    RAISE NOTICE 'New columns: profiles.username, profiles.pin_hash';
    RAISE NOTICE 'New functions: set_child_credentials, validate_child_pin_login, check_username_available, suggest_username';
    RAISE NOTICE 'Updated function: get_my_children (now includes username and has_pin)';
END $$;
