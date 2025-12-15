-- Add tutorial tracking columns to profiles table
-- tutorial_completed: { "coach": true, "player": true }
-- tutorial_completed_at: { "coach": "2025-11-30T22:42:12.932Z", "player": "..." }

-- Add tutorial_completed column (JSONB for storing completion status per tutorial type)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS tutorial_completed JSONB DEFAULT '{}'::jsonb;

-- Add tutorial_completed_at column (JSONB for storing completion timestamps per tutorial type)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS tutorial_completed_at JSONB DEFAULT '{}'::jsonb;

-- Optional: Add index for faster queries on tutorial status
CREATE INDEX IF NOT EXISTS idx_profiles_tutorial_completed
ON profiles USING GIN (tutorial_completed);
