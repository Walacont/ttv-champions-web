-- ============================================
-- Add shot_from and shot_to fields to video_labels
-- Replaces player_position with table position tracking
-- ============================================
-- Run this in Supabase SQL Editor

-- Create ENUM for table position (VH/Mitte/RH)
DO $$ BEGIN
    CREATE TYPE tt_table_position AS ENUM (
        'vh',      -- Vorhand-Seite
        'mitte',   -- Mitte des Tisches
        'rh'       -- Rückhand-Seite
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create ENUM for shot result
DO $$ BEGIN
    CREATE TYPE tt_shot_result AS ENUM (
        'hit',      -- Ball getroffen, im Spiel
        'net',      -- Ball ins Netz
        'out',      -- Ball geht aus (Platte nicht getroffen)
        'miss'      -- Ball verfehlt (Spieler trifft nicht)
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add new columns to video_labels
-- shot_from: Where the player hits the ball from
-- shot_to: Where the ball is directed to (opponent's side)
-- shot_result: Outcome of the shot
ALTER TABLE video_labels
ADD COLUMN IF NOT EXISTS shot_from tt_table_position,
ADD COLUMN IF NOT EXISTS shot_to tt_table_position,
ADD COLUMN IF NOT EXISTS shot_result tt_shot_result DEFAULT 'hit';

-- Optional: If you want to drop the old player_position column
-- ALTER TABLE video_labels DROP COLUMN IF EXISTS player_position;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_video_labels_positions
ON video_labels(shot_from, shot_to);

CREATE INDEX IF NOT EXISTS idx_video_labels_result
ON video_labels(shot_result);

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'video_labels'
AND column_name IN ('shot_from', 'shot_to', 'shot_result');
