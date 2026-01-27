-- ============================================
-- Fix: Filter deleted children from guardian dashboard
-- ============================================
-- Problem: When a child profile is deleted (anonymized), it still appears
-- in the guardian dashboard because:
-- 1. get_guardian_children() doesn't filter deleted profiles
-- 2. guardian_links may not be properly deleted
--
-- Note: Deleted profiles are identified by email LIKE 'deleted_%@anonymous.local'
-- (set by anonymize_account function), NOT by an is_deleted column
-- ============================================

-- ============================================
-- PART 1: Update get_guardian_children to filter deleted profiles
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
            'username', p.username,
            'has_pin', (p.pin_hash IS NOT NULL),
            'relationship', gl.relationship,
            'is_primary', gl.is_primary,
            'permissions', gl.permissions
        )
    ) INTO v_children
    FROM guardian_links gl
    JOIN profiles p ON p.id = gl.child_id
    WHERE gl.guardian_id = v_guardian_id
      AND p.email NOT LIKE 'deleted_%@anonymous.local';  -- Filter out deleted/anonymized profiles

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

-- ============================================
-- PART 2: Clean up orphaned guardian_links for deleted profiles
-- ============================================

-- Remove any guardian_links where the child profile has been deleted/anonymized
DELETE FROM guardian_links
WHERE child_id IN (
    SELECT id FROM profiles WHERE email LIKE 'deleted_%@anonymous.local'
);

-- ============================================
-- PART 3: Add trigger to auto-delete guardian_links when profile is anonymized
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_guardian_links_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- When a profile is anonymized (email changed to deleted_*), remove all guardian links
    IF NEW.email LIKE 'deleted_%@anonymous.local' AND (OLD.email IS NULL OR OLD.email NOT LIKE 'deleted_%@anonymous.local') THEN
        DELETE FROM guardian_links WHERE child_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_cleanup_guardian_links ON profiles;

CREATE TRIGGER trigger_cleanup_guardian_links
    AFTER UPDATE OF email ON profiles
    FOR EACH ROW
    WHEN (NEW.email LIKE 'deleted_%@anonymous.local')
    EXECUTE FUNCTION cleanup_guardian_links_on_delete();

-- ============================================
-- PART 4: Verification
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Guardian Children Delete Fix Complete!';
    RAISE NOTICE 'Changes:';
    RAISE NOTICE '  1. get_guardian_children() now filters out anonymized profiles (email LIKE deleted_%%)';
    RAISE NOTICE '  2. Cleaned up orphaned guardian_links for already-deleted profiles';
    RAISE NOTICE '  3. Added trigger to auto-cleanup guardian_links when profile is anonymized';
END $$;
