-- Migration: YouTube-Musterbeispiele direkt auf der exercises-Tabelle
-- Admin verwaltet global sichtbare YouTube-Videos pro Übung
-- Alle Spieler der Sportart sehen diese Videos (kein club_id nötig)
--
-- Format: youtube_examples JSONB = Array von Objekten:
-- [
--   { "youtube_id": "dQw4w9WgXcQ", "url": "https://youtube.com/watch?v=...", "title": "Vorhand Topspin" },
--   { "youtube_id": "abc123xyz45", "url": "https://youtu.be/...", "title": "Rückhand Block" }
-- ]

ALTER TABLE exercises
    ADD COLUMN IF NOT EXISTS youtube_examples JSONB DEFAULT '[]'::JSONB;

-- Kommentar für Dokumentation
COMMENT ON COLUMN exercises.youtube_examples IS 'Global YouTube reference videos managed by admin. Array of {youtube_id, url, title}. Visible to all players of this sport.';
