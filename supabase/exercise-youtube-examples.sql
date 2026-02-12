-- Migration: YouTube-Videos als Musterbeispiele für Übungen
-- Erweitert exercise_example_videos um YouTube-Support
-- YouTube-Einträge haben video_id = NULL, dafür youtube_url + youtube_id

-- 1. video_id nullable machen (YouTube-Einträge haben kein video_analyses-Record)
ALTER TABLE exercise_example_videos ALTER COLUMN video_id DROP NOT NULL;

-- 2. Neue Spalten für YouTube-Support
ALTER TABLE exercise_example_videos
    ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'upload'
        CHECK (source_type IN ('upload', 'youtube')),
    ADD COLUMN IF NOT EXISTS youtube_url TEXT,
    ADD COLUMN IF NOT EXISTS youtube_id TEXT,
    ADD COLUMN IF NOT EXISTS title_override TEXT;

-- 3. Constraint: YouTube-Einträge müssen youtube_id haben, Upload-Einträge müssen video_id haben
ALTER TABLE exercise_example_videos
    ADD CONSTRAINT check_source_type_fields CHECK (
        (source_type = 'upload' AND video_id IS NOT NULL)
        OR (source_type = 'youtube' AND youtube_id IS NOT NULL AND youtube_url IS NOT NULL)
    );

-- 4. Unique-Constraint für YouTube: Ein YouTube-Video nur einmal pro Übung
CREATE UNIQUE INDEX IF NOT EXISTS idx_exercise_example_videos_youtube_unique
    ON exercise_example_videos(exercise_id, youtube_id)
    WHERE source_type = 'youtube';

-- 5. Index für source_type Abfragen
CREATE INDEX IF NOT EXISTS idx_exercise_example_videos_source_type
    ON exercise_example_videos(source_type);

-- 6. RPC-Funktion aktualisieren: Auch YouTube-Einträge zurückgeben
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
    created_at TIMESTAMPTZ,
    source_type TEXT,
    youtube_url TEXT,
    youtube_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    -- Upload-Videos (bestehende Logik)
    SELECT
        eev.id AS id,
        va.id AS video_id,
        va.video_url AS video_url,
        va.thumbnail_url AS thumbnail_url,
        COALESCE(eev.title_override, va.title)::TEXT AS title,
        eev.description AS description,
        va.uploaded_by AS uploaded_by,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.')::TEXT AS uploader_name,
        eev.sort_order AS sort_order,
        eev.created_at AS created_at,
        eev.source_type AS source_type,
        eev.youtube_url AS youtube_url,
        eev.youtube_id AS youtube_id
    FROM exercise_example_videos eev
    JOIN video_analyses va ON va.id = eev.video_id
    JOIN profiles p ON p.id = va.uploaded_by
    WHERE eev.exercise_id = p_exercise_id
      AND eev.club_id = p_club_id
      AND eev.source_type = 'upload'

    UNION ALL

    -- YouTube-Videos
    SELECT
        eev.id AS id,
        NULL::UUID AS video_id,
        eev.youtube_url AS video_url,
        ('https://img.youtube.com/vi/' || eev.youtube_id || '/mqdefault.jpg')::TEXT AS thumbnail_url,
        COALESCE(eev.title_override, 'YouTube Video')::TEXT AS title,
        eev.description AS description,
        eev.added_by AS uploaded_by,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.')::TEXT AS uploader_name,
        eev.sort_order AS sort_order,
        eev.created_at AS created_at,
        eev.source_type AS source_type,
        eev.youtube_url AS youtube_url,
        eev.youtube_id AS youtube_id
    FROM exercise_example_videos eev
    JOIN profiles p ON p.id = eev.added_by
    WHERE eev.exercise_id = p_exercise_id
      AND eev.club_id = p_club_id
      AND eev.source_type = 'youtube'

    ORDER BY sort_order ASC, created_at DESC;
END;
$$;
