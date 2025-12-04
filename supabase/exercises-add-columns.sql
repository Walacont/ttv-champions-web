-- Add missing columns to exercises table for full migration
-- Run this BEFORE running migrate-exercises-full.js

-- Add title column (some exercises have title instead of name)
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS title TEXT;

-- Add image_url for exercise images
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add description_content for rich content (tables, formatted text)
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS description_content JSONB;

-- Add tags array (in addition to category)
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Add points column (in addition to xp_reward for backwards compatibility)
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 10;

-- Add level column
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS level TEXT;

-- Add visibility column
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'global';

-- Add tiered_points for exercises with multiple point tiers
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS tiered_points JSONB;

-- Add club_id for club-specific exercises
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id);

-- Add created_by_name for display purposes
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS created_by_name TEXT;

-- Add record holder fields
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS record_count INTEGER;

ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS record_holder_id UUID REFERENCES profiles(id);

ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS record_holder_name TEXT;

ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS record_holder_club TEXT;

ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS record_holder_club_id UUID REFERENCES clubs(id);

ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS record_updated_at TIMESTAMPTZ;

-- Create index on image_url for faster filtering
CREATE INDEX IF NOT EXISTS idx_exercises_image_url ON exercises(image_url) WHERE image_url IS NOT NULL;

-- Create index on visibility for faster filtering
CREATE INDEX IF NOT EXISTS idx_exercises_visibility ON exercises(visibility);

-- Create index on club_id for club-specific exercises
CREATE INDEX IF NOT EXISTS idx_exercises_club_id ON exercises(club_id);
