-- ============================================
-- MIGRATION: Add club_id to seasons table
-- Seasons should be per-club, not global per-sport
-- ============================================

-- 1. Add club_id column
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;

-- 2. Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_seasons_club ON seasons(club_id);
CREATE INDEX IF NOT EXISTS idx_seasons_club_sport ON seasons(club_id, sport_id);

-- 3. Update the trigger to ensure single active season PER CLUB AND SPORT
CREATE OR REPLACE FUNCTION ensure_single_active_season()
RETURNS TRIGGER AS $$
BEGIN
    -- Wenn die neue Saison aktiv gesetzt wird, deaktiviere alle anderen
    -- NUR für den gleichen Verein und die gleiche Sportart
    IF NEW.is_active = true AND NEW.club_id IS NOT NULL THEN
        UPDATE seasons
        SET is_active = false
        WHERE sport_id = NEW.sport_id
        AND club_id = NEW.club_id
        AND id != NEW.id
        AND is_active = true;
    ELSIF NEW.is_active = true AND NEW.club_id IS NULL THEN
        -- Fallback für alte Logik ohne club_id
        UPDATE seasons
        SET is_active = false
        WHERE sport_id = NEW.sport_id
        AND club_id IS NULL
        AND id != NEW.id
        AND is_active = true;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Update start_new_season function to include club_id
CREATE OR REPLACE FUNCTION start_new_season(
    p_sport_id UUID,
    p_name TEXT,
    p_start_date DATE,
    p_end_date DATE,
    p_created_by UUID,
    p_club_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_new_season_id UUID;
    v_club_id UUID;
BEGIN
    -- Club-ID vom Benutzer holen falls nicht übergeben
    IF p_club_id IS NULL THEN
        SELECT club_id INTO v_club_id
        FROM profiles
        WHERE id = p_created_by;
    ELSE
        v_club_id := p_club_id;
    END IF;

    -- 1. Neue Saison erstellen (Trigger deaktiviert automatisch die alte für diesen Club)
    INSERT INTO seasons (sport_id, name, start_date, end_date, is_active, created_by, club_id)
    VALUES (p_sport_id, p_name, p_start_date, p_end_date, true, p_created_by, v_club_id)
    RETURNING id INTO v_new_season_id;

    -- 2. Saison-Punkte aller Spieler DIESES VEREINS für diese Sportart auf 0 setzen
    UPDATE profiles p
    SET
        points = 0,
        updated_at = NOW()
    WHERE p.id IN (
        SELECT pcs.user_id
        FROM profile_club_sports pcs
        WHERE pcs.sport_id = p_sport_id
        AND pcs.club_id = v_club_id
    );

    RAISE NOTICE 'Neue Saison % gestartet für Sport % in Club %. Punkte wurden zurückgesetzt.',
        p_name, p_sport_id, v_club_id;

    RETURN v_new_season_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update get_current_season to include club_id filter
CREATE OR REPLACE FUNCTION get_current_season(p_sport_id UUID, p_club_id UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    name TEXT,
    start_date DATE,
    end_date DATE,
    club_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.name, s.start_date, s.end_date, s.club_id
    FROM seasons s
    WHERE s.sport_id = p_sport_id
    AND s.is_active = true
    AND (p_club_id IS NULL OR s.club_id = p_club_id OR s.club_id IS NULL)
    ORDER BY s.club_id NULLS LAST  -- Prefer club-specific season
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Update get_all_seasons to include club_id filter
CREATE OR REPLACE FUNCTION get_all_seasons(p_sport_id UUID, p_club_id UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    name TEXT,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    club_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.name, s.start_date, s.end_date, s.is_active, s.created_at, s.club_id
    FROM seasons s
    WHERE s.sport_id = p_sport_id
    AND (p_club_id IS NULL OR s.club_id = p_club_id OR s.club_id IS NULL)
    ORDER BY s.start_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. New function: Get active season for a club and sport
CREATE OR REPLACE FUNCTION get_club_active_season(p_club_id UUID, p_sport_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    start_date DATE,
    end_date DATE
) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.name, s.start_date, s.end_date
    FROM seasons s
    WHERE s.club_id = p_club_id
    AND s.sport_id = p_sport_id
    AND s.is_active = true
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Update RLS policies
DROP POLICY IF EXISTS "seasons_insert_policy" ON seasons;
DROP POLICY IF EXISTS "seasons_update_policy" ON seasons;

-- Admins und Head Coaches können Saisons für ihren Verein erstellen
CREATE POLICY "seasons_insert_policy" ON seasons
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (p.role = 'admin' OR p.role = 'head_coach')
            AND (club_id IS NULL OR p.club_id = club_id)
        )
    );

-- Admins und Head Coaches können Saisons ihres Vereins ändern
CREATE POLICY "seasons_update_policy" ON seasons
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND (p.role = 'admin' OR p.role = 'head_coach')
            AND (seasons.club_id IS NULL OR p.club_id = seasons.club_id)
        )
    );

-- ============================================
-- Done! Seasons are now club-specific
-- ============================================
