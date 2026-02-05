-- ============================================
-- Migration: Nur invitation_codes Tabelle hinzufügen
-- Für bestehende Datenbank
-- ============================================

-- 1. Role-Constraint aktualisieren (head_coach hinzufügen)
-- ============================================
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('player', 'coach', 'head_coach', 'admin'));

-- 2. invitation_codes Tabelle erstellen
-- ============================================
CREATE TABLE IF NOT EXISTS invitation_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    subgroup_id UUID REFERENCES subgroups(id) ON DELETE SET NULL,

    -- Nutzungslimits
    max_uses INTEGER DEFAULT 1,
    use_count INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,

    -- Spieler-Daten (optional, für Offline-Spieler)
    first_name TEXT,
    last_name TEXT,
    birthdate TEXT,
    gender TEXT,
    role TEXT DEFAULT 'player',
    subgroup_ids UUID[] DEFAULT '{}',

    -- Verknüpfung mit bestehendem Offline-Spieler
    player_id UUID REFERENCES profiles(id),

    -- Nutzungsstatus
    used BOOLEAN DEFAULT FALSE,
    used_by UUID REFERENCES profiles(id),
    used_at TIMESTAMPTZ,
    superseded BOOLEAN DEFAULT FALSE,
    superseded_at TIMESTAMPTZ,

    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indizes erstellen
-- ============================================
CREATE INDEX IF NOT EXISTS idx_invitation_codes_code ON invitation_codes(code) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_invitation_codes_club ON invitation_codes(club_id);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_player ON invitation_codes(player_id);

-- 4. RLS aktivieren
-- ============================================
ALTER TABLE invitation_codes ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies für invitation_codes
-- ============================================
DROP POLICY IF EXISTS "Invitation-Codes können abgefragt werden" ON invitation_codes;
DROP POLICY IF EXISTS "Invitation-Codes können aktualisiert werden" ON invitation_codes;
DROP POLICY IF EXISTS "Coaches können Invitation-Codes erstellen" ON invitation_codes;
DROP POLICY IF EXISTS "Coaches können Invitation-Codes löschen" ON invitation_codes;

CREATE POLICY "Invitation-Codes können abgefragt werden" ON invitation_codes
    FOR SELECT USING (is_active = true);

CREATE POLICY "Invitation-Codes können aktualisiert werden" ON invitation_codes
    FOR UPDATE USING (true);

CREATE POLICY "Coaches können Invitation-Codes erstellen" ON invitation_codes
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

CREATE POLICY "Coaches können Invitation-Codes löschen" ON invitation_codes
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

-- 6. Policy für Offline-Spieler erstellen (falls nicht vorhanden)
-- ============================================
DROP POLICY IF EXISTS "Coaches können Offline-Spieler erstellen" ON profiles;
CREATE POLICY "Coaches können Offline-Spieler erstellen" ON profiles
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- FERTIG!
-- ============================================
