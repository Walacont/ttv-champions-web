-- RPC Function: Kick player from club
-- Only head_coach can kick players from their club
-- This sets club_id to NULL and role to 'player'

CREATE OR REPLACE FUNCTION kick_player_from_club(
    p_player_id UUID,
    p_head_coach_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_player_club_id UUID;
    v_head_coach_club_id UUID;
    v_head_coach_role TEXT;
    v_player_role TEXT;
BEGIN
    -- Get head_coach's club and role
    SELECT club_id, role INTO v_head_coach_club_id, v_head_coach_role
    FROM profiles
    WHERE id = p_head_coach_id;

    -- Verify the caller is a head_coach
    IF v_head_coach_role != 'head_coach' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nur Head-Coaches können Spieler aus dem Verein entfernen.');
    END IF;

    -- Get player's club and role
    SELECT club_id, role INTO v_player_club_id, v_player_role
    FROM profiles
    WHERE id = p_player_id;

    -- Check player exists
    IF v_player_club_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Spieler ist in keinem Verein.');
    END IF;

    -- Check player is in the same club
    IF v_player_club_id != v_head_coach_club_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Spieler ist nicht in deinem Verein.');
    END IF;

    -- Cannot kick another head_coach
    IF v_player_role = 'head_coach' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Head-Coaches können nicht entfernt werden.');
    END IF;

    -- Cannot kick yourself
    IF p_player_id = p_head_coach_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Du kannst dich nicht selbst entfernen.');
    END IF;

    -- Kick the player: set club_id to NULL and role to 'player'
    UPDATE profiles
    SET
        club_id = NULL,
        role = 'player',
        updated_at = NOW()
    WHERE id = p_player_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION kick_player_from_club(UUID, UUID) TO authenticated;
