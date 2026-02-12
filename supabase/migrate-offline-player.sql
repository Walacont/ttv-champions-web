-- Function to migrate an offline player to a new online account
-- This transfers all data and updates references in related tables

-- Drop old function first to allow return type change
DROP FUNCTION IF EXISTS migrate_offline_player(UUID, UUID);

CREATE OR REPLACE FUNCTION migrate_offline_player(
    p_new_user_id UUID,
    p_offline_player_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_offline_player RECORD;
    v_result JSON;
    v_matches_updated INT := 0;
    v_deleted_count INT := 0;
BEGIN
    -- Get the offline player's complete data
    SELECT * INTO v_offline_player
    FROM profiles
    WHERE id = p_offline_player_id AND is_offline = TRUE;

    IF NOT FOUND THEN
        -- Return error as JSON instead of raising exception (better for frontend handling)
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Offline player not found or is not offline'
        );
    END IF;

    -- Update the new user's profile with ALL offline player data
    UPDATE profiles SET
        first_name = COALESCE(v_offline_player.first_name, first_name),
        last_name = COALESCE(v_offline_player.last_name, last_name),
        display_name = COALESCE(v_offline_player.display_name, display_name),
        club_id = v_offline_player.club_id,
        role = COALESCE(v_offline_player.role, 'player'),
        xp = COALESCE(v_offline_player.xp, 0),
        points = COALESCE(v_offline_player.points, 0),
        elo_rating = COALESCE(v_offline_player.elo_rating, 800),
        highest_elo = COALESCE(v_offline_player.highest_elo, 800),
        doubles_elo_rating = COALESCE(v_offline_player.doubles_elo_rating, 800),
        birthdate = COALESCE(v_offline_player.birthdate, birthdate),
        gender = COALESCE(v_offline_player.gender, gender),
        subgroup_ids = COALESCE(v_offline_player.subgroup_ids, '{}'),
        active_sport_id = v_offline_player.active_sport_id,
        qttr_points = v_offline_player.qttr_points,
        rank = v_offline_player.rank,
        is_offline = FALSE,
        updated_at = NOW()
    WHERE id = p_new_user_id;

    -- Update matches: player_a_id
    UPDATE matches SET player_a_id = p_new_user_id
    WHERE player_a_id = p_offline_player_id;

    -- Update matches: player_b_id
    UPDATE matches SET player_b_id = p_new_user_id
    WHERE player_b_id = p_offline_player_id;

    -- Update matches: winner_id
    UPDATE matches SET winner_id = p_new_user_id
    WHERE winner_id = p_offline_player_id;

    -- Update doubles_matches: team1_player1_id
    UPDATE doubles_matches SET team1_player1_id = p_new_user_id
    WHERE team1_player1_id = p_offline_player_id;

    -- Update doubles_matches: team1_player2_id
    UPDATE doubles_matches SET team1_player2_id = p_new_user_id
    WHERE team1_player2_id = p_offline_player_id;

    -- Update doubles_matches: team2_player1_id
    UPDATE doubles_matches SET team2_player1_id = p_new_user_id
    WHERE team2_player1_id = p_offline_player_id;

    -- Update doubles_matches: team2_player2_id
    UPDATE doubles_matches SET team2_player2_id = p_new_user_id
    WHERE team2_player2_id = p_offline_player_id;

    -- Update attendance records
    UPDATE attendance SET player_id = p_new_user_id
    WHERE player_id = p_offline_player_id;

    -- Update challenge_completions
    UPDATE challenge_completions SET player_id = p_new_user_id
    WHERE player_id = p_offline_player_id;

    -- Update profile_club_sports
    UPDATE profile_club_sports SET user_id = p_new_user_id
    WHERE user_id = p_offline_player_id;

    -- Update match_requests
    UPDATE match_requests SET requester_id = p_new_user_id
    WHERE requester_id = p_offline_player_id;

    UPDATE match_requests SET opponent_id = p_new_user_id
    WHERE opponent_id = p_offline_player_id;

    -- Update player_points
    UPDATE player_points SET player_id = p_new_user_id
    WHERE player_id = p_offline_player_id;

    -- Update user_sport_stats
    UPDATE user_sport_stats SET user_id = p_new_user_id
    WHERE user_id = p_offline_player_id;

    -- Mark the invitation code as used AND clear player_id reference
    -- (player_id must be cleared to allow deleting the offline player profile
    -- because invitation_codes has a foreign key to profiles without ON DELETE CASCADE)
    UPDATE invitation_codes SET
        player_id = NULL,  -- Clear reference to allow profile deletion
        used_by = p_new_user_id,
        used_at = NOW()
    WHERE player_id = p_offline_player_id;

    -- Delete the old offline player profile
    DELETE FROM profiles WHERE id = p_offline_player_id AND is_offline = TRUE;

    -- Check if delete actually worked
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Return success with migrated data summary (including actual delete status)
    SELECT json_build_object(
        'success', TRUE,
        'migrated_from', p_offline_player_id,
        'migrated_to', p_new_user_id,
        'xp', v_offline_player.xp,
        'points', v_offline_player.points,
        'elo_rating', v_offline_player.elo_rating,
        'old_profile_deleted', v_deleted_count > 0,
        'deleted_count', v_deleted_count
    ) INTO v_result;

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    -- Return error as JSON instead of raising exception
    RETURN json_build_object(
        'success', FALSE,
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION migrate_offline_player TO authenticated;
