-- ============================================
-- Guardian System: Parental Controls for TTV Champions
-- ============================================
-- This migration adds support for:
-- 1. Guardian (parent) accounts that can manage child profiles
-- 2. Child profiles without auth.users entries (like offline players)
-- 3. Age-based access control (kids < 14, teen 14-15, full 16+)
-- 4. Temporary login codes for children
-- 5. Consent logging for GDPR compliance
-- ============================================

-- ============================================
-- PART 1: Extend profiles table
-- ============================================

-- Add account_type to distinguish between standard users, guardians, and children
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'standard';

-- Add constraint for valid account types
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'valid_account_type'
    ) THEN
        ALTER TABLE profiles
        ADD CONSTRAINT valid_account_type
        CHECK (account_type IN ('standard', 'child', 'guardian'));
    END IF;
END $$;

-- Add age_mode for UI display (calculated from birthdate)
-- NULL = not calculated, 'kids' = < 14, 'teen' = 14-15, 'full' = 16+
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS age_mode TEXT DEFAULT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'valid_age_mode'
    ) THEN
        ALTER TABLE profiles
        ADD CONSTRAINT valid_age_mode
        CHECK (age_mode IS NULL OR age_mode IN ('kids', 'teen', 'full'));
    END IF;
END $$;

-- ============================================
-- PART 2: Guardian Links Table
-- ============================================

CREATE TABLE IF NOT EXISTS guardian_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The guardian (parent) - must be an auth user
    guardian_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- The child profile - references profiles (not auth.users, since children don't have auth accounts)
    child_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Relationship type
    relationship TEXT NOT NULL DEFAULT 'parent'
        CHECK (relationship IN ('parent', 'grandparent', 'legal_guardian', 'other')),

    -- Is this the primary guardian? (for notifications, decisions)
    is_primary BOOLEAN NOT NULL DEFAULT true,

    -- Granular permissions (can be extended)
    permissions JSONB NOT NULL DEFAULT '{
        "can_view_videos": true,
        "can_view_matches": true,
        "can_view_stats": true,
        "can_edit_profile": true,
        "can_manage_settings": true,
        "receives_notifications": true
    }'::jsonb,

    -- GDPR consent tracking
    consent_given_at TIMESTAMPTZ,
    consent_version TEXT,
    consent_ip_address TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Prevent duplicate guardian-child links
    UNIQUE(guardian_id, child_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_guardian_links_guardian_id ON guardian_links(guardian_id);
CREATE INDEX IF NOT EXISTS idx_guardian_links_child_id ON guardian_links(child_id);

-- ============================================
-- PART 3: Child Login Codes Table
-- ============================================

CREATE TABLE IF NOT EXISTS child_login_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which child this code is for
    child_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Which guardian generated this code
    guardian_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- The login code (6 characters, alphanumeric, no confusing chars)
    code TEXT NOT NULL,

    -- Expiration (short-lived for security, default 15 minutes)
    expires_at TIMESTAMPTZ NOT NULL,

    -- Was this code used?
    used_at TIMESTAMPTZ,

    -- Device info for security
    used_device_info JSONB,

    -- Rate limiting: track failed attempts
    failed_attempts INT NOT NULL DEFAULT 0,
    last_failed_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Each code must be unique while active
    UNIQUE(code)
);

-- Index for code lookups
CREATE INDEX IF NOT EXISTS idx_child_login_codes_code ON child_login_codes(code) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_child_login_codes_child_id ON child_login_codes(child_id);

-- ============================================
-- PART 4: Consent Log Table (GDPR compliance)
-- ============================================

CREATE TABLE IF NOT EXISTS guardian_consent_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    guardian_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- What was consented to
    consent_type TEXT NOT NULL CHECK (consent_type IN ('registration', 'data_processing', 'video_upload', 'terms_update')),

    -- Version of terms/policy
    terms_version TEXT NOT NULL,

    -- When and how
    consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address TEXT,
    user_agent TEXT,

    -- Additional metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_consent_log_guardian ON guardian_consent_log(guardian_id);
CREATE INDEX IF NOT EXISTS idx_consent_log_child ON guardian_consent_log(child_id);

-- ============================================
-- PART 5: Functions
-- ============================================

-- Function to calculate age from birthdate
CREATE OR REPLACE FUNCTION calculate_age(p_birthdate DATE)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p_birthdate IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN EXTRACT(YEAR FROM age(CURRENT_DATE, p_birthdate))::INT;
END;
$$;

-- Function to determine age_mode from birthdate
CREATE OR REPLACE FUNCTION calculate_age_mode(p_birthdate DATE)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_age INT;
BEGIN
    IF p_birthdate IS NULL THEN
        RETURN NULL;
    END IF;

    v_age := calculate_age(p_birthdate);

    IF v_age < 14 THEN
        RETURN 'kids';
    ELSIF v_age < 16 THEN
        RETURN 'teen';
    ELSE
        RETURN 'full';
    END IF;
END;
$$;

-- Trigger function to automatically update age_mode when birthdate changes
CREATE OR REPLACE FUNCTION update_age_mode()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only update if birthdate changed or is being set
    IF NEW.birthdate IS DISTINCT FROM OLD.birthdate THEN
        NEW.age_mode := calculate_age_mode(NEW.birthdate::DATE);
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- Create trigger on profiles
DROP TRIGGER IF EXISTS trigger_update_age_mode ON profiles;
CREATE TRIGGER trigger_update_age_mode
    BEFORE INSERT OR UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_age_mode();

-- ============================================
-- PART 6: Create Child Profile Function
-- ============================================

CREATE OR REPLACE FUNCTION create_child_profile(
    p_first_name TEXT,
    p_last_name TEXT,
    p_birthdate TEXT,
    p_gender TEXT DEFAULT NULL,
    p_club_id UUID DEFAULT NULL,
    p_sport_id UUID DEFAULT NULL,
    p_subgroup_ids UUID[] DEFAULT '{}'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_guardian_id UUID;
    v_guardian_profile RECORD;
    v_child_id UUID;
    v_display_name TEXT;
    v_age INT;
    v_age_mode TEXT;
    v_result JSON;
BEGIN
    -- Get the caller's ID (must be authenticated)
    v_guardian_id := auth.uid();

    IF v_guardian_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get guardian's profile to check account type and get club if not provided
    SELECT * INTO v_guardian_profile
    FROM profiles
    WHERE id = v_guardian_id;

    -- Verify caller is a guardian (or will become one)
    -- First-time guardians will have 'standard' account type
    IF v_guardian_profile.account_type NOT IN ('standard', 'guardian') THEN
        RAISE EXCEPTION 'Only guardians can create child profiles';
    END IF;

    -- Validate birthdate and check age
    IF p_birthdate IS NULL THEN
        RAISE EXCEPTION 'Birthdate is required for child profiles';
    END IF;

    v_age := calculate_age(p_birthdate::DATE);
    v_age_mode := calculate_age_mode(p_birthdate::DATE);

    IF v_age >= 16 THEN
        RAISE EXCEPTION 'Child must be under 16 years old. Users 16+ should register themselves.';
    END IF;

    -- Use guardian's club if not provided
    IF p_club_id IS NULL THEN
        p_club_id := v_guardian_profile.club_id;
    END IF;

    -- Generate child ID
    v_child_id := gen_random_uuid();
    v_display_name := TRIM(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, ''));

    -- Create child profile (similar to offline player)
    INSERT INTO profiles (
        id,
        first_name,
        last_name,
        display_name,
        birthdate,
        gender,
        club_id,
        active_sport_id,
        subgroup_ids,
        role,
        account_type,
        age_mode,
        is_offline,
        onboarding_complete,
        elo_rating,
        highest_elo,
        xp,
        points,
        created_at,
        updated_at
    ) VALUES (
        v_child_id,
        p_first_name,
        p_last_name,
        v_display_name,
        p_birthdate::DATE,
        p_gender,
        p_club_id,
        p_sport_id,
        p_subgroup_ids,
        'player',
        'child',
        v_age_mode,
        TRUE,  -- Children are like offline players (no auth account)
        FALSE, -- Onboarding not complete
        800,
        800,
        0,
        0,
        now(),
        now()
    );

    -- Create profile_club_sports entry if sport provided
    IF p_sport_id IS NOT NULL AND p_club_id IS NOT NULL THEN
        INSERT INTO profile_club_sports (user_id, club_id, sport_id, role, created_at)
        VALUES (v_child_id, p_club_id, p_sport_id, 'player', now())
        ON CONFLICT (user_id, club_id, sport_id) DO NOTHING;
    END IF;

    -- Create guardian link
    INSERT INTO guardian_links (
        guardian_id,
        child_id,
        relationship,
        is_primary,
        consent_given_at,
        consent_version
    ) VALUES (
        v_guardian_id,
        v_child_id,
        'parent',
        TRUE,
        now(),
        '1.0'
    );

    -- Update guardian's account type if needed
    IF v_guardian_profile.account_type = 'standard' THEN
        UPDATE profiles
        SET account_type = 'guardian'
        WHERE id = v_guardian_id;
    END IF;

    -- Log consent
    INSERT INTO guardian_consent_log (
        guardian_id,
        child_id,
        consent_type,
        terms_version
    ) VALUES (
        v_guardian_id,
        v_child_id,
        'registration',
        '1.0'
    );

    -- Return the new child profile
    SELECT json_build_object(
        'success', TRUE,
        'child_id', v_child_id,
        'first_name', p_first_name,
        'last_name', p_last_name,
        'age', v_age,
        'age_mode', v_age_mode,
        'club_id', p_club_id
    ) INTO v_result;

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', FALSE,
        'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION create_child_profile TO authenticated;

-- ============================================
-- PART 7: Generate Child Login Code Function
-- ============================================

CREATE OR REPLACE FUNCTION generate_child_login_code(
    p_child_id UUID,
    p_validity_minutes INT DEFAULT 15
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_guardian_id UUID;
    v_code TEXT;
    v_expires_at TIMESTAMPTZ;
    v_is_guardian BOOLEAN;
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
        RAISE EXCEPTION 'Not authorized: You are not the guardian of this child';
    END IF;

    -- Invalidate any existing unused codes for this child
    UPDATE child_login_codes
    SET expires_at = now()
    WHERE child_id = p_child_id
    AND used_at IS NULL
    AND expires_at > now();

    -- Generate a new 6-character code (no confusing characters: 0/O, 1/I/l)
    v_code := '';
    FOR i IN 1..6 LOOP
        v_code := v_code || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', floor(random() * 32 + 1)::int, 1);
    END LOOP;

    v_expires_at := now() + (p_validity_minutes || ' minutes')::interval;

    -- Insert new code
    INSERT INTO child_login_codes (
        child_id,
        guardian_id,
        code,
        expires_at
    ) VALUES (
        p_child_id,
        v_guardian_id,
        v_code,
        v_expires_at
    );

    RETURN json_build_object(
        'success', TRUE,
        'code', v_code,
        'expires_at', v_expires_at,
        'validity_minutes', p_validity_minutes
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', FALSE,
        'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION generate_child_login_code TO authenticated;

-- ============================================
-- PART 8: Validate Child Login Code Function
-- ============================================

CREATE OR REPLACE FUNCTION validate_child_login_code(
    p_code TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_code_record RECORD;
    v_child_profile RECORD;
BEGIN
    -- Normalize code (uppercase, trim)
    p_code := UPPER(TRIM(p_code));

    -- Find the code
    SELECT * INTO v_code_record
    FROM child_login_codes
    WHERE code = p_code
    AND used_at IS NULL
    AND expires_at > now()
    AND failed_attempts < 5;  -- Block after 5 failed attempts

    IF NOT FOUND THEN
        -- Check if code exists but is invalid (for better error message)
        SELECT * INTO v_code_record
        FROM child_login_codes
        WHERE code = p_code;

        IF FOUND THEN
            IF v_code_record.used_at IS NOT NULL THEN
                RETURN json_build_object('success', FALSE, 'error', 'Code wurde bereits verwendet');
            ELSIF v_code_record.expires_at <= now() THEN
                RETURN json_build_object('success', FALSE, 'error', 'Code ist abgelaufen');
            ELSIF v_code_record.failed_attempts >= 5 THEN
                RETURN json_build_object('success', FALSE, 'error', 'Zu viele Fehlversuche. Bitte neuen Code generieren.');
            END IF;
        END IF;

        RETURN json_build_object('success', FALSE, 'error', 'Ungültiger Code');
    END IF;

    -- Mark code as used
    UPDATE child_login_codes
    SET used_at = now()
    WHERE id = v_code_record.id;

    -- Get child profile
    SELECT * INTO v_child_profile
    FROM profiles
    WHERE id = v_code_record.child_id;

    RETURN json_build_object(
        'success', TRUE,
        'child_id', v_child_profile.id,
        'first_name', v_child_profile.first_name,
        'last_name', v_child_profile.last_name,
        'age_mode', v_child_profile.age_mode,
        'club_id', v_child_profile.club_id,
        'guardian_id', v_code_record.guardian_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', FALSE,
        'error', SQLERRM
    );
END;
$$;

-- This function can be called without authentication (for child login)
GRANT EXECUTE ON FUNCTION validate_child_login_code TO anon;
GRANT EXECUTE ON FUNCTION validate_child_login_code TO authenticated;

-- ============================================
-- PART 9: Get Guardian's Children Function
-- ============================================

CREATE OR REPLACE FUNCTION get_guardian_children()
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
            'xp', p.xp,
            'elo_rating', p.elo_rating,
            'relationship', gl.relationship,
            'is_primary', gl.is_primary,
            'permissions', gl.permissions
        )
    ) INTO v_children
    FROM guardian_links gl
    JOIN profiles p ON p.id = gl.child_id
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

GRANT EXECUTE ON FUNCTION get_guardian_children TO authenticated;

-- ============================================
-- PART 10: RLS Policies
-- ============================================

-- Enable RLS on new tables
ALTER TABLE guardian_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_login_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_consent_log ENABLE ROW LEVEL SECURITY;

-- Guardian Links Policies
CREATE POLICY "Guardians can view their own links"
    ON guardian_links FOR SELECT
    USING (guardian_id = auth.uid());

CREATE POLICY "Guardians can insert links for themselves"
    ON guardian_links FOR INSERT
    WITH CHECK (guardian_id = auth.uid());

CREATE POLICY "Guardians can update their own links"
    ON guardian_links FOR UPDATE
    USING (guardian_id = auth.uid());

-- Child Login Codes Policies
CREATE POLICY "Guardians can view codes they created"
    ON child_login_codes FOR SELECT
    USING (guardian_id = auth.uid());

CREATE POLICY "Guardians can create codes for their children"
    ON child_login_codes FOR INSERT
    WITH CHECK (
        guardian_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM guardian_links
            WHERE guardian_id = auth.uid()
            AND child_id = child_login_codes.child_id
        )
    );

-- Consent Log Policies
CREATE POLICY "Guardians can view their consent logs"
    ON guardian_consent_log FOR SELECT
    USING (guardian_id = auth.uid());

CREATE POLICY "Guardians can insert consent logs"
    ON guardian_consent_log FOR INSERT
    WITH CHECK (guardian_id = auth.uid());

-- Profiles Policy Update: Guardians can view their children's profiles
-- (This is in addition to existing policies)
DO $$
BEGIN
    -- Drop existing policy if it exists
    DROP POLICY IF EXISTS "Guardians can view their children profiles" ON profiles;

    -- Create new policy
    CREATE POLICY "Guardians can view their children profiles"
        ON profiles FOR SELECT
        USING (
            id IN (
                SELECT child_id FROM guardian_links
                WHERE guardian_id = auth.uid()
            )
        );
EXCEPTION WHEN OTHERS THEN
    NULL; -- Ignore if policy already exists with different definition
END $$;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Guardians can update their children profiles" ON profiles;

    CREATE POLICY "Guardians can update their children profiles"
        ON profiles FOR UPDATE
        USING (
            id IN (
                SELECT child_id FROM guardian_links
                WHERE guardian_id = auth.uid()
                AND (permissions->>'can_edit_profile')::boolean = true
            )
        );
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- ============================================
-- PART 11: Update existing profiles with age_mode
-- ============================================

-- Backfill age_mode for existing profiles with birthdate
UPDATE profiles
SET age_mode = calculate_age_mode(birthdate::DATE)
WHERE birthdate IS NOT NULL
AND age_mode IS NULL;

-- ============================================
-- PART 12: Verification Queries
-- ============================================

-- Verify tables exist
DO $$
BEGIN
    RAISE NOTICE 'Guardian System Migration Complete!';
    RAISE NOTICE 'Tables created: guardian_links, child_login_codes, guardian_consent_log';
    RAISE NOTICE 'Functions created: create_child_profile, generate_child_login_code, validate_child_login_code, get_guardian_children';
    RAISE NOTICE 'Triggers created: trigger_update_age_mode';
END $$;
