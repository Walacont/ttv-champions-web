-- ============================================
-- Migration: Delete old codes when generating new ones
-- Instead of just invalidating old codes, delete them to keep the database clean
-- ============================================

-- ============================================
-- PART 1: Update generate_child_login_code function
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

    -- DELETE any existing unused codes for this child (instead of just invalidating)
    DELETE FROM child_login_codes
    WHERE child_id = p_child_id
    AND used_at IS NULL;

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
-- PART 2: Update generate_guardian_invite_code function
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

    -- DELETE any existing unused guardian invite codes for this child (GRD- prefix)
    DELETE FROM child_login_codes
    WHERE child_id = p_child_id
    AND used_at IS NULL
    AND code LIKE 'GRD-%';

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
        'expires_at', now() + (p_validity_minutes || ' minutes')::interval,
        'validity_minutes', p_validity_minutes
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION generate_guardian_invite_code TO authenticated;

-- ============================================
-- PART 3: Cleanup - delete all expired and used codes
-- This can be run periodically to keep the table clean
-- ============================================

-- Delete old used codes (older than 30 days)
DELETE FROM child_login_codes
WHERE used_at IS NOT NULL
AND used_at < now() - interval '30 days';

-- Delete old expired codes (older than 7 days)
DELETE FROM child_login_codes
WHERE expires_at < now() - interval '7 days'
AND used_at IS NULL;

-- ============================================
-- PART 4: Verification
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Migration Complete: Delete old codes on regenerate';
    RAISE NOTICE 'Updated functions: generate_child_login_code, generate_guardian_invite_code';
    RAISE NOTICE 'Old unused codes will now be deleted when new codes are generated';
END $$;
