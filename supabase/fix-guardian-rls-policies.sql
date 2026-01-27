-- ============================================
-- Fix: Add missing RLS policies for guardian access
-- ============================================
-- Guardians need to be able to:
-- 1. Manage club requests for their children
-- 2. Manage leave requests for their children
-- 3. Upload profile pictures for their children
-- 4. Delete (anonymize) their children's accounts
-- ============================================

-- ============================================
-- PART 1: club_requests - Guardian Policies
-- ============================================

-- Guardian can view their children's club requests
DROP POLICY IF EXISTS "Guardians can view child club requests" ON club_requests;
CREATE POLICY "Guardians can view child club requests"
    ON club_requests FOR SELECT
    USING (
        player_id IN (
            SELECT child_id FROM guardian_links
            WHERE guardian_id = auth.uid()
        )
    );

-- Guardian can create club requests for their children
DROP POLICY IF EXISTS "Guardians can create club requests for children" ON club_requests;
CREATE POLICY "Guardians can create club requests for children"
    ON club_requests FOR INSERT
    WITH CHECK (
        player_id IN (
            SELECT child_id FROM guardian_links
            WHERE guardian_id = auth.uid()
        )
    );

-- Guardian can withdraw (delete) their children's pending club requests
DROP POLICY IF EXISTS "Guardians can withdraw child club requests" ON club_requests;
CREATE POLICY "Guardians can withdraw child club requests"
    ON club_requests FOR DELETE
    USING (
        status = 'pending'
        AND player_id IN (
            SELECT child_id FROM guardian_links
            WHERE guardian_id = auth.uid()
        )
    );

-- ============================================
-- PART 2: leave_club_requests - Guardian Policies
-- ============================================

-- Guardian can view their children's leave requests
DROP POLICY IF EXISTS "Guardians can view child leave requests" ON leave_club_requests;
CREATE POLICY "Guardians can view child leave requests"
    ON leave_club_requests FOR SELECT
    USING (
        player_id IN (
            SELECT child_id FROM guardian_links
            WHERE guardian_id = auth.uid()
        )
    );

-- Guardian can create leave requests for their children
DROP POLICY IF EXISTS "Guardians can create leave requests for children" ON leave_club_requests;
CREATE POLICY "Guardians can create leave requests for children"
    ON leave_club_requests FOR INSERT
    WITH CHECK (
        player_id IN (
            SELECT child_id FROM guardian_links
            WHERE guardian_id = auth.uid()
        )
    );

-- Guardian can withdraw (delete) their children's pending leave requests
DROP POLICY IF EXISTS "Guardians can withdraw child leave requests" ON leave_club_requests;
CREATE POLICY "Guardians can withdraw child leave requests"
    ON leave_club_requests FOR DELETE
    USING (
        status = 'pending'
        AND player_id IN (
            SELECT child_id FROM guardian_links
            WHERE guardian_id = auth.uid()
        )
    );

-- ============================================
-- PART 3: Storage - Profile Pictures Bucket
-- ============================================

-- Create bucket if not exists (will error if exists, which is fine)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'profile-pictures',
    'profile-pictures',
    true,  -- Public bucket so avatar URLs work without auth
    5242880,  -- 5MB limit
    ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Users can upload to their own folder
DROP POLICY IF EXISTS "Users can upload own profile pictures" ON storage.objects;
CREATE POLICY "Users can upload own profile pictures"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'profile-pictures'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users can update their own profile pictures
DROP POLICY IF EXISTS "Users can update own profile pictures" ON storage.objects;
CREATE POLICY "Users can update own profile pictures"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'profile-pictures'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Users can delete their own profile pictures
DROP POLICY IF EXISTS "Users can delete own profile pictures" ON storage.objects;
CREATE POLICY "Users can delete own profile pictures"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'profile-pictures'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Guardians can upload profile pictures for their children
DROP POLICY IF EXISTS "Guardians can upload child profile pictures" ON storage.objects;
CREATE POLICY "Guardians can upload child profile pictures"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'profile-pictures'
        AND (storage.foldername(name))[1] IN (
            SELECT child_id::text FROM guardian_links
            WHERE guardian_id = auth.uid()
            AND (permissions->>'can_edit_profile')::boolean = true
        )
    );

-- Guardians can update profile pictures for their children
DROP POLICY IF EXISTS "Guardians can update child profile pictures" ON storage.objects;
CREATE POLICY "Guardians can update child profile pictures"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'profile-pictures'
        AND (storage.foldername(name))[1] IN (
            SELECT child_id::text FROM guardian_links
            WHERE guardian_id = auth.uid()
            AND (permissions->>'can_edit_profile')::boolean = true
        )
    );

-- Public can view all profile pictures (needed for avatars to display)
DROP POLICY IF EXISTS "Public can view profile pictures" ON storage.objects;
CREATE POLICY "Public can view profile pictures"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'profile-pictures');

-- ============================================
-- PART 4: anonymize_account - Guardian Support
-- ============================================

-- Replace the anonymize_account function to support guardian deletion of children
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
        qttr_points = NULL,
        privacy_settings = '{}'::jsonb,
        notification_preferences = '{}'::jsonb,
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

-- ============================================
-- PART 5: Privacy Settings - Guardian Access
-- ============================================

-- Ensure guardians can update privacy_settings for their children
-- (This should already be covered by the general UPDATE policy, but let's be explicit)

-- The profiles UPDATE policy from guardian-system.sql should cover this:
-- "Guardians can update their children profiles" checks can_edit_profile permission

-- Note: privacy_settings is a JSONB column in profiles, so the UPDATE policy covers it
