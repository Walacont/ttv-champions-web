-- Fix: Fehlende Felder für matches und doubles_matches
-- Diese Felder werden in der App verwendet, fehlen aber im Schema

-- ============================================
-- MATCHES TABLE - Fehlende Felder hinzufügen
-- ============================================

-- Elo-Änderungen für Gewinner und Verlierer
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS winner_elo_change INTEGER,
ADD COLUMN IF NOT EXISTS loser_elo_change INTEGER;

-- Saison-Punkte
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS season_points_awarded INTEGER DEFAULT 0;

-- Spielmodus
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS match_mode TEXT;

-- Handicap-System
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS handicap_used BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS handicap JSONB;

-- Kommentar für Handicap-Format
COMMENT ON COLUMN matches.handicap IS 'Format: {"player": {"id": "uuid", "name": "string"}, "points": number}';

-- ============================================
-- DOUBLES_MATCHES TABLE - Fehlende Felder hinzufügen
-- ============================================

-- Spielmodus
ALTER TABLE doubles_matches
ADD COLUMN IF NOT EXISTS match_mode TEXT;

-- Handicap-System
ALTER TABLE doubles_matches
ADD COLUMN IF NOT EXISTS handicap_used BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS handicap JSONB;

-- Elo-Änderungen (falls benötigt)
ALTER TABLE doubles_matches
ADD COLUMN IF NOT EXISTS winner_elo_change INTEGER,
ADD COLUMN IF NOT EXISTS loser_elo_change INTEGER,
ADD COLUMN IF NOT EXISTS season_points_awarded INTEGER DEFAULT 0;

-- Kommentar
COMMENT ON COLUMN doubles_matches.handicap IS 'Format: {"player": {"id": "uuid", "name": "string"}, "points": number}';

-- ============================================
-- PROFILES TABLE - first_name, last_name hinzufügen (falls noch nicht vorhanden)
-- ============================================

-- Diese Felder sollten eigentlich schon im Schema sein, aber sicherstellen
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'first_name'
    ) THEN
        ALTER TABLE profiles ADD COLUMN first_name TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'last_name'
    ) THEN
        ALTER TABLE profiles ADD COLUMN last_name TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'display_name'
    ) THEN
        ALTER TABLE profiles ADD COLUMN display_name TEXT;
    END IF;
END $$;

-- ============================================
-- INDEXES für Performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_matches_match_mode ON matches(match_mode);
CREATE INDEX IF NOT EXISTS idx_matches_handicap_used ON matches(handicap_used) WHERE handicap_used = true;
CREATE INDEX IF NOT EXISTS idx_doubles_matches_match_mode ON doubles_matches(match_mode);
CREATE INDEX IF NOT EXISTS idx_doubles_matches_handicap_used ON doubles_matches(handicap_used) WHERE handicap_used = true;
