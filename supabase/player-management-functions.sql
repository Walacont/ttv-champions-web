-- RPC functions for player management (bypasses RLS with proper authorization)

-- Function to set a player as match-ready (+ 50 XP)
CREATE OR REPLACE FUNCTION set_player_match_ready(
    p_player_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_player_club_id UUID;
    v_current_xp INTEGER;
    v_result JSON;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get player's club_id
    SELECT club_id, xp INTO v_player_club_id, v_current_xp
    FROM profiles WHERE id = p_player_id;

    IF v_player_club_id IS NULL THEN
        RAISE EXCEPTION 'Player not found';
    END IF;

    -- Check if caller is coach/head_coach/admin
    SELECT role INTO v_caller_role FROM profiles WHERE id = v_caller_id;

    IF v_caller_role NOT IN ('coach', 'head_coach', 'admin') THEN
        SELECT pcs.role INTO v_caller_role
        FROM profile_club_sports pcs
        WHERE pcs.user_id = v_caller_id AND pcs.club_id = v_player_club_id
          AND pcs.role IN ('coach', 'head_coach');

        IF v_caller_role IS NULL THEN
            RAISE EXCEPTION 'Not authorized';
        END IF;
    END IF;

    -- Update the player
    UPDATE profiles SET
        is_match_ready = TRUE,
        grundlagen_completed = 5,
        xp = COALESCE(v_current_xp, 0) + 50,
        updated_at = NOW()
    WHERE id = p_player_id;

    SELECT json_build_object('success', TRUE, 'new_xp', COALESCE(v_current_xp, 0) + 50) INTO v_result;
    RETURN v_result;
END;
$$;

-- Function to delete an offline player
CREATE OR REPLACE FUNCTION delete_offline_player(
    p_offline_player_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_player RECORD;
    v_result JSON;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get player data
    SELECT id, club_id, is_offline INTO v_player
    FROM profiles WHERE id = p_offline_player_id;

    IF v_player.id IS NULL THEN
        RAISE EXCEPTION 'Player not found';
    END IF;

    IF v_player.is_offline != TRUE THEN
        RAISE EXCEPTION 'Can only delete offline players';
    END IF;

    -- Check if caller is head_coach or admin
    SELECT role INTO v_caller_role FROM profiles WHERE id = v_caller_id;

    IF v_caller_role NOT IN ('head_coach', 'admin') THEN
        SELECT pcs.role INTO v_caller_role
        FROM profile_club_sports pcs
        WHERE pcs.user_id = v_caller_id AND pcs.club_id = v_player.club_id
          AND pcs.role = 'head_coach';

        IF v_caller_role IS NULL THEN
            RAISE EXCEPTION 'Only head_coach or admin can delete players';
        END IF;
    END IF;

    -- Delete related records first
    DELETE FROM attendance WHERE player_id = p_offline_player_id;
    DELETE FROM challenge_completions WHERE player_id = p_offline_player_id;
    DELETE FROM matches WHERE player_a_id = p_offline_player_id OR player_b_id = p_offline_player_id;
    DELETE FROM doubles_matches WHERE team1_player1_id = p_offline_player_id OR team1_player2_id = p_offline_player_id
        OR team2_player1_id = p_offline_player_id OR team2_player2_id = p_offline_player_id;
    DELETE FROM match_requests WHERE requester_id = p_offline_player_id OR opponent_id = p_offline_player_id;
    DELETE FROM player_points WHERE player_id = p_offline_player_id;
    DELETE FROM profile_club_sports WHERE user_id = p_offline_player_id;
    DELETE FROM user_sport_stats WHERE user_id = p_offline_player_id;
    DELETE FROM invitation_codes WHERE player_id = p_offline_player_id;

    -- Delete the player profile
    DELETE FROM profiles WHERE id = p_offline_player_id;

    SELECT json_build_object('success', TRUE, 'deleted_player_id', p_offline_player_id) INTO v_result;
    RETURN v_result;
END;
$$;

-- Function to promote a player to coach
CREATE OR REPLACE FUNCTION promote_to_coach(
    p_player_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_player_club_id UUID;
    v_result JSON;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get player's club_id
    SELECT club_id INTO v_player_club_id FROM profiles WHERE id = p_player_id;

    IF v_player_club_id IS NULL THEN
        RAISE EXCEPTION 'Player not found';
    END IF;

    -- Check if caller is head_coach or admin
    SELECT role INTO v_caller_role FROM profiles WHERE id = v_caller_id;

    IF v_caller_role NOT IN ('head_coach', 'admin') THEN
        SELECT pcs.role INTO v_caller_role
        FROM profile_club_sports pcs
        WHERE pcs.user_id = v_caller_id AND pcs.club_id = v_player_club_id
          AND pcs.role = 'head_coach';

        IF v_caller_role IS NULL THEN
            RAISE EXCEPTION 'Only head_coach or admin can promote players';
        END IF;
    END IF;

    -- Update the player role
    UPDATE profiles SET role = 'coach', updated_at = NOW() WHERE id = p_player_id;
    UPDATE profile_club_sports SET role = 'coach' WHERE user_id = p_player_id AND club_id = v_player_club_id;

    SELECT json_build_object('success', TRUE, 'new_role', 'coach') INTO v_result;
    RETURN v_result;
END;
$$;

-- Function to demote a coach to player
CREATE OR REPLACE FUNCTION demote_to_player(
    p_player_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_player_club_id UUID;
    v_result JSON;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get player's club_id
    SELECT club_id INTO v_player_club_id FROM profiles WHERE id = p_player_id;

    IF v_player_club_id IS NULL THEN
        RAISE EXCEPTION 'Player not found';
    END IF;

    -- Check if caller is head_coach or admin
    SELECT role INTO v_caller_role FROM profiles WHERE id = v_caller_id;

    IF v_caller_role NOT IN ('head_coach', 'admin') THEN
        SELECT pcs.role INTO v_caller_role
        FROM profile_club_sports pcs
        WHERE pcs.user_id = v_caller_id AND pcs.club_id = v_player_club_id
          AND pcs.role = 'head_coach';

        IF v_caller_role IS NULL THEN
            RAISE EXCEPTION 'Only head_coach or admin can demote coaches';
        END IF;
    END IF;

    -- Update the player role
    UPDATE profiles SET role = 'player', updated_at = NOW() WHERE id = p_player_id;
    UPDATE profile_club_sports SET role = 'player' WHERE user_id = p_player_id AND club_id = v_player_club_id;

    SELECT json_build_object('success', TRUE, 'new_role', 'player') INTO v_result;
    RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION set_player_match_ready TO authenticated;
GRANT EXECUTE ON FUNCTION delete_offline_player TO authenticated;
GRANT EXECUTE ON FUNCTION promote_to_coach TO authenticated;
GRANT EXECUTE ON FUNCTION demote_to_player TO authenticated;
