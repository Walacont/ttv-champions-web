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

    -- Club-Zuordnung (NULL für Spieler ohne Club)
    club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,

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

-- Migration: club_id nullable machen falls Tabelle schon existiert
DO $$
BEGIN
    ALTER TABLE video_analyses ALTER COLUMN club_id DROP NOT NULL;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- ============================================
-- VIDEO ASSIGNMENTS (Spieler-Zuweisungen)
-- ============================================

CREATE TABLE IF NOT EXISTS video_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    video_id UUID NOT NULL REFERENCES video_analyses(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Club-Zuordnung (denormalisiert für RLS ohne Rekursion)
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,

    -- Status pro Spieler
    status video_analysis_status DEFAULT 'pending',

    -- Timestamps
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,

    -- Ein Spieler kann ein Video nur einmal zugewiesen bekommen
    UNIQUE(video_id, player_id)
);

-- Club-ID Spalte hinzufügen falls Tabelle schon existiert
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'video_assignments' AND column_name = 'club_id'
    ) THEN
        ALTER TABLE video_assignments ADD COLUMN club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
        -- Bestehende Zuweisungen mit club_id vom Video updaten
        UPDATE video_assignments va
        SET club_id = v.club_id
        FROM video_analyses v
        WHERE va.video_id = v.id AND va.club_id IS NULL;
        -- NOT NULL constraint erst nach Migration setzen
        ALTER TABLE video_assignments ALTER COLUMN club_id SET NOT NULL;
    END IF;
END $$;

-- ============================================
-- VIDEO COMMENTS (Zeitstempel-Kommentare)
-- ============================================

CREATE TABLE IF NOT EXISTS video_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    video_id UUID NOT NULL REFERENCES video_analyses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Club-Zuordnung (denormalisiert für RLS ohne Rekursion)
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,

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

-- Club-ID Spalte hinzufügen falls Tabelle schon existiert
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'video_comments' AND column_name = 'club_id'
    ) THEN
        ALTER TABLE video_comments ADD COLUMN club_id UUID REFERENCES clubs(id) ON DELETE CASCADE;
        -- Bestehende Kommentare mit club_id vom Video updaten
        UPDATE video_comments vc
        SET club_id = v.club_id
        FROM video_analyses v
        WHERE vc.video_id = v.id AND vc.club_id IS NULL;
        -- NOT NULL constraint erst nach Migration setzen
        ALTER TABLE video_comments ALTER COLUMN club_id SET NOT NULL;
    END IF;
END $$;

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
CREATE INDEX IF NOT EXISTS idx_video_assignments_club ON video_assignments(club_id);

CREATE INDEX IF NOT EXISTS idx_video_comments_video ON video_comments(video_id);
CREATE INDEX IF NOT EXISTS idx_video_comments_timestamp ON video_comments(video_id, timestamp_seconds);
CREATE INDEX IF NOT EXISTS idx_video_comments_parent ON video_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_video_comments_club ON video_comments(club_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

DROP TRIGGER IF EXISTS update_video_analyses_updated_at ON video_analyses;
CREATE TRIGGER update_video_analyses_updated_at
    BEFORE UPDATE ON video_analyses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_video_comments_updated_at ON video_comments;
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
-- Mit Club: club_id muss mit eigenem Club übereinstimmen
-- Ohne Club: club_id muss NULL sein
CREATE POLICY "video_analyses_insert" ON video_analyses
    FOR INSERT WITH CHECK (
        auth.uid() = uploaded_by
        AND (
            -- Spieler ohne Club: club_id muss NULL sein
            (club_id IS NULL AND (SELECT p.club_id FROM profiles p WHERE p.id = auth.uid()) IS NULL)
            OR
            -- Spieler mit Club: club_id muss mit eigenem Club übereinstimmen ODER NULL sein (private Videos)
            (club_id IS NULL AND (SELECT p.club_id FROM profiles p WHERE p.id = auth.uid()) IS NOT NULL)
            OR
            -- Für Coach-Feedback: club_id muss mit eigenem Club übereinstimmen
            (club_id = (SELECT p.club_id FROM profiles p WHERE p.id = auth.uid()))
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
-- (Nutzt denormalisierte club_id um Rekursion zu vermeiden)
-- ============================================

-- SELECT: Spieler sieht eigene Zuweisungen, Coach sieht alle im Club
CREATE POLICY "video_assignments_select" ON video_assignments
    FOR SELECT USING (
        player_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.club_id = video_assignments.club_id
            AND p.role IN ('coach', 'admin', 'head_coach')
        )
    );

-- INSERT: Club-Mitglieder können Zuweisungen in ihrem Club erstellen
-- (Spieler weisen sich selbst zu, Coaches weisen anderen zu - App-Logik steuert dies)
CREATE POLICY "video_assignments_insert" ON video_assignments
    FOR INSERT WITH CHECK (
        club_id = (SELECT p.club_id FROM profiles p WHERE p.id = auth.uid())
    );

-- UPDATE: Coach kann Status updaten
CREATE POLICY "video_assignments_update" ON video_assignments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.club_id = video_assignments.club_id
            AND p.role IN ('coach', 'admin', 'head_coach')
        )
    );

-- DELETE: Coach kann Zuweisungen löschen
CREATE POLICY "video_assignments_delete" ON video_assignments
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.club_id = video_assignments.club_id
            AND p.role IN ('coach', 'admin', 'head_coach')
        )
    );

-- ============================================
-- POLICIES: video_comments
-- (Nutzt denormalisierte club_id um Rekursion zu vermeiden)
-- ============================================

-- SELECT: Club-Mitglieder können Kommentare sehen
CREATE POLICY "video_comments_select" ON video_comments
    FOR SELECT USING (
        -- Eigene Kommentare
        user_id = auth.uid()
        OR
        -- Club-Mitglieder können alle Kommentare im Club sehen
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.club_id = video_comments.club_id
        )
    );

-- INSERT: Club-Mitglieder können kommentieren
CREATE POLICY "video_comments_insert" ON video_comments
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND club_id = (SELECT p.club_id FROM profiles p WHERE p.id = auth.uid())
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
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.club_id = video_comments.club_id
            AND p.role IN ('coach', 'admin', 'head_coach')
        )
    );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Funktion: Videos für einen Spieler abrufen (zugewiesene + eigene private)
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
        va.id AS id,
        va.video_url AS video_url,
        va.thumbnail_url AS thumbnail_url,
        va.title AS title,
        va.tags AS tags,
        va.is_reference AS is_reference,
        va.exercise_id AS exercise_id,
        e.name AS exercise_name,
        va.uploaded_by AS uploaded_by,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.')::TEXT AS uploader_name,
        COALESCE(vass.status, 'pending'::video_analysis_status) AS status,
        (SELECT COUNT(*) FROM video_comments vc WHERE vc.video_id = va.id)::BIGINT AS comment_count,
        va.created_at AS created_at
    FROM video_analyses va
    LEFT JOIN video_assignments vass ON vass.video_id = va.id AND vass.player_id = p_player_id
    LEFT JOIN exercises e ON e.id = va.exercise_id
    LEFT JOIN profiles p ON p.id = va.uploaded_by
    WHERE vass.player_id = p_player_id  -- Videos assigned to me
       OR (va.uploaded_by = p_player_id AND va.club_id IS NULL)  -- My private videos (no coach feedback)
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
    SELECT profiles.club_id INTO v_club_id FROM profiles WHERE profiles.id = p_coach_id;

    RETURN QUERY
    SELECT
        va.id AS id,
        va.video_url AS video_url,
        va.thumbnail_url AS thumbnail_url,
        va.title AS title,
        va.tags AS tags,
        va.exercise_id AS exercise_id,
        e.name AS exercise_name,
        va.uploaded_by AS uploaded_by,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.')::TEXT AS uploader_name,
        p.avatar_url AS uploader_avatar,
        (SELECT COUNT(*) FROM video_assignments vass WHERE vass.video_id = va.id)::BIGINT AS assignment_count,
        (SELECT COUNT(*) FROM video_assignments vass WHERE vass.video_id = va.id AND vass.status = 'pending')::BIGINT AS pending_count,
        va.created_at AS created_at
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
        vc.id AS id,
        vc.content AS content,
        vc.timestamp_seconds AS timestamp_seconds,
        vc.parent_id AS parent_id,
        vc.user_id AS user_id,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.')::TEXT AS user_name,
        p.avatar_url AS user_avatar,
        p.role::TEXT AS user_role,
        vc.created_at AS created_at
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
        va.id AS id,
        va.video_url AS video_url,
        va.thumbnail_url AS thumbnail_url,
        va.title AS title,
        va.uploaded_by AS uploaded_by,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.')::TEXT AS uploader_name,
        va.created_at AS created_at
    FROM video_analyses va
    JOIN profiles p ON p.id = va.uploaded_by
    WHERE va.exercise_id = p_exercise_id
      AND va.club_id = p_club_id
      AND va.is_reference = true
    ORDER BY va.created_at DESC;
END;
$$;

-- ============================================
-- ENABLE REALTIME (idempotent)
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'video_analyses'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE video_analyses;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'video_assignments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE video_assignments;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'video_comments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE video_comments;
    END IF;
END $$;

-- ============================================
-- EXERCISE EXAMPLE VIDEOS (Musterlösungen)
-- Coach kann Videos als Beispiele für Übungen markieren
-- ============================================

CREATE TABLE IF NOT EXISTS exercise_example_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Welche Übung
    exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,

    -- Welches Video als Beispiel
    video_id UUID NOT NULL REFERENCES video_analyses(id) ON DELETE CASCADE,

    -- Wer hat es als Beispiel markiert (Coach)
    added_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Club-Zuordnung
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,

    -- Reihenfolge für Sortierung
    sort_order INT DEFAULT 0,

    -- Beschreibung/Notiz vom Coach (optional)
    description TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ein Video kann nur einmal pro Übung als Beispiel markiert werden
    UNIQUE(exercise_id, video_id)
);

-- Index für schnelle Abfragen
CREATE INDEX IF NOT EXISTS idx_exercise_example_videos_exercise ON exercise_example_videos(exercise_id);
CREATE INDEX IF NOT EXISTS idx_exercise_example_videos_club ON exercise_example_videos(club_id);

-- RLS aktivieren
ALTER TABLE exercise_example_videos ENABLE ROW LEVEL SECURITY;

-- SELECT: Alle Club-Mitglieder können Beispielvideos sehen
CREATE POLICY "exercise_example_videos_select" ON exercise_example_videos
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.club_id = exercise_example_videos.club_id
        )
    );

-- INSERT: Nur Coaches können Beispielvideos hinzufügen
CREATE POLICY "exercise_example_videos_insert" ON exercise_example_videos
    FOR INSERT WITH CHECK (
        added_by = auth.uid()
        AND club_id = (SELECT p.club_id FROM profiles p WHERE p.id = auth.uid())
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('coach', 'admin', 'head_coach')
        )
    );

-- DELETE: Nur Coaches können Beispielvideos entfernen
CREATE POLICY "exercise_example_videos_delete" ON exercise_example_videos
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.club_id = exercise_example_videos.club_id
            AND p.role IN ('coach', 'admin', 'head_coach')
        )
    );

-- UPDATE: Nur Coaches können Beispielvideos bearbeiten
CREATE POLICY "exercise_example_videos_update" ON exercise_example_videos
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.club_id = exercise_example_videos.club_id
            AND p.role IN ('coach', 'admin', 'head_coach')
        )
    );

-- Funktion: Beispielvideos für eine Übung abrufen
CREATE OR REPLACE FUNCTION get_exercise_example_videos(p_exercise_id UUID, p_club_id UUID)
RETURNS TABLE (
    id UUID,
    video_id UUID,
    video_url TEXT,
    thumbnail_url TEXT,
    title TEXT,
    description TEXT,
    uploaded_by UUID,
    uploader_name TEXT,
    sort_order INT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        eev.id AS id,
        va.id AS video_id,
        va.video_url AS video_url,
        va.thumbnail_url AS thumbnail_url,
        va.title AS title,
        eev.description AS description,
        va.uploaded_by AS uploaded_by,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.')::TEXT AS uploader_name,
        eev.sort_order AS sort_order,
        eev.created_at AS created_at
    FROM exercise_example_videos eev
    JOIN video_analyses va ON va.id = eev.video_id
    JOIN profiles p ON p.id = va.uploaded_by
    WHERE eev.exercise_id = p_exercise_id
      AND eev.club_id = p_club_id
    ORDER BY eev.sort_order ASC, eev.created_at DESC;
END;
$$;
