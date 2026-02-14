-- ============================================
-- Updated RPC: approve_club_join_request
-- ============================================
-- Now also adds the player to the Hauptgruppe automatically
-- when a join request is approved.

CREATE OR REPLACE FUNCTION approve_club_join_request(
    p_request_id UUID,
    p_coach_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    request_data RECORD;
    player_update_count INTEGER;
    request_update_count INTEGER;
    v_hauptgruppe_id UUID;
BEGIN
    -- Get the request
    SELECT * INTO request_data
    FROM club_requests
    WHERE id = p_request_id AND status = 'pending';

    IF request_data IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage nicht gefunden oder bereits bearbeitet');
    END IF;

    -- Get or create Hauptgruppe for this club
    v_hauptgruppe_id := get_hauptgruppe_id(request_data.club_id);
    IF v_hauptgruppe_id IS NULL THEN
        v_hauptgruppe_id := create_hauptgruppe_for_club(request_data.club_id);
    END IF;

    -- Update the player's club_id and add to Hauptgruppe
    -- Reset season points (points are club-bound)
    UPDATE profiles
    SET
        club_id = request_data.club_id,
        subgroup_ids = CASE
            WHEN v_hauptgruppe_id IS NOT NULL THEN ARRAY[v_hauptgruppe_id::text]
            ELSE '{}'
        END,
        points = 0,
        updated_at = NOW()
    WHERE id = request_data.player_id;

    -- Reset sport-specific season points
    UPDATE user_sport_stats
    SET points = 0
    WHERE user_id = request_data.player_id;

    GET DIAGNOSTICS player_update_count = ROW_COUNT;

    IF player_update_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Spieler nicht gefunden');
    END IF;

    -- Update the request status
    UPDATE club_requests
    SET
        status = 'approved',
        reviewed_by = p_coach_id,
        reviewed_at = NOW()
    WHERE id = p_request_id;

    GET DIAGNOSTICS request_update_count = ROW_COUNT;

    IF request_update_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage-Status konnte nicht aktualisiert werden');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Spieler wurde zum Verein hinzugefügt',
        'player_updated', player_update_count,
        'request_updated', request_update_count,
        'hauptgruppe_id', v_hauptgruppe_id
    );
END;
$$;
