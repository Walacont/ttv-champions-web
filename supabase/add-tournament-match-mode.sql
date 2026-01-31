-- Add match_mode column to tournaments table
-- Run this if you already ran tournaments.sql before this column was added

ALTER TABLE tournaments
ADD COLUMN IF NOT EXISTS match_mode TEXT DEFAULT 'best-of-5';
