-- Video Analysis System
-- Ermöglicht Spielern Videos hochzuladen und Coaches diese zu analysieren
-- ============================================

-- ============================================
-- ENUM TYPE für Video-Status
-- ============================================

DO $$ BEGIN
    CREATE TYPE video_analysis_status AS ENUM ('pending', 'reviewed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- VIDEO ANALYSES (Haupt-Tabelle)
-- ============================================

CREATE TABLE IF NOT EXISTS video_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Wer hat hochgeladen (Spieler ODER Coach)
    uploaded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Club-Zuordnung (für RLS)
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,

    -- Optional: Übungsbezug
    exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL,

    -- Video-Daten
    video_url TEXT NOT NULL,
    thumbnail_url TEXT,
    duration_seconds FLOAT,
    file_size BIGINT,

    -- Metadaten
    title TEXT,
    tags TEXT[] DEFAULT '{}',
    is_reference BOOLEAN DEFAULT false,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- VIDEO ASSIGNMENTS (Spieler-Zuweisungen)
-- ============================================

CREATE TABLE IF NOT EXISTS video_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    video_id UUID NOT NULL REFERENCES video_analyses(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Status pro Spieler
    status video_analysis_status DEFAULT 'pending',

    -- Timestamps
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,

    -- Ein Spieler kann ein Video nur einmal zugewiesen bekommen
    UNIQUE(video_id, player_id)
);

-- ============================================
-- VIDEO COMMENTS (Zeitstempel-Kommentare)
-- ============================================

CREATE TABLE IF NOT EXISTS video_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    video_id UUID NOT NULL REFERENCES video_analyses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Kommentar-Inhalt
    content TEXT NOT NULL,

    -- Optional: Zeitstempel im Video (Sekunden)
    timestamp_seconds FLOAT,

    -- Für Thread-Antworten
    parent_id UUID REFERENCES video_comments(id) ON DELETE CASCADE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES für Performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_video_analyses_club ON video_analyses(club_id);
CREATE INDEX IF NOT EXISTS idx_video_analyses_uploaded_by ON video_analyses(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_video_analyses_exercise ON video_analyses(exercise_id);
CREATE INDEX IF NOT EXISTS idx_video_analyses_is_reference ON video_analyses(is_reference) WHERE is_reference = true;
CREATE INDEX IF NOT EXISTS idx_video_analyses_created ON video_analyses(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_assignments_video ON video_assignments(video_id);
CREATE INDEX IF NOT EXISTS idx_video_assignments_player ON video_assignments(player_id);
CREATE INDEX IF NOT EXISTS idx_video_assignments_status ON video_assignments(status);

CREATE INDEX IF NOT EXISTS idx_video_comments_video ON video_comments(video_id);
CREATE INDEX IF NOT EXISTS idx_video_comments_timestamp ON video_comments(video_id, timestamp_seconds);
CREATE INDEX IF NOT EXISTS idx_video_comments_parent ON video_comments(parent_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE TRIGGER update_video_analyses_updated_at
    BEFORE UPDATE ON video_analyses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_video_comments_updated_at
    BEFORE UPDATE ON video_comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE video_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_comments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (für Re-Run)
DROP POLICY IF EXISTS "video_analyses_select" ON video_analyses;
DROP POLICY IF EXISTS "video_analyses_insert" ON video_analyses;
DROP POLICY IF EXISTS "video_analyses_update" ON video_analyses;
DROP POLICY IF EXISTS "video_analyses_delete" ON video_analyses;

DROP POLICY IF EXISTS "video_assignments_select" ON video_assignments;
DROP POLICY IF EXISTS "video_assignments_insert" ON video_assignments;
DROP POLICY IF EXISTS "video_assignments_update" ON video_assignments;
DROP POLICY IF EXISTS "video_assignments_delete" ON video_assignments;

DROP POLICY IF EXISTS "video_comments_select" ON video_comments;
DROP POLICY IF EXISTS "video_comments_insert" ON video_comments;
DROP POLICY IF EXISTS "video_comments_update" ON video_comments;
DROP POLICY IF EXISTS "video_comments_delete" ON video_comments;

-- ============================================
-- POLICIES: video_analyses
-- ============================================

-- SELECT: Spieler sehen eigene + zugewiesene Videos, Coaches sehen alle im Club
CREATE POLICY "video_analyses_select" ON video_analyses
    FOR SELECT USING (
        -- Eigene Videos
        uploaded_by = auth.uid()
        OR
        -- Zugewiesene Videos
        EXISTS (
            SELECT 1 FROM video_assignments va
            WHERE va.video_id = id AND va.player_id = auth.uid()
        )
        OR
        -- Coach/Admin sieht alle Videos im eigenen Club
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.club_id = video_analyses.club_id
            AND p.role IN ('coach', 'admin', 'head_coach')
        )
    );

-- INSERT: Jeder authentifizierte User kann Videos hochladen
CREATE POLICY "video_analyses_insert" ON video_analyses
    FOR INSERT WITH CHECK (
        auth.uid() = uploaded_by
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid() AND p.club_id = video_analyses.club_id
        )
    );

-- UPDATE: Nur der Uploader oder Coach kann bearbeiten
CREATE POLICY "video_analyses_update" ON video_analyses
    FOR UPDATE USING (
        uploaded_by = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.club_id = video_analyses.club_id
            AND p.role IN ('coach', 'admin', 'head_coach')
        )
    );

-- DELETE: Nur der Uploader oder Coach kann löschen
CREATE POLICY "video_analyses_delete" ON video_analyses
    FOR DELETE USING (
        uploaded_by = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.club_id = video_analyses.club_id
            AND p.role IN ('coach', 'admin', 'head_coach')
        )
    );

-- ============================================
-- POLICIES: video_assignments
-- ============================================

-- SELECT: Spieler sieht eigene Zuweisungen, Coach sieht alle im Club
CREATE POLICY "video_assignments_select" ON video_assignments
    FOR SELECT USING (
        player_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM video_analyses va
            JOIN profiles p ON p.id = auth.uid()
            WHERE va.id = video_assignments.video_id
            AND p.club_id = va.club_id
            AND p.role IN ('coach', 'admin', 'head_coach')
        )
    );

-- INSERT: Nur Coach kann Zuweisungen erstellen
CREATE POLICY "video_assignments_insert" ON video_assignments
    FOR INSERT WITH CHECK (
        -- Der Uploader des Videos kann zuweisen
        EXISTS (
            SELECT 1 FROM video_analyses va
            WHERE va.id = video_assignments.video_id
            AND va.uploaded_by = auth.uid()
        )
        OR
        -- Coaches können zuweisen
        EXISTS (
            SELECT 1 FROM video_analyses va
            JOIN profiles p ON p.id = auth.uid()
            WHERE va.id = video_assignments.video_id
            AND p.club_id = va.club_id
            AND p.role IN ('coach', 'admin', 'head_coach')
        )
    );

-- UPDATE: Coach kann Status updaten
CREATE POLICY "video_assignments_update" ON video_assignments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM video_analyses va
            JOIN profiles p ON p.id = auth.uid()
            WHERE va.id = video_assignments.video_id
            AND p.club_id = va.club_id
            AND p.role IN ('coach', 'admin', 'head_coach')
        )
    );

-- DELETE: Uploader oder Coach kann Zuweisungen löschen
CREATE POLICY "video_assignments_delete" ON video_assignments
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM video_analyses va
            WHERE va.id = video_assignments.video_id
            AND va.uploaded_by = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM video_analyses va
            JOIN profiles p ON p.id = auth.uid()
            WHERE va.id = video_assignments.video_id
            AND p.club_id = va.club_id
            AND p.role IN ('coach', 'admin', 'head_coach')
        )
    );

-- ============================================
-- POLICIES: video_comments
-- ============================================

-- SELECT: Jeder der das Video sehen kann, kann auch Kommentare sehen
CREATE POLICY "video_comments_select" ON video_comments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM video_analyses va
            WHERE va.id = video_comments.video_id
            AND (
                va.uploaded_by = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM video_assignments vass
                    WHERE vass.video_id = va.id AND vass.player_id = auth.uid()
                )
                OR EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE p.id = auth.uid()
                    AND p.club_id = va.club_id
                    AND p.role IN ('coach', 'admin', 'head_coach')
                )
            )
        )
    );

-- INSERT: Jeder der das Video sehen kann, kann kommentieren
CREATE POLICY "video_comments_insert" ON video_comments
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM video_analyses va
            WHERE va.id = video_comments.video_id
            AND (
                va.uploaded_by = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM video_assignments vass
                    WHERE vass.video_id = va.id AND vass.player_id = auth.uid()
                )
                OR EXISTS (
                    SELECT 1 FROM profiles p
                    WHERE p.id = auth.uid()
                    AND p.club_id = va.club_id
                    AND p.role IN ('coach', 'admin', 'head_coach')
                )
            )
        )
    );

-- UPDATE: Nur eigene Kommentare bearbeiten
CREATE POLICY "video_comments_update" ON video_comments
    FOR UPDATE USING (user_id = auth.uid());

-- DELETE: Eigene Kommentare oder Coach kann alle löschen
CREATE POLICY "video_comments_delete" ON video_comments
    FOR DELETE USING (
        user_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM video_analyses va
            JOIN profiles p ON p.id = auth.uid()
            WHERE va.id = video_comments.video_id
            AND p.club_id = va.club_id
            AND p.role IN ('coach', 'admin', 'head_coach')
        )
    );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Funktion: Videos für einen Spieler abrufen (zugewiesene + eigene)
CREATE OR REPLACE FUNCTION get_player_videos(p_player_id UUID)
RETURNS TABLE (
    id UUID,
    video_url TEXT,
    thumbnail_url TEXT,
    title TEXT,
    tags TEXT[],
    is_reference BOOLEAN,
    exercise_id UUID,
    exercise_name TEXT,
    uploaded_by UUID,
    uploader_name TEXT,
    status video_analysis_status,
    comment_count BIGINT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        va.id,
        va.video_url,
        va.thumbnail_url,
        va.title,
        va.tags,
        va.is_reference,
        va.exercise_id,
        e.name AS exercise_name,
        va.uploaded_by,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.') AS uploader_name,
        COALESCE(vass.status, 'pending'::video_analysis_status) AS status,
        (SELECT COUNT(*) FROM video_comments vc WHERE vc.video_id = va.id) AS comment_count,
        va.created_at
    FROM video_analyses va
    LEFT JOIN video_assignments vass ON vass.video_id = va.id AND vass.player_id = p_player_id
    LEFT JOIN exercises e ON e.id = va.exercise_id
    LEFT JOIN profiles p ON p.id = va.uploaded_by
    WHERE va.uploaded_by = p_player_id
       OR vass.player_id = p_player_id
    ORDER BY va.created_at DESC;
END;
$$;

-- Funktion: Ungesehene Videos für Coach (Inbox)
CREATE OR REPLACE FUNCTION get_pending_videos_for_coach(p_coach_id UUID)
RETURNS TABLE (
    id UUID,
    video_url TEXT,
    thumbnail_url TEXT,
    title TEXT,
    tags TEXT[],
    exercise_id UUID,
    exercise_name TEXT,
    uploaded_by UUID,
    uploader_name TEXT,
    uploader_avatar TEXT,
    assignment_count BIGINT,
    pending_count BIGINT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_club_id UUID;
BEGIN
    -- Club des Coaches ermitteln
    SELECT club_id INTO v_club_id FROM profiles WHERE id = p_coach_id;

    RETURN QUERY
    SELECT
        va.id,
        va.video_url,
        va.thumbnail_url,
        va.title,
        va.tags,
        va.exercise_id,
        e.name AS exercise_name,
        va.uploaded_by,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.') AS uploader_name,
        p.avatar_url AS uploader_avatar,
        (SELECT COUNT(*) FROM video_assignments vass WHERE vass.video_id = va.id) AS assignment_count,
        (SELECT COUNT(*) FROM video_assignments vass WHERE vass.video_id = va.id AND vass.status = 'pending') AS pending_count,
        va.created_at
    FROM video_analyses va
    LEFT JOIN exercises e ON e.id = va.exercise_id
    LEFT JOIN profiles p ON p.id = va.uploaded_by
    WHERE va.club_id = v_club_id
      AND va.is_reference = false
      AND EXISTS (
          SELECT 1 FROM video_assignments vass
          WHERE vass.video_id = va.id AND vass.status = 'pending'
      )
    ORDER BY va.created_at ASC; -- Älteste zuerst (FIFO)
END;
$$;

-- Funktion: Kommentare mit Zeitstempel für ein Video
CREATE OR REPLACE FUNCTION get_video_comments(p_video_id UUID)
RETURNS TABLE (
    id UUID,
    content TEXT,
    timestamp_seconds FLOAT,
    parent_id UUID,
    user_id UUID,
    user_name TEXT,
    user_avatar TEXT,
    user_role TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        vc.id,
        vc.content,
        vc.timestamp_seconds,
        vc.parent_id,
        vc.user_id,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.') AS user_name,
        p.avatar_url AS user_avatar,
        p.role::TEXT AS user_role,
        vc.created_at
    FROM video_comments vc
    JOIN profiles p ON p.id = vc.user_id
    WHERE vc.video_id = p_video_id
    ORDER BY COALESCE(vc.timestamp_seconds, 999999), vc.created_at;
END;
$$;

-- Funktion: Referenz-Videos für eine Übung
CREATE OR REPLACE FUNCTION get_reference_videos(p_exercise_id UUID, p_club_id UUID)
RETURNS TABLE (
    id UUID,
    video_url TEXT,
    thumbnail_url TEXT,
    title TEXT,
    uploaded_by UUID,
    uploader_name TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        va.id,
        va.video_url,
        va.thumbnail_url,
        va.title,
        va.uploaded_by,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.') AS uploader_name,
        va.created_at
    FROM video_analyses va
    JOIN profiles p ON p.id = va.uploaded_by
    WHERE va.exercise_id = p_exercise_id
      AND va.club_id = p_club_id
      AND va.is_reference = true
    ORDER BY va.created_at DESC;
END;
$$;

-- ============================================
-- ENABLE REALTIME
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE video_analyses;
ALTER PUBLICATION supabase_realtime ADD TABLE video_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE video_comments;
