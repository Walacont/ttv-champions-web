-- ============================================
-- Add video_type field to video_analyses
-- ============================================
-- Run this in Supabase SQL Editor

-- Create ENUM for video type
DO $$ BEGIN
    CREATE TYPE tt_video_type AS ENUM (
        'ballmaschine',    -- Balleimer/Ballmaschine: Eine Person spielt, andere trainiert
        'match',           -- Spiel/Match: Beide spielen gegeneinander
        'exercise',        -- Übung: Strukturiertes Training (meist beide)
        'freeplay',        -- Freies Spiel/Training
        'other'            -- Sonstiges
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add video_type column
ALTER TABLE video_analyses
ADD COLUMN IF NOT EXISTS video_type tt_video_type;

-- Create index
CREATE INDEX IF NOT EXISTS idx_video_analyses_video_type
ON video_analyses(video_type);

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'video_analyses'
AND column_name = 'video_type';
