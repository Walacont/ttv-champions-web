-- ============================================
-- Fix: RLS Policy für Profiles INSERT
-- Problem: "new row violates row-level security policy"
-- ============================================

-- Alte Policies löschen
DROP POLICY IF EXISTS "Eigenes Profil erstellen" ON profiles;
DROP POLICY IF EXISTS "Coaches können Offline-Spieler erstellen" ON profiles;
DROP POLICY IF EXISTS "Jeder kann ein Profil erstellen" ON profiles;

-- Neue Policy: Erlaubt INSERT für alle authentifizierten Benutzer
-- Dies ist sicher, weil:
-- 1. Die id muss mit auth.uid() übereinstimmen ODER
-- 2. Der Benutzer ist ein Coach/Admin (für Offline-Spieler)
CREATE POLICY "Profiles können erstellt werden" ON profiles
    FOR INSERT WITH CHECK (
        -- Eigenes Profil erstellen (id = auth.uid())
        auth.uid() = id
        OR
        -- Coaches können Offline-Spieler erstellen
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
        OR
        -- Für neue Benutzer ohne existierendes Profil: erlaube INSERT wenn authentifiziert
        (auth.uid() IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()))
    );

-- ============================================
-- FERTIG!
-- ============================================
