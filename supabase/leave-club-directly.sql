-- ============================================
-- RPC Function: Leave club directly (no request needed)
-- ============================================
-- Allows a player to leave their club immediately without
-- needing coach approval. Coaches are downgraded to player role.
-- Clears all subgroup memberships.

CREATE OR REPLACE FUNCTION leave_club_directly(
    p_player_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_player RECORD;
    v_club_id UUID;
BEGIN
    -- Get the player's current data
    SELECT id, club_id, role INTO v_player
    FROM profiles
    WHERE id = p_player_id;

    IF v_player IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Spieler nicht gefunden');
    END IF;

    IF v_player.club_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Spieler ist keinem Verein zugeordnet');
    END IF;

    v_club_id := v_player.club_id;

    -- Remove player from club, clear subgroups, downgrade role if coach
    UPDATE profiles
    SET
        club_id = NULL,
        subgroup_ids = '{}',
        role = CASE
            WHEN role IN ('coach', 'head_coach') THEN 'player'
            ELSE role
        END,
        updated_at = NOW()
    WHERE id = p_player_id;

    -- Remove from subgroup_members table if it exists
    DELETE FROM subgroup_members
    WHERE user_id = p_player_id
    AND subgroup_id IN (SELECT id FROM subgroups WHERE club_id = v_club_id);

    -- Remove from profile_club_sports
    DELETE FROM profile_club_sports
    WHERE user_id = p_player_id AND club_id = v_club_id;

    -- Create activity event
    INSERT INTO activity_events (user_id, club_id, event_type, event_data, created_at)
    VALUES (
        p_player_id,
        v_club_id,
        'club_leave',
        jsonb_build_object(
            'left_directly', true,
            'previous_role', v_player.role
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Spieler hat den Verein verlassen',
        'was_coach', v_player.role IN ('coach', 'head_coach')
    );
END;
$$;

GRANT EXECUTE ON FUNCTION leave_club_directly(UUID) TO authenticated;

-- ============================================
-- RPC Function: Notify only head_coach about a player leaving
-- ============================================

CREATE OR REPLACE FUNCTION notify_head_coach_leave(
    p_club_id UUID,
    p_player_name TEXT,
    p_player_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_head_coach RECORD;
    v_notification_count INT := 0;
BEGIN
    -- Find only the head_coach(es) in the club
    FOR v_head_coach IN
        SELECT id FROM profiles
        WHERE club_id = p_club_id
        AND role = 'head_coach'
    LOOP
        INSERT INTO notifications (user_id, type, title, message, data, is_read)
        VALUES (
            v_head_coach.id,
            'club_member_left',
            'Mitglied ausgetreten',
            p_player_name || ' hat den Verein verlassen.',
            jsonb_build_object('player_name', p_player_name, 'player_id', p_player_id),
            false
        );
        v_notification_count := v_notification_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'coaches_notified', v_notification_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION notify_head_coach_leave(UUID, TEXT, UUID) TO authenticated;
