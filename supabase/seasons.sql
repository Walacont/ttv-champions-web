-- ============================================
-- SEASONS - Saison-Verwaltung pro Sportart
-- ============================================

-- Tabelle für Saisons
CREATE TABLE IF NOT EXISTS seasons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sport_id UUID NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- z.B. "2024/2025"
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT false, -- Nur eine aktive Saison pro Sportart
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id),

    -- Constraint: End muss nach Start sein
    CONSTRAINT valid_date_range CHECK (end_date > start_date)
);

-- Index für schnelle Abfragen
CREATE INDEX IF NOT EXISTS idx_seasons_sport ON seasons(sport_id);
CREATE INDEX IF NOT EXISTS idx_seasons_active ON seasons(is_active);
CREATE INDEX IF NOT EXISTS idx_seasons_dates ON seasons(start_date, end_date);

-- Trigger: Nur eine aktive Saison pro Sportart
CREATE OR REPLACE FUNCTION ensure_single_active_season()
RETURNS TRIGGER AS $$
BEGIN
    -- Wenn die neue Saison aktiv gesetzt wird, deaktiviere alle anderen
    IF NEW.is_active = true THEN
        UPDATE seasons
        SET is_active = false
        WHERE sport_id = NEW.sport_id
        AND id != NEW.id
        AND is_active = true;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_single_active_season
    BEFORE INSERT OR UPDATE ON seasons
    FOR EACH ROW EXECUTE FUNCTION ensure_single_active_season();

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;

-- Jeder kann Saisons lesen
CREATE POLICY "seasons_select_policy" ON seasons
    FOR SELECT USING (true);

-- Nur Admins können Saisons erstellen/ändern
CREATE POLICY "seasons_insert_policy" ON seasons
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

CREATE POLICY "seasons_update_policy" ON seasons
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- ============================================
-- FUNKTION: Neue Saison starten
-- ============================================
-- Diese Funktion:
-- 1. Erstellt eine neue Saison
-- 2. Setzt die Saison-Punkte aller Spieler dieser Sportart auf 0
-- 3. Archiviert die alte Saison (is_active = false)

CREATE OR REPLACE FUNCTION start_new_season(
    p_sport_id UUID,
    p_name TEXT,
    p_start_date DATE,
    p_end_date DATE,
    p_created_by UUID
)
RETURNS UUID AS $$
DECLARE
    v_new_season_id UUID;
BEGIN
    -- 1. Neue Saison erstellen (Trigger deaktiviert automatisch die alte)
    INSERT INTO seasons (sport_id, name, start_date, end_date, is_active, created_by)
    VALUES (p_sport_id, p_name, p_start_date, p_end_date, true, p_created_by)
    RETURNING id INTO v_new_season_id;

    -- 2. Saison-Punkte aller Spieler dieser Sportart auf 0 setzen
    -- (Nur für Spieler die in profile_club_sports für diese Sportart sind)
    UPDATE profiles p
    SET
        points = 0,  -- Saison-Punkte auf 0
        updated_at = NOW()
    WHERE p.id IN (
        SELECT pcs.user_id
        FROM profile_club_sports pcs
        WHERE pcs.sport_id = p_sport_id
    );

    RAISE NOTICE 'Neue Saison % gestartet für Sport %. Punkte wurden zurückgesetzt.', p_name, p_sport_id;

    RETURN v_new_season_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HILFSFUNKTIONEN
-- ============================================

-- Aktuelle Saison für eine Sportart abrufen
CREATE OR REPLACE FUNCTION get_current_season(p_sport_id UUID)
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
    WHERE s.sport_id = p_sport_id
    AND s.is_active = true
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Alle Saisons für eine Sportart abrufen (inkl. vergangene)
CREATE OR REPLACE FUNCTION get_all_seasons(p_sport_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.name, s.start_date, s.end_date, s.is_active, s.created_at
    FROM seasons s
    WHERE s.sport_id = p_sport_id
    ORDER BY s.start_date DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNKTION: Saison vorzeitig beenden
-- ============================================
CREATE OR REPLACE FUNCTION end_season(p_season_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    -- Prüfen ob der Aufrufer Admin ist
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Nur Admins können Saisons beenden';
    END IF;

    -- Hole das Start-Datum der Saison
    SELECT start_date INTO v_start_date
    FROM seasons
    WHERE id = p_season_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Saison nicht gefunden';
    END IF;

    -- End-Datum: heute oder start_date + 1 Tag (damit Constraint erfüllt)
    v_end_date := GREATEST(CURRENT_DATE, v_start_date + INTERVAL '1 day');

    -- Saison beenden
    UPDATE seasons
    SET
        is_active = false,
        end_date = v_end_date
    WHERE id = p_season_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
