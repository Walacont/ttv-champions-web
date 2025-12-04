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
-- FERTIG!
-- =========================================
