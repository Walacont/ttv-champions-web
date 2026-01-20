-- Hard Delete Account - Complete data removal
-- Run this in Supabase SQL Editor to enable complete account deletion
-- This replaces soft delete/anonymization with true hard delete

-- ========================================================================
-- FUNCTION: hard_delete_account
-- Deletes ALL user data from the database (GDPR compliant full deletion)
-- ========================================================================
CREATE OR REPLACE FUNCTION hard_delete_account(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_own_account BOOLEAN;
    v_is_guardian_of_child BOOLEAN;
    v_profile_exists BOOLEAN;
BEGIN
    -- Check if profile exists
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) INTO v_profile_exists;

    IF NOT v_profile_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Profil nicht gefunden'
        );
    END IF;

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

    -- =====================================================
    -- DELETE ALL USER DATA (order matters for FK constraints)
    -- =====================================================

    -- 1. Delete guardian relationships (both as guardian and as child)
    DELETE FROM guardian_links WHERE guardian_id = p_user_id OR child_id = p_user_id;

    -- 2. Delete all match-related data
    -- Singles matches (as player A, B, winner, or loser)
    DELETE FROM matches
    WHERE player_a_id = p_user_id
       OR player_b_id = p_user_id
       OR winner_id = p_user_id
       OR loser_id = p_user_id;

    -- Match requests
    DELETE FROM match_requests
    WHERE player_a_id = p_user_id
       OR player_b_id = p_user_id
       OR winner_id = p_user_id
       OR loser_id = p_user_id;

    -- Match proposals
    DELETE FROM match_proposals
    WHERE requester_id = p_user_id OR recipient_id = p_user_id;

    -- 3. Delete doubles match data
    DELETE FROM doubles_matches
    WHERE team_a_player1_id = p_user_id
       OR team_a_player2_id = p_user_id
       OR team_b_player1_id = p_user_id
       OR team_b_player2_id = p_user_id;

    DELETE FROM doubles_match_requests
    WHERE initiated_by = p_user_id
       OR (team_a->>'player1_id')::UUID = p_user_id
       OR (team_a->>'player2_id')::UUID = p_user_id
       OR (team_b->>'player1_id')::UUID = p_user_id
       OR (team_b->>'player2_id')::UUID = p_user_id;

    -- Delete doubles pairings where user is involved
    DELETE FROM doubles_pairings
    WHERE player1_id = p_user_id OR player2_id = p_user_id;

    -- 4. Delete attendance records
    DELETE FROM attendance WHERE user_id = p_user_id;

    -- 5. Delete history records
    DELETE FROM points_history WHERE user_id = p_user_id;
    DELETE FROM xp_history WHERE user_id = p_user_id;

    -- 6. Delete streaks
    DELETE FROM streaks WHERE user_id = p_user_id;

    -- 7. Delete completed challenges and exercises
    DELETE FROM completed_challenges WHERE user_id = p_user_id;
    DELETE FROM completed_exercises WHERE user_id = p_user_id;
    DELETE FROM exercise_milestones WHERE user_id = p_user_id;

    -- 8. Delete notifications
    DELETE FROM notifications WHERE user_id = p_user_id;

    -- 9. Delete social data (friends, followers)
    DELETE FROM friends WHERE user_id = p_user_id OR friend_id = p_user_id;
    DELETE FROM followers WHERE follower_id = p_user_id OR followed_id = p_user_id;

    -- Delete follow requests if table exists
    BEGIN
        DELETE FROM follow_requests WHERE requester_id = p_user_id OR target_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN
        -- Table doesn't exist, skip
    END;

    -- 10. Delete activity events (posts, likes, comments)
    BEGIN
        DELETE FROM activity_likes WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
        DELETE FROM activity_comments WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
        DELETE FROM activity_events WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- 11. Delete community posts
    BEGIN
        DELETE FROM posts WHERE author_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
        DELETE FROM poll_votes WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- 12. Delete club requests
    DELETE FROM club_requests WHERE player_id = p_user_id;
    DELETE FROM leave_club_requests WHERE player_id = p_user_id;

    -- 13. Delete subgroup memberships
    DELETE FROM subgroup_members WHERE user_id = p_user_id;

    -- 14. Clear record holder references in exercises (set to NULL)
    UPDATE exercises SET
        record_holder_id = NULL,
        record_holder_name = NULL
    WHERE record_holder_id = p_user_id;

    -- 15. Delete user preferences if table exists
    BEGIN
        DELETE FROM user_preferences WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- 16. Delete user sport stats if table exists
    BEGIN
        DELETE FROM user_sport_stats WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- 17. Delete profile club sports if table exists
    BEGIN
        DELETE FROM profile_club_sports WHERE profile_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- 18. FINALLY: Delete the profile itself
    DELETE FROM profiles WHERE id = p_user_id;

    -- 19. Delete the auth account (for regular accounts, not child accounts)
    -- Child accounts don't have auth.users entries
    IF v_is_own_account THEN
        DELETE FROM auth.users WHERE id = p_user_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Account und alle Daten wurden vollständig gelöscht'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION hard_delete_account(UUID) TO authenticated;

-- ========================================================================
-- Also update the old anonymize_account to call hard_delete_account
-- This ensures backwards compatibility
-- ========================================================================
CREATE OR REPLACE FUNCTION anonymize_account(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Now just calls hard_delete_account for complete deletion
    RETURN hard_delete_account(p_user_id);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION anonymize_account(UUID) TO authenticated;
