-- =====================================================
-- Fix: Anonymize players in matches instead of deleting
-- =====================================================
-- Problem: When a user deletes their account, all their matches are deleted
-- This means the other players lose their match history
--
-- Solution:
-- 1. Allow NULL for player IDs in matches
-- 2. Set player IDs to NULL instead of deleting the match
-- 3. Frontend shows "Gelöschter Spieler" for NULL IDs
-- =====================================================

-- ========================================================================
-- STEP 1: Alter matches table to allow NULL player IDs
-- ========================================================================

-- Singles matches: Allow NULL for player_a_id and player_b_id
ALTER TABLE matches
    ALTER COLUMN player_a_id DROP NOT NULL,
    ALTER COLUMN player_b_id DROP NOT NULL;

-- Change ON DELETE behavior from CASCADE to SET NULL
ALTER TABLE matches
    DROP CONSTRAINT IF EXISTS matches_player_a_id_fkey,
    DROP CONSTRAINT IF EXISTS matches_player_b_id_fkey,
    DROP CONSTRAINT IF EXISTS matches_winner_id_fkey,
    DROP CONSTRAINT IF EXISTS matches_loser_id_fkey,
    DROP CONSTRAINT IF EXISTS matches_created_by_fkey;

ALTER TABLE matches
    ADD CONSTRAINT matches_player_a_id_fkey
        FOREIGN KEY (player_a_id) REFERENCES profiles(id) ON DELETE SET NULL,
    ADD CONSTRAINT matches_player_b_id_fkey
        FOREIGN KEY (player_b_id) REFERENCES profiles(id) ON DELETE SET NULL,
    ADD CONSTRAINT matches_winner_id_fkey
        FOREIGN KEY (winner_id) REFERENCES profiles(id) ON DELETE SET NULL,
    ADD CONSTRAINT matches_loser_id_fkey
        FOREIGN KEY (loser_id) REFERENCES profiles(id) ON DELETE SET NULL,
    ADD CONSTRAINT matches_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ========================================================================
-- STEP 2: Alter doubles_matches table to allow NULL player IDs
-- ========================================================================

ALTER TABLE doubles_matches
    ALTER COLUMN team_a_player1_id DROP NOT NULL,
    ALTER COLUMN team_a_player2_id DROP NOT NULL,
    ALTER COLUMN team_b_player1_id DROP NOT NULL,
    ALTER COLUMN team_b_player2_id DROP NOT NULL;

-- Change ON DELETE behavior from CASCADE to SET NULL
ALTER TABLE doubles_matches
    DROP CONSTRAINT IF EXISTS doubles_matches_team_a_player1_id_fkey,
    DROP CONSTRAINT IF EXISTS doubles_matches_team_a_player2_id_fkey,
    DROP CONSTRAINT IF EXISTS doubles_matches_team_b_player1_id_fkey,
    DROP CONSTRAINT IF EXISTS doubles_matches_team_b_player2_id_fkey,
    DROP CONSTRAINT IF EXISTS doubles_matches_created_by_fkey;

ALTER TABLE doubles_matches
    ADD CONSTRAINT doubles_matches_team_a_player1_id_fkey
        FOREIGN KEY (team_a_player1_id) REFERENCES profiles(id) ON DELETE SET NULL,
    ADD CONSTRAINT doubles_matches_team_a_player2_id_fkey
        FOREIGN KEY (team_a_player2_id) REFERENCES profiles(id) ON DELETE SET NULL,
    ADD CONSTRAINT doubles_matches_team_b_player1_id_fkey
        FOREIGN KEY (team_b_player1_id) REFERENCES profiles(id) ON DELETE SET NULL,
    ADD CONSTRAINT doubles_matches_team_b_player2_id_fkey
        FOREIGN KEY (team_b_player2_id) REFERENCES profiles(id) ON DELETE SET NULL,
    ADD CONSTRAINT doubles_matches_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ========================================================================
-- STEP 3: Also fix match_requests table
-- ========================================================================

ALTER TABLE match_requests
    ALTER COLUMN player_a_id DROP NOT NULL,
    ALTER COLUMN player_b_id DROP NOT NULL;

ALTER TABLE match_requests
    DROP CONSTRAINT IF EXISTS match_requests_player_a_id_fkey,
    DROP CONSTRAINT IF EXISTS match_requests_player_b_id_fkey,
    DROP CONSTRAINT IF EXISTS match_requests_winner_id_fkey,
    DROP CONSTRAINT IF EXISTS match_requests_loser_id_fkey;

ALTER TABLE match_requests
    ADD CONSTRAINT match_requests_player_a_id_fkey
        FOREIGN KEY (player_a_id) REFERENCES profiles(id) ON DELETE SET NULL,
    ADD CONSTRAINT match_requests_player_b_id_fkey
        FOREIGN KEY (player_b_id) REFERENCES profiles(id) ON DELETE SET NULL,
    ADD CONSTRAINT match_requests_winner_id_fkey
        FOREIGN KEY (winner_id) REFERENCES profiles(id) ON DELETE SET NULL,
    ADD CONSTRAINT match_requests_loser_id_fkey
        FOREIGN KEY (loser_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- ========================================================================
-- STEP 4: Update hard_delete_account to NOT delete matches
-- Instead, the ON DELETE SET NULL will handle anonymization automatically
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
    v_singles_match_ids UUID[];
    v_doubles_match_ids UUID[];
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
    -- NOTE: Matches are NOT deleted - player IDs are set to NULL
    -- via ON DELETE SET NULL, so other players keep their history
    -- =====================================================

    -- 1. Delete guardian relationships (both as guardian and as child)
    DELETE FROM guardian_links WHERE guardian_id = p_user_id OR child_id = p_user_id;

    -- 2. Collect match IDs for activity cleanup (matches themselves stay!)
    SELECT ARRAY_AGG(id) INTO v_singles_match_ids
    FROM matches
    WHERE player_a_id = p_user_id
       OR player_b_id = p_user_id
       OR winner_id = p_user_id
       OR loser_id = p_user_id;

    SELECT ARRAY_AGG(id) INTO v_doubles_match_ids
    FROM doubles_matches
    WHERE team_a_player1_id = p_user_id
       OR team_a_player2_id = p_user_id
       OR team_b_player1_id = p_user_id
       OR team_b_player2_id = p_user_id;

    -- 3. Delete activity likes and comments on user's matches
    -- (the matches stay, but we clean up the social interactions)
    BEGIN
        IF v_singles_match_ids IS NOT NULL AND array_length(v_singles_match_ids, 1) > 0 THEN
            DELETE FROM activity_likes
            WHERE activity_type = 'singles_match'
            AND activity_id = ANY(v_singles_match_ids);

            DELETE FROM activity_comments
            WHERE activity_type = 'singles_match'
            AND activity_id = ANY(v_singles_match_ids);
        END IF;

        IF v_doubles_match_ids IS NOT NULL AND array_length(v_doubles_match_ids, 1) > 0 THEN
            DELETE FROM activity_likes
            WHERE activity_type = 'doubles_match'
            AND activity_id = ANY(v_doubles_match_ids);

            DELETE FROM activity_comments
            WHERE activity_type = 'doubles_match'
            AND activity_id = ANY(v_doubles_match_ids);
        END IF;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- 4. DELETE match requests and proposals (these are not history, just pending requests)
    DELETE FROM match_requests
    WHERE player_a_id = p_user_id
       OR player_b_id = p_user_id
       OR winner_id = p_user_id
       OR loser_id = p_user_id;

    DELETE FROM match_proposals
    WHERE requester_id = p_user_id OR recipient_id = p_user_id;

    -- 5. DELETE doubles match requests (pending, not history)
    DELETE FROM doubles_match_requests
    WHERE initiated_by = p_user_id
       OR (team_a->>'player1_id')::UUID = p_user_id
       OR (team_a->>'player2_id')::UUID = p_user_id
       OR (team_b->>'player1_id')::UUID = p_user_id
       OR (team_b->>'player2_id')::UUID = p_user_id;

    -- 6. Delete doubles pairings where user is involved
    DELETE FROM doubles_pairings
    WHERE player1_id = p_user_id OR player2_id = p_user_id;

    -- 7. Delete attendance records
    DELETE FROM attendance WHERE user_id = p_user_id;

    -- 8. Delete history records
    DELETE FROM points_history WHERE user_id = p_user_id;
    DELETE FROM xp_history WHERE user_id = p_user_id;

    -- 9. Delete streaks
    DELETE FROM streaks WHERE user_id = p_user_id;

    -- 10. Delete completed challenges and exercises
    DELETE FROM completed_challenges WHERE user_id = p_user_id;
    DELETE FROM completed_exercises WHERE user_id = p_user_id;
    DELETE FROM exercise_milestones WHERE user_id = p_user_id;

    -- 11. Delete notifications
    DELETE FROM notifications WHERE user_id = p_user_id;

    -- 12. Delete social data (friends, followers)
    DELETE FROM friends WHERE user_id = p_user_id OR friend_id = p_user_id;
    DELETE FROM followers WHERE follower_id = p_user_id OR followed_id = p_user_id;

    -- Delete follow requests if table exists
    BEGIN
        DELETE FROM follow_requests WHERE requester_id = p_user_id OR target_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN
        -- Table doesn't exist, skip
    END;

    -- 13. Delete remaining activity data (user's own likes, comments, events)
    BEGIN
        DELETE FROM activity_likes WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
        DELETE FROM activity_comments WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
        DELETE FROM activity_events WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- 14. Delete community posts
    BEGIN
        DELETE FROM posts WHERE author_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    BEGIN
        DELETE FROM poll_votes WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- 15. Delete club requests
    DELETE FROM club_requests WHERE player_id = p_user_id;
    DELETE FROM leave_club_requests WHERE player_id = p_user_id;

    -- 16. Delete subgroup memberships
    DELETE FROM subgroup_members WHERE user_id = p_user_id;

    -- 17. Clear record holder references in exercises (set to NULL)
    UPDATE exercises SET
        record_holder_id = NULL,
        record_holder_name = NULL
    WHERE record_holder_id = p_user_id;

    -- 18. Delete user preferences if table exists
    BEGIN
        DELETE FROM user_preferences WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- 19. Delete user sport stats if table exists
    BEGIN
        DELETE FROM user_sport_stats WHERE user_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- 20. Delete profile club sports if table exists
    BEGIN
        DELETE FROM profile_club_sports WHERE profile_id = p_user_id;
    EXCEPTION WHEN undefined_table THEN NULL; END;

    -- 21. FINALLY: Delete the profile itself
    -- This will trigger ON DELETE SET NULL for all matches,
    -- keeping the matches but anonymizing this player
    DELETE FROM profiles WHERE id = p_user_id;

    -- 22. Delete the auth account (for regular accounts, not child accounts)
    -- Child accounts don't have auth.users entries
    IF v_is_own_account THEN
        DELETE FROM auth.users WHERE id = p_user_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Account gelöscht. Matches bleiben erhalten, Spieler wird als "Gelöschter Spieler" angezeigt.'
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
-- ========================================================================
CREATE OR REPLACE FUNCTION anonymize_account(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN hard_delete_account(p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION anonymize_account(UUID) TO authenticated;

-- ========================================================================
-- Verification
-- ========================================================================
SELECT 'Schema updated! Matches will now be preserved when accounts are deleted.' as status;
SELECT 'Player IDs will be set to NULL, showing as "Gelöschter Spieler" in the frontend.' as info;
