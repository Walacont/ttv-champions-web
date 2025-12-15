-- ============================================
-- MULTI-SPORT KONFIGURATION
-- ============================================

-- 1. Config-Spalte für sportspezifische Regeln hinzufügen
ALTER TABLE sports ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';

-- 2. Aktive Sportart im Profil speichern
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_sport_id UUID REFERENCES sports(id);

-- 3. Sportarten mit Scoring-Konfiguration aktualisieren
UPDATE sports SET config = '{
  "scoring": {
    "type": "table_tennis",
    "points_to_win_set": 11,
    "sets_to_win_match": 3,
    "min_lead": 2,
    "max_sets": 5
  },
  "icon": "🏓"
}' WHERE name = 'table_tennis';

UPDATE sports SET config = '{
  "scoring": {
    "type": "tennis",
    "points": ["0", "15", "30", "40", "Adv"],
    "games_to_win_set": 6,
    "sets_to_win_match": 2,
    "tiebreak_at": 6,
    "max_sets": 3
  },
  "icon": "🎾"
}' WHERE name = 'tennis';

UPDATE sports SET config = '{
  "scoring": {
    "type": "badminton",
    "points_to_win_set": 21,
    "sets_to_win_match": 2,
    "min_lead": 2,
    "max_points": 30,
    "max_sets": 3
  },
  "icon": "🏸"
}' WHERE name = 'badminton';

UPDATE sports SET config = '{
  "scoring": {
    "type": "squash",
    "points_to_win_set": 11,
    "sets_to_win_match": 3,
    "min_lead": 2,
    "max_sets": 5
  },
  "icon": "🎾"
}' WHERE name = 'squash';

-- ============================================
-- FUNKTIONEN FÜR AKTIVE SPORTART
-- ============================================

-- Aktive Sportart des Users abrufen (mit Fallback auf erste Sportart)
CREATE OR REPLACE FUNCTION get_user_active_sport(p_user_id UUID)
RETURNS TABLE (
    sport_id UUID,
    sport_name TEXT,
    display_name TEXT,
    config JSONB
) AS $$
BEGIN
    RETURN QUERY
    -- Erst prüfen ob active_sport_id gesetzt ist
    SELECT s.id, s.name, s.display_name, s.config
    FROM profiles p
    JOIN sports s ON s.id = p.active_sport_id
    WHERE p.id = p_user_id
    AND p.active_sport_id IS NOT NULL
    LIMIT 1;

    -- Falls nichts gefunden, erste Sportart aus profile_club_sports nehmen
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT s.id, s.name, s.display_name, s.config
        FROM profile_club_sports pcs
        JOIN sports s ON s.id = pcs.sport_id
        WHERE pcs.user_id = p_user_id
        ORDER BY pcs.created_at ASC
        LIMIT 1;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aktive Sportart des Users setzen
CREATE OR REPLACE FUNCTION set_user_active_sport(p_user_id UUID, p_sport_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Prüfen ob User in dieser Sportart ist
    IF NOT EXISTS (
        SELECT 1 FROM profile_club_sports
        WHERE user_id = p_user_id AND sport_id = p_sport_id
    ) THEN
        RAISE EXCEPTION 'User ist nicht in dieser Sportart registriert';
    END IF;

    -- Aktive Sportart setzen
    UPDATE profiles
    SET active_sport_id = p_sport_id
    WHERE id = p_user_id;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Alle Sportarten eines Users abrufen
CREATE OR REPLACE FUNCTION get_user_sports(p_user_id UUID)
RETURNS TABLE (
    sport_id UUID,
    sport_name TEXT,
    display_name TEXT,
    config JSONB,
    role TEXT,
    is_active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.name,
        s.display_name,
        s.config,
        pcs.role,
        (p.active_sport_id = s.id) as is_active
    FROM profile_club_sports pcs
    JOIN sports s ON s.id = pcs.sport_id
    JOIN profiles p ON p.id = pcs.user_id
    WHERE pcs.user_id = p_user_id
    ORDER BY s.display_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- VOLLSTÄNDIGER SPORT-KONTEXT
-- ============================================

-- Vollständigen Sport-Kontext des Users abrufen (sport_id, club_id, role)
-- Wichtig: User kann in verschiedenen Sportarten in verschiedenen Vereinen sein!
CREATE OR REPLACE FUNCTION get_user_sport_context(p_user_id UUID)
RETURNS TABLE (
    sport_id UUID,
    sport_name TEXT,
    display_name TEXT,
    config JSONB,
    club_id UUID,
    club_name TEXT,
    role TEXT
) AS $$
DECLARE
    v_active_sport_id UUID;
BEGIN
    -- Aktive Sportart ermitteln
    SELECT p.active_sport_id INTO v_active_sport_id
    FROM profiles p
    WHERE p.id = p_user_id;

    -- Falls keine aktive Sportart gesetzt, erste nehmen
    IF v_active_sport_id IS NULL THEN
        SELECT pcs.sport_id INTO v_active_sport_id
        FROM profile_club_sports pcs
        WHERE pcs.user_id = p_user_id
        ORDER BY pcs.created_at ASC
        LIMIT 1;
    END IF;

    -- Vollständigen Kontext zurückgeben
    RETURN QUERY
    SELECT
        s.id as sport_id,
        s.name as sport_name,
        s.display_name,
        s.config,
        c.id as club_id,
        c.name as club_name,
        pcs.role
    FROM profile_club_sports pcs
    JOIN sports s ON s.id = pcs.sport_id
    JOIN clubs c ON c.id = pcs.club_id
    WHERE pcs.user_id = p_user_id
    AND pcs.sport_id = v_active_sport_id
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- INDEX FÜR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_profiles_active_sport ON profiles(active_sport_id);
CREATE INDEX IF NOT EXISTS idx_profile_club_sports_user_sport ON profile_club_sports(user_id, sport_id);
