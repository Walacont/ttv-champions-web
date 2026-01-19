-- ============================================
-- Guardian System V2: Extended Features
-- ============================================
-- This migration adds:
-- 1. is_guardian flag (allows player + guardian simultaneously)
-- 2. Extended club_requests for guardian join requests
-- 3. Child upgrade functionality (when turning 16)
-- 4. Duplicate child prevention
-- ============================================

-- ============================================
-- PART 1: Add is_guardian flag to profiles
-- ============================================

-- Add is_guardian boolean flag
-- This allows a user to be both a player AND a guardian
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_guardian BOOLEAN DEFAULT false;

-- Create index for quick guardian lookups
CREATE INDEX IF NOT EXISTS idx_profiles_is_guardian ON profiles(is_guardian) WHERE is_guardian = true;

-- Update existing guardians: Set is_guardian = true where account_type = 'guardian'
UPDATE profiles
SET is_guardian = true
WHERE account_type = 'guardian';

-- ============================================
-- PART 2: Extend club_requests for guardian joins
-- ============================================

-- Add columns for guardian join requests with child data
ALTER TABLE club_requests
ADD COLUMN IF NOT EXISTS request_type TEXT DEFAULT 'member';

ALTER TABLE club_requests
ADD COLUMN IF NOT EXISTS child_first_name TEXT;

ALTER TABLE club_requests
ADD COLUMN IF NOT EXISTS child_last_name TEXT;

ALTER TABLE club_requests
ADD COLUMN IF NOT EXISTS child_birthdate DATE;

ALTER TABLE club_requests
ADD COLUMN IF NOT EXISTS child_gender TEXT;

-- Add constraint for valid request types
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'valid_request_type'
    ) THEN
        ALTER TABLE club_requests
        ADD CONSTRAINT valid_request_type
        CHECK (request_type IN ('member', 'guardian'));
    END IF;
END $$;

-- ============================================
-- PART 3: Function to check for duplicate children
-- ============================================

CREATE OR REPLACE FUNCTION check_duplicate_child(
    p_club_id UUID,
    p_first_name TEXT,
    p_last_name TEXT,
    p_birthdate DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_child RECORD;
BEGIN
    -- Search for existing child profile with same name and birthdate in the club
    SELECT id, first_name, last_name, birthdate, display_name
    INTO v_existing_child
    FROM profiles
    WHERE club_id = p_club_id
    AND LOWER(TRIM(first_name)) = LOWER(TRIM(p_first_name))
    AND LOWER(TRIM(last_name)) = LOWER(TRIM(p_last_name))
    AND birthdate = p_birthdate
    AND (account_type = 'child' OR is_offline = true)
    LIMIT 1;

    IF FOUND THEN
        RETURN json_build_object(
            'found', true,
            'child_id', v_existing_child.id,
            'display_name', v_existing_child.display_name,
            'message', 'Ein Kind mit diesem Namen und Geburtsdatum existiert bereits im Verein.'
        );
    END IF;

    RETURN json_build_object(
        'found', false,
        'child_id', NULL,
        'message', NULL
    );
END;
$$;

GRANT EXECUTE ON FUNCTION check_duplicate_child TO authenticated;

-- ============================================
-- PART 4: Function to link guardian to existing child
-- ============================================

CREATE OR REPLACE FUNCTION link_guardian_to_child(
    p_child_id UUID,
    p_child_birthdate DATE  -- For verification
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_guardian_id UUID;
    v_child RECORD;
    v_existing_link RECORD;
BEGIN
    v_guardian_id := auth.uid();

    IF v_guardian_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get child profile
    SELECT * INTO v_child
    FROM profiles
    WHERE id = p_child_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Kind nicht gefunden'
        );
    END IF;

    -- Verify birthdate matches
    IF v_child.birthdate != p_child_birthdate THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Geburtsdatum stimmt nicht überein'
        );
    END IF;

    -- Check if link already exists
    SELECT * INTO v_existing_link
    FROM guardian_links
    WHERE guardian_id = v_guardian_id
    AND child_id = p_child_id;

    IF FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Du bist bereits als Vormund für dieses Kind registriert'
        );
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
        p_child_id,
        'parent',
        false,  -- Not primary if linking to existing child
        now(),
        '1.0'
    );

    -- Update guardian's is_guardian flag
    UPDATE profiles
    SET is_guardian = true
    WHERE id = v_guardian_id
    AND is_guardian = false;

    -- Log consent
    INSERT INTO guardian_consent_log (
        guardian_id,
        child_id,
        consent_type,
        terms_version
    ) VALUES (
        v_guardian_id,
        p_child_id,
        'registration',
        '1.0'
    );

    RETURN json_build_object(
        'success', true,
        'child_id', p_child_id,
        'child_name', v_child.display_name
    );
END;
$$;

GRANT EXECUTE ON FUNCTION link_guardian_to_child TO authenticated;

-- ============================================
-- PART 5: Function to upgrade child to full account
-- ============================================

CREATE OR REPLACE FUNCTION upgrade_child_account(
    p_child_id UUID,
    p_email TEXT,
    p_guardian_approval BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_child RECORD;
    v_age INT;
    v_is_guardian BOOLEAN;
BEGIN
    v_caller_id := auth.uid();

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get child profile
    SELECT * INTO v_child
    FROM profiles
    WHERE id = p_child_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Kind nicht gefunden'
        );
    END IF;

    -- Check if child is old enough (16+)
    v_age := calculate_age(v_child.birthdate);
    IF v_age < 16 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Das Kind muss mindestens 16 Jahre alt sein'
        );
    END IF;

    -- Check caller is guardian of this child (for approval)
    SELECT EXISTS (
        SELECT 1 FROM guardian_links
        WHERE guardian_id = v_caller_id
        AND child_id = p_child_id
    ) INTO v_is_guardian;

    IF NOT v_is_guardian THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Nur Vormünder können das Upgrade genehmigen'
        );
    END IF;

    -- Update child profile
    UPDATE profiles
    SET
        account_type = 'standard',
        age_mode = 'full',
        email = p_email,
        updated_at = now()
    WHERE id = p_child_id;

    -- Note: The actual auth.users entry needs to be created separately
    -- This function just prepares the profile

    RETURN json_build_object(
        'success', true,
        'message', 'Kind-Profil wurde für Upgrade vorbereitet. E-Mail-Verifizierung erforderlich.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION upgrade_child_account TO authenticated;

-- ============================================
-- PART 6: Function to process guardian club request
-- ============================================

CREATE OR REPLACE FUNCTION approve_guardian_club_request(
    p_request_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach_id UUID;
    v_request RECORD;
    v_child_id UUID;
    v_age_mode TEXT;
BEGIN
    v_coach_id := auth.uid();

    IF v_coach_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get request
    SELECT * INTO v_request
    FROM club_requests
    WHERE id = p_request_id
    AND status = 'pending'
    AND request_type = 'guardian';

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Anfrage nicht gefunden oder bereits bearbeitet'
        );
    END IF;

    -- Verify coach is in the same club
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = v_coach_id
        AND club_id = v_request.club_id
        AND role IN ('coach', 'head_coach')
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Keine Berechtigung für diesen Verein'
        );
    END IF;

    -- Calculate age mode for child
    v_age_mode := calculate_age_mode(v_request.child_birthdate);

    -- Create child profile
    v_child_id := gen_random_uuid();

    INSERT INTO profiles (
        id,
        first_name,
        last_name,
        display_name,
        birthdate,
        gender,
        club_id,
        role,
        account_type,
        age_mode,
        is_offline,
        is_match_ready,
        onboarding_complete,
        elo_rating,
        highest_elo,
        xp,
        points,
        created_at,
        updated_at
    ) VALUES (
        v_child_id,
        v_request.child_first_name,
        v_request.child_last_name,
        TRIM(v_request.child_first_name || ' ' || v_request.child_last_name),
        v_request.child_birthdate,
        v_request.child_gender,
        v_request.club_id,
        'player',
        'child',
        v_age_mode,
        true,  -- Like offline player
        false,
        false,
        800,
        800,
        0,
        0,
        now(),
        now()
    );

    -- Create guardian link
    INSERT INTO guardian_links (
        guardian_id,
        child_id,
        relationship,
        is_primary,
        consent_given_at,
        consent_version
    ) VALUES (
        v_request.player_id,
        v_child_id,
        'parent',
        true,
        now(),
        '1.0'
    );

    -- Update guardian's is_guardian flag
    UPDATE profiles
    SET is_guardian = true
    WHERE id = v_request.player_id
    AND is_guardian = false;

    -- Update request status
    UPDATE club_requests
    SET
        status = 'approved',
        reviewed_at = now(),
        reviewed_by = v_coach_id
    WHERE id = p_request_id;

    -- Create notification for guardian
    INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        data,
        is_read
    ) VALUES (
        v_request.player_id,
        'guardian_request_approved',
        'Beitrittsanfrage akzeptiert',
        v_request.child_first_name || ' wurde erfolgreich im Verein aufgenommen.',
        json_build_object('child_id', v_child_id, 'club_id', v_request.club_id),
        false
    );

    RETURN json_build_object(
        'success', true,
        'child_id', v_child_id,
        'message', 'Kind wurde erfolgreich erstellt und Vormund verknüpft'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION approve_guardian_club_request TO authenticated;

-- ============================================
-- PART 7: Function to get user's children
-- ============================================

CREATE OR REPLACE FUNCTION get_my_children()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_children JSON;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
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
            'gender', p.gender,
            'club_id', p.club_id,
            'club_name', c.name,
            'sport_id', p.active_sport_id,
            'xp', p.xp,
            'elo_rating', p.elo_rating,
            'is_primary', gl.is_primary,
            'can_upgrade', calculate_age(p.birthdate) >= 16 AND p.account_type = 'child'
        )
    ) INTO v_children
    FROM guardian_links gl
    JOIN profiles p ON p.id = gl.child_id
    LEFT JOIN clubs c ON c.id = p.club_id
    WHERE gl.guardian_id = v_user_id;

    RETURN json_build_object(
        'success', true,
        'children', COALESCE(v_children, '[]'::json),
        'count', COALESCE(json_array_length(v_children), 0)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_children TO authenticated;

-- ============================================
-- PART 8: Function to invite additional guardian
-- ============================================

CREATE OR REPLACE FUNCTION generate_guardian_invite_code(
    p_child_id UUID,
    p_validity_minutes INT DEFAULT 1440  -- 24 hours default
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_guardian_id UUID;
    v_is_guardian BOOLEAN;
    v_code TEXT;
    v_child RECORD;
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
            'success', false,
            'error', 'Du bist nicht als Vormund für dieses Kind registriert'
        );
    END IF;

    -- Get child info
    SELECT first_name, last_name INTO v_child
    FROM profiles
    WHERE id = p_child_id;

    -- Generate a unique code (format: GRD-XXXXXX)
    v_code := 'GRD-';
    FOR i IN 1..6 LOOP
        v_code := v_code || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', floor(random() * 32 + 1)::int, 1);
    END LOOP;

    -- Store in child_login_codes table (repurposed for guardian invites too)
    -- We use a different prefix to distinguish
    INSERT INTO child_login_codes (
        child_id,
        guardian_id,
        code,
        expires_at
    ) VALUES (
        p_child_id,
        v_guardian_id,
        v_code,
        now() + (p_validity_minutes || ' minutes')::interval
    );

    RETURN json_build_object(
        'success', true,
        'code', v_code,
        'child_name', v_child.first_name || ' ' || v_child.last_name,
        'expires_in_hours', p_validity_minutes / 60
    );
END;
$$;

GRANT EXECUTE ON FUNCTION generate_guardian_invite_code TO authenticated;

-- ============================================
-- PART 9: Function to accept guardian invite
-- ============================================

CREATE OR REPLACE FUNCTION accept_guardian_invite(
    p_code TEXT,
    p_child_birthdate DATE  -- For verification
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_guardian_id UUID;
    v_code_record RECORD;
    v_child RECORD;
BEGIN
    v_new_guardian_id := auth.uid();

    IF v_new_guardian_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Find the invite code
    SELECT * INTO v_code_record
    FROM child_login_codes
    WHERE code = UPPER(TRIM(p_code))
    AND used_at IS NULL
    AND expires_at > now();

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Ungültiger oder abgelaufener Einladungscode'
        );
    END IF;

    -- Get child
    SELECT * INTO v_child
    FROM profiles
    WHERE id = v_code_record.child_id;

    -- Verify birthdate
    IF v_child.birthdate != p_child_birthdate THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Geburtsdatum stimmt nicht überein'
        );
    END IF;

    -- Check not already a guardian
    IF EXISTS (
        SELECT 1 FROM guardian_links
        WHERE guardian_id = v_new_guardian_id
        AND child_id = v_code_record.child_id
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Du bist bereits als Vormund für dieses Kind registriert'
        );
    END IF;

    -- Mark code as used
    UPDATE child_login_codes
    SET used_at = now()
    WHERE id = v_code_record.id;

    -- Create guardian link
    INSERT INTO guardian_links (
        guardian_id,
        child_id,
        relationship,
        is_primary,
        consent_given_at,
        consent_version
    ) VALUES (
        v_new_guardian_id,
        v_code_record.child_id,
        'parent',
        false,
        now(),
        '1.0'
    );

    -- Update new guardian's is_guardian flag
    UPDATE profiles
    SET is_guardian = true
    WHERE id = v_new_guardian_id
    AND is_guardian = false;

    -- Notify original guardian
    INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        data,
        is_read
    ) VALUES (
        v_code_record.guardian_id,
        'guardian_added',
        'Weiterer Vormund hinzugefügt',
        'Ein weiterer Vormund wurde für ' || v_child.first_name || ' registriert.',
        json_build_object('child_id', v_code_record.child_id, 'new_guardian_id', v_new_guardian_id),
        false
    );

    RETURN json_build_object(
        'success', true,
        'child_id', v_code_record.child_id,
        'child_name', v_child.first_name || ' ' || v_child.last_name,
        'message', 'Du wurdest erfolgreich als Vormund hinzugefügt'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION accept_guardian_invite TO authenticated;

-- ============================================
-- PART 10: Verification
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Guardian System V2 Migration Complete!';
    RAISE NOTICE 'New columns: profiles.is_guardian';
    RAISE NOTICE 'Extended: club_requests with child data';
    RAISE NOTICE 'New functions: check_duplicate_child, link_guardian_to_child, upgrade_child_account';
    RAISE NOTICE 'New functions: approve_guardian_club_request, get_my_children';
    RAISE NOTICE 'New functions: generate_guardian_invite_code, accept_guardian_invite';
END $$;
