-- ============================================
-- PROFILE CLUB SPORTS - Rolle pro Sparte
-- ============================================
-- Ermöglicht: Eine Person kann verschiedene Rollen in verschiedenen Sparten haben
-- Beispiel: Max ist Spartenleiter in Tischtennis, aber Spieler in Badminton

-- Neue Tabelle: Wer hat welche Rolle in welcher Sparte?
CREATE TABLE IF NOT EXISTS profile_club_sports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    sport_id UUID NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('player', 'coach', 'head_coach')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ein User kann pro Club/Sport nur eine Rolle haben
    UNIQUE(user_id, club_id, sport_id)
);

-- Index für schnelle Abfragen
CREATE INDEX IF NOT EXISTS idx_profile_club_sports_user ON profile_club_sports(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_club_sports_club ON profile_club_sports(club_id);
CREATE INDEX IF NOT EXISTS idx_profile_club_sports_sport ON profile_club_sports(sport_id);
CREATE INDEX IF NOT EXISTS idx_profile_club_sports_role ON profile_club_sports(role);
CREATE INDEX IF NOT EXISTS idx_profile_club_sports_club_sport ON profile_club_sports(club_id, sport_id);

-- Trigger für updated_at
CREATE TRIGGER update_profile_club_sports_updated_at
    BEFORE UPDATE ON profile_club_sports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- CONSTRAINT: Coach/Head_Coach nur in EINER Sportart
-- ============================================
-- Ein User kann nur in einer Sportart Coach oder Head_Coach sein
-- (aber in beliebig vielen Sportarten Spieler)

CREATE OR REPLACE FUNCTION check_single_coach_sport()
RETURNS TRIGGER AS $$
BEGIN
    -- Nur prüfen wenn Rolle coach oder head_coach ist
    IF NEW.role IN ('coach', 'head_coach') THEN
        -- Prüfen ob User bereits Coach/Head_Coach in einer anderen Sportart ist
        IF EXISTS (
            SELECT 1 FROM profile_club_sports
            WHERE user_id = NEW.user_id
            AND club_id = NEW.club_id
            AND sport_id != NEW.sport_id
            AND role IN ('coach', 'head_coach')
        ) THEN
            RAISE EXCEPTION 'Ein Benutzer kann nur in einer Sportart Coach oder Spartenleiter sein';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_single_coach_sport
    BEFORE INSERT OR UPDATE ON profile_club_sports
    FOR EACH ROW EXECUTE FUNCTION check_single_coach_sport();

-- ============================================
-- INVITATION CODES: sport_id hinzufügen
-- ============================================

-- Neue Spalte für Sportart
ALTER TABLE invitation_codes
    ADD COLUMN IF NOT EXISTS sport_id UUID REFERENCES sports(id) ON DELETE SET NULL;

-- Index für Sportart-Abfragen
CREATE INDEX IF NOT EXISTS idx_invitation_codes_sport ON invitation_codes(sport_id);

-- ============================================
-- RLS Policies für profile_club_sports
-- ============================================

ALTER TABLE profile_club_sports ENABLE ROW LEVEL SECURITY;

-- Jeder kann lesen (für Mitgliederlisten)
CREATE POLICY "profile_club_sports_select_policy" ON profile_club_sports
    FOR SELECT USING (true);

-- Nur Admins und Head_Coaches können einfügen/ändern
CREATE POLICY "profile_club_sports_insert_policy" ON profile_club_sports
    FOR INSERT WITH CHECK (
        -- Admin kann alles
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
        OR
        -- Head_Coach kann für seinen Club/Sport
        EXISTS (
            SELECT 1 FROM profile_club_sports pcs
            WHERE pcs.user_id = auth.uid()
            AND pcs.club_id = profile_club_sports.club_id
            AND pcs.sport_id = profile_club_sports.sport_id
            AND pcs.role = 'head_coach'
        )
    );

CREATE POLICY "profile_club_sports_update_policy" ON profile_club_sports
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
        OR
        EXISTS (
            SELECT 1 FROM profile_club_sports pcs
            WHERE pcs.user_id = auth.uid()
            AND pcs.club_id = profile_club_sports.club_id
            AND pcs.sport_id = profile_club_sports.sport_id
            AND pcs.role = 'head_coach'
        )
    );

CREATE POLICY "profile_club_sports_delete_policy" ON profile_club_sports
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
        OR
        EXISTS (
            SELECT 1 FROM profile_club_sports pcs
            WHERE pcs.user_id = auth.uid()
            AND pcs.club_id = profile_club_sports.club_id
            AND pcs.sport_id = profile_club_sports.sport_id
            AND pcs.role = 'head_coach'
        )
    );

-- ============================================
-- HILFSFUNKTIONEN
-- ============================================

-- Funktion: Alle Sportarten eines Users in einem Club
CREATE OR REPLACE FUNCTION get_user_sports(p_user_id UUID, p_club_id UUID)
RETURNS TABLE (
    sport_id UUID,
    sport_name TEXT,
    sport_display_name TEXT,
    role TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id as sport_id,
        s.name as sport_name,
        s.display_name as sport_display_name,
        pcs.role
    FROM profile_club_sports pcs
    JOIN sports s ON s.id = pcs.sport_id
    WHERE pcs.user_id = p_user_id
    AND pcs.club_id = p_club_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Funktion: Alle Mitglieder einer Sparte
CREATE OR REPLACE FUNCTION get_sport_members(p_club_id UUID, p_sport_id UUID)
RETURNS TABLE (
    user_id UUID,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    role TEXT,
    avatar_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id as user_id,
        p.first_name,
        p.last_name,
        p.email,
        pcs.role,
        p.avatar_url
    FROM profile_club_sports pcs
    JOIN profiles p ON p.id = pcs.user_id
    WHERE pcs.club_id = p_club_id
    AND pcs.sport_id = p_sport_id
    ORDER BY
        CASE pcs.role
            WHEN 'head_coach' THEN 1
            WHEN 'coach' THEN 2
            ELSE 3
        END,
        p.last_name,
        p.first_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Funktion: Prüfen ob User Head_Coach oder Coach in einer Sparte ist
CREATE OR REPLACE FUNCTION is_coach_for_sport(p_user_id UUID, p_club_id UUID, p_sport_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profile_club_sports
        WHERE user_id = p_user_id
        AND club_id = p_club_id
        AND sport_id = p_sport_id
        AND role IN ('coach', 'head_coach')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Funktion: Prüfen ob User Head_Coach in einer Sparte ist
CREATE OR REPLACE FUNCTION is_head_coach_for_sport(p_user_id UUID, p_club_id UUID, p_sport_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profile_club_sports
        WHERE user_id = p_user_id
        AND club_id = p_club_id
        AND sport_id = p_sport_id
        AND role = 'head_coach'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
