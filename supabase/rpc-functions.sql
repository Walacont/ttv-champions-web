-- SC Champions - RPC Functions for Frontend
-- ==========================================
-- Diese Funktionen werden vom Frontend aufgerufen

-- =========================================
-- ADD PLAYER POINTS
-- =========================================
-- Fuegt Punkte und XP zu einem Spieler hinzu

CREATE OR REPLACE FUNCTION add_player_points(
    p_user_id UUID,
    p_points INTEGER,
    p_xp INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE profiles
    SET
        points = COALESCE(points, 0) + p_points,
        xp = COALESCE(xp, 0) + COALESCE(p_xp, p_points),
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$$;

-- =========================================
-- DEDUCT PLAYER POINTS
-- =========================================
-- Zieht Punkte und XP von einem Spieler ab

CREATE OR REPLACE FUNCTION deduct_player_points(
    p_user_id UUID,
    p_points INTEGER,
    p_xp INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE profiles
    SET
        points = GREATEST(0, COALESCE(points, 0) - p_points),
        xp = GREATEST(0, COALESCE(xp, 0) - COALESCE(p_xp, p_points)),
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$$;

-- =========================================
-- GET PLAYER STREAK
-- =========================================
-- Holt den aktuellen Streak eines Spielers fuer eine Gruppe

CREATE OR REPLACE FUNCTION get_player_streak(
    p_user_id UUID,
    p_subgroup_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    streak_count INTEGER;
BEGIN
    SELECT current_streak INTO streak_count
    FROM streaks
    WHERE user_id = p_user_id AND subgroup_id = p_subgroup_id;

    RETURN COALESCE(streak_count, 0);
END;
$$;

-- =========================================
-- RESET SEASON POINTS
-- =========================================
-- Setzt die Saisonpunkte aller Spieler eines Clubs zurueck

CREATE OR REPLACE FUNCTION reset_season_points(
    p_club_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    affected_count INTEGER;
BEGIN
    UPDATE profiles
    SET points = 0, updated_at = NOW()
    WHERE club_id = p_club_id;

    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$$;

-- =========================================
-- APPROVE CLUB JOIN REQUEST
-- =========================================
-- Genehmigt eine Beitrittsanfrage und fügt den Spieler zum Verein hinzu

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
BEGIN
    -- Get the request
    SELECT * INTO request_data
    FROM club_requests
    WHERE id = p_request_id AND status = 'pending';

    IF request_data IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage nicht gefunden oder bereits bearbeitet');
    END IF;

    -- Update the player's club_id
    UPDATE profiles
    SET
        club_id = request_data.club_id,
        updated_at = NOW()
    WHERE id = request_data.player_id;

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
        'request_updated', request_update_count
    );
END;
$$;

-- =========================================
-- REJECT CLUB JOIN REQUEST
-- =========================================
-- Lehnt eine Beitrittsanfrage ab

CREATE OR REPLACE FUNCTION reject_club_join_request(
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
    request_update_count INTEGER;
BEGIN
    -- Get the request
    SELECT * INTO request_data
    FROM club_requests
    WHERE id = p_request_id AND status = 'pending';

    IF request_data IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage nicht gefunden oder bereits bearbeitet');
    END IF;

    -- Update the request status
    UPDATE club_requests
    SET
        status = 'rejected',
        reviewed_by = p_coach_id,
        reviewed_at = NOW()
    WHERE id = p_request_id;

    GET DIAGNOSTICS request_update_count = ROW_COUNT;

    IF request_update_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage-Status konnte nicht aktualisiert werden');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Anfrage wurde abgelehnt', 'request_updated', request_update_count);
END;
$$;

-- =========================================
-- APPROVE CLUB LEAVE REQUEST
-- =========================================
-- Genehmigt eine Austrittsanfrage und entfernt den Spieler vom Verein

CREATE OR REPLACE FUNCTION approve_club_leave_request(
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
BEGIN
    -- Get the request
    SELECT * INTO request_data
    FROM leave_club_requests
    WHERE id = p_request_id AND status = 'pending';

    IF request_data IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage nicht gefunden oder bereits bearbeitet');
    END IF;

    -- Remove the player from the club
    UPDATE profiles
    SET
        club_id = NULL,
        updated_at = NOW()
    WHERE id = request_data.player_id;

    GET DIAGNOSTICS player_update_count = ROW_COUNT;

    IF player_update_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Spieler nicht gefunden');
    END IF;

    -- Update the request status
    UPDATE leave_club_requests
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
        'message', 'Spieler hat den Verein verlassen',
        'player_updated', player_update_count,
        'request_updated', request_update_count
    );
END;
$$;

-- =========================================
-- REJECT CLUB LEAVE REQUEST
-- =========================================
-- Lehnt eine Austrittsanfrage ab

CREATE OR REPLACE FUNCTION reject_club_leave_request(
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
    request_update_count INTEGER;
BEGIN
    -- Get the request
    SELECT * INTO request_data
    FROM leave_club_requests
    WHERE id = p_request_id AND status = 'pending';

    IF request_data IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage nicht gefunden oder bereits bearbeitet');
    END IF;

    -- Update the request status
    UPDATE leave_club_requests
    SET
        status = 'rejected',
        reviewed_by = p_coach_id,
        reviewed_at = NOW()
    WHERE id = p_request_id;

    GET DIAGNOSTICS request_update_count = ROW_COUNT;

    IF request_update_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage-Status konnte nicht aktualisiert werden');
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Austrittsanfrage wurde abgelehnt', 'request_updated', request_update_count);
END;
$$;

-- =========================================
-- FERTIG!
-- =========================================
