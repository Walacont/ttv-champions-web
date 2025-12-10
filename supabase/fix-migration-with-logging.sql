-- Fix offline player migration to prevent CASCADE deleting matches
-- This version includes logging to diagnose issues

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
    v_matches_a INT := 0;
    v_matches_b INT := 0;
    v_matches_winner INT := 0;
    v_matches_loser INT := 0;
    v_deleted_count INT := 0;
BEGIN
    -- Get the offline player's data
    SELECT * INTO v_offline_player
    FROM profiles
    WHERE id = p_offline_player_id AND is_offline = TRUE;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', FALSE,
            'error', 'Offline player not found or is not offline',
            'offline_id', p_offline_player_id
        );
    END IF;

    -- Update the new user's profile with offline player data
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
        is_match_ready = COALESCE(v_offline_player.is_match_ready, FALSE),
        grundlagen_completed = COALESCE(v_offline_player.grundlagen_completed, 0),
        birthdate = COALESCE(v_offline_player.birthdate, birthdate),
        gender = COALESCE(v_offline_player.gender, gender),
        subgroup_ids = COALESCE(v_offline_player.subgroup_ids, '{}'),
        active_sport_id = v_offline_player.active_sport_id,
        is_offline = FALSE,
        updated_at = NOW()
    WHERE id = p_new_user_id;

    -- Update matches: player_a_id
    UPDATE matches SET player_a_id = p_new_user_id
    WHERE player_a_id = p_offline_player_id;
    GET DIAGNOSTICS v_matches_a = ROW_COUNT;

    -- Update matches: player_b_id
    UPDATE matches SET player_b_id = p_new_user_id
    WHERE player_b_id = p_offline_player_id;
    GET DIAGNOSTICS v_matches_b = ROW_COUNT;

    -- Update matches: winner_id
    UPDATE matches SET winner_id = p_new_user_id
    WHERE winner_id = p_offline_player_id;
    GET DIAGNOSTICS v_matches_winner = ROW_COUNT;

    -- Update matches: loser_id
    UPDATE matches SET loser_id = p_new_user_id
    WHERE loser_id = p_offline_player_id;
    GET DIAGNOSTICS v_matches_loser = ROW_COUNT;

    -- Update doubles_matches
    UPDATE doubles_matches SET team_a_player1_id = p_new_user_id WHERE team_a_player1_id = p_offline_player_id;
    UPDATE doubles_matches SET team_a_player2_id = p_new_user_id WHERE team_a_player2_id = p_offline_player_id;
    UPDATE doubles_matches SET team_b_player1_id = p_new_user_id WHERE team_b_player1_id = p_offline_player_id;
    UPDATE doubles_matches SET team_b_player2_id = p_new_user_id WHERE team_b_player2_id = p_offline_player_id;

    -- Update other tables (only if they exist)
    UPDATE attendance SET user_id = p_new_user_id WHERE user_id = p_offline_player_id;
    UPDATE profile_club_sports SET user_id = p_new_user_id WHERE user_id = p_offline_player_id;
    UPDATE match_requests SET player_a_id = p_new_user_id WHERE player_a_id = p_offline_player_id;
    UPDATE match_requests SET player_b_id = p_new_user_id WHERE player_b_id = p_offline_player_id;
    UPDATE match_requests SET winner_id = p_new_user_id WHERE winner_id = p_offline_player_id;
    UPDATE match_requests SET loser_id = p_new_user_id WHERE loser_id = p_offline_player_id;

    -- Clear invitation code reference
    UPDATE invitation_codes SET
        player_id = NULL,
        used_by = p_new_user_id,
        used_at = NOW()
    WHERE player_id = p_offline_player_id;

    -- NOW delete the old offline player profile
    DELETE FROM profiles WHERE id = p_offline_player_id AND is_offline = TRUE;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Return detailed result
    RETURN json_build_object(
        'success', TRUE,
        'migrated_from', p_offline_player_id,
        'migrated_to', p_new_user_id,
        'matches_player_a_updated', v_matches_a,
        'matches_player_b_updated', v_matches_b,
        'matches_winner_updated', v_matches_winner,
        'matches_loser_updated', v_matches_loser,
        'profile_deleted', v_deleted_count > 0,
        'elo_rating', v_offline_player.elo_rating,
        'xp', v_offline_player.xp,
        'points', v_offline_player.points
    );
END;
$$;

GRANT EXECUTE ON FUNCTION migrate_offline_player TO authenticated;
