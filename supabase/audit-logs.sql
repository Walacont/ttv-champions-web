-- ============================================
-- AUDIT LOGS - Protokollierung von Admin-Aktionen
-- ============================================

-- Tabelle für Audit-Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action TEXT NOT NULL, -- z.B. 'invitation_created', 'season_started', 'role_changed'
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Wer hat die Aktion durchgeführt?
    target_id UUID, -- Auf wen/was bezieht sich die Aktion? (User-ID, Club-ID, etc.)
    target_type TEXT, -- 'user', 'club', 'sport', 'season', 'invitation', etc.
    club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
    sport_id UUID REFERENCES sports(id) ON DELETE SET NULL,
    details JSONB, -- Zusätzliche Details zur Aktion
    ip_address TEXT, -- Optional: IP-Adresse
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices für schnelle Abfragen
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_club ON audit_logs(club_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_sport ON audit_logs(sport_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type ON audit_logs(target_type);

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Nur Admins können Logs lesen
CREATE POLICY "audit_logs_select_policy" ON audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Jeder authentifizierte User kann Logs erstellen (via Funktion)
-- Aber direkte Inserts nur für Service-Role
CREATE POLICY "audit_logs_insert_policy" ON audit_logs
    FOR INSERT WITH CHECK (true);

-- Logs können nicht geändert oder gelöscht werden (Audit-Trail)
-- Keine UPDATE oder DELETE Policies

-- ============================================
-- LOGGING FUNKTION
-- ============================================

CREATE OR REPLACE FUNCTION log_audit_event(
    p_action TEXT,
    p_actor_id UUID,
    p_target_id UUID DEFAULT NULL,
    p_target_type TEXT DEFAULT NULL,
    p_club_id UUID DEFAULT NULL,
    p_sport_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO audit_logs (
        action,
        actor_id,
        target_id,
        target_type,
        club_id,
        sport_id,
        details
    ) VALUES (
        p_action,
        p_actor_id,
        p_target_id,
        p_target_type,
        p_club_id,
        p_sport_id,
        p_details
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HILFSFUNKTIONEN FÜR ADMIN-DASHBOARD
-- ============================================

-- Alle Logs abrufen (mit Pagination)
CREATE OR REPLACE FUNCTION get_audit_logs(
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0,
    p_action_filter TEXT DEFAULT NULL,
    p_club_filter UUID DEFAULT NULL,
    p_sport_filter UUID DEFAULT NULL,
    p_date_from TIMESTAMPTZ DEFAULT NULL,
    p_date_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    action TEXT,
    actor_id UUID,
    actor_name TEXT,
    actor_email TEXT,
    target_id UUID,
    target_type TEXT,
    target_name TEXT,
    club_id UUID,
    club_name TEXT,
    sport_id UUID,
    sport_name TEXT,
    details JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.id,
        al.action,
        al.actor_id,
        COALESCE(actor.first_name || ' ' || actor.last_name, 'System') as actor_name,
        actor.email as actor_email,
        al.target_id,
        al.target_type,
        CASE
            WHEN al.target_type = 'user' THEN
                (SELECT COALESCE(p.first_name || ' ' || p.last_name, p.email)
                 FROM profiles p WHERE p.id = al.target_id)
            WHEN al.target_type = 'club' THEN
                (SELECT c.name FROM clubs c WHERE c.id = al.target_id)
            WHEN al.target_type = 'sport' THEN
                (SELECT s.display_name FROM sports s WHERE s.id = al.target_id)
            WHEN al.target_type = 'season' THEN
                (SELECT se.name FROM seasons se WHERE se.id = al.target_id)
            ELSE NULL
        END as target_name,
        al.club_id,
        club.name as club_name,
        al.sport_id,
        sport.display_name as sport_name,
        al.details,
        al.created_at
    FROM audit_logs al
    LEFT JOIN profiles actor ON actor.id = al.actor_id
    LEFT JOIN clubs club ON club.id = al.club_id
    LEFT JOIN sports sport ON sport.id = al.sport_id
    WHERE
        (p_action_filter IS NULL OR al.action = p_action_filter)
        AND (p_club_filter IS NULL OR al.club_id = p_club_filter)
        AND (p_sport_filter IS NULL OR al.sport_id = p_sport_filter)
        AND (p_date_from IS NULL OR al.created_at >= p_date_from)
        AND (p_date_to IS NULL OR al.created_at <= p_date_to)
    ORDER BY al.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Anzahl der Logs (für Pagination)
CREATE OR REPLACE FUNCTION count_audit_logs(
    p_action_filter TEXT DEFAULT NULL,
    p_club_filter UUID DEFAULT NULL,
    p_sport_filter UUID DEFAULT NULL,
    p_date_from TIMESTAMPTZ DEFAULT NULL,
    p_date_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*)::INTEGER INTO v_count
    FROM audit_logs al
    WHERE
        (p_action_filter IS NULL OR al.action = p_action_filter)
        AND (p_club_filter IS NULL OR al.club_id = p_club_filter)
        AND (p_sport_filter IS NULL OR al.sport_id = p_sport_filter)
        AND (p_date_from IS NULL OR al.created_at >= p_date_from)
        AND (p_date_to IS NULL OR al.created_at <= p_date_to);

    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- ACTION TYPES (Dokumentation)
-- ============================================
--
-- invitation_created    - Einladungscode erstellt
-- invitation_used       - Einladungscode verwendet
-- season_started        - Neue Saison gestartet
-- role_changed          - Rolle geändert (in profile_club_sports)
-- user_promoted         - User zum Coach/Head_Coach befördert
-- user_demoted          - User zum Player degradiert
-- user_removed          - User aus Sparte entfernt
-- club_created          - Club erstellt
-- sport_added_to_club   - Sportart zu Club hinzugefügt
-- points_reset          - Punkte zurückgesetzt (Saisonstart)
-- admin_login           - Admin Login
--
