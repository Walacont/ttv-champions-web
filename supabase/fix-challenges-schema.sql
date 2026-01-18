-- Fix Challenges Schema
-- Adds missing columns that the JavaScript code expects but don't exist in the database
-- This resolves the RLS policy violation error (42501) which is actually caused by column mismatch

-- Add type column for challenge duration (daily, weekly, monthly)
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'daily';

-- Add points column (code uses 'points', schema has 'xp_reward')
-- Keep both for compatibility
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 10;

-- Add is_repeatable flag
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS is_repeatable BOOLEAN DEFAULT true;

-- Add last_reactivated_at timestamp
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS last_reactivated_at TIMESTAMPTZ;

-- Add tiered_points for milestone system (JSONB for flexible structure)
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS tiered_points JSONB;

-- Add partner_system settings (JSONB)
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS partner_system JSONB;

-- Add unit column for tracking type (e.g., 'Wiederholungen', 'Minuten')
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'Wiederholungen';

-- Make date column optional (code doesn't always provide it)
-- The expiry is calculated from created_at + type duration, so date isn't strictly necessary
ALTER TABLE challenges ALTER COLUMN date DROP NOT NULL;

-- Set default for date to current date if needed
ALTER TABLE challenges ALTER COLUMN date SET DEFAULT CURRENT_DATE;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_challenges_type ON challenges(type);
CREATE INDEX IF NOT EXISTS idx_challenges_is_repeatable ON challenges(is_repeatable);
CREATE INDEX IF NOT EXISTS idx_challenges_is_active ON challenges(is_active);
CREATE INDEX IF NOT EXISTS idx_challenges_club_active ON challenges(club_id, is_active);

-- Sync existing xp_reward values to points column for data consistency
UPDATE challenges SET points = xp_reward WHERE points IS NULL AND xp_reward IS NOT NULL;

COMMENT ON COLUMN challenges.type IS 'Challenge duration type: daily, weekly, or monthly';
COMMENT ON COLUMN challenges.points IS 'Points awarded for completing the challenge';
COMMENT ON COLUMN challenges.is_repeatable IS 'Whether the challenge can be completed multiple times';
COMMENT ON COLUMN challenges.tiered_points IS 'JSON object with milestone configuration: {enabled: bool, milestones: [{count, points}]}';
COMMENT ON COLUMN challenges.partner_system IS 'JSON object with partner settings: {enabled: bool, partnerPercentage: number}';
COMMENT ON COLUMN challenges.unit IS 'Unit of measurement for challenge progress (e.g., Wiederholungen, Minuten)';
