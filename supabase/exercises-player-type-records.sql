-- Migration: Add player type, time direction, and record tracking columns
-- Run this to enable the new exercise features:
-- - Player type (both active vs A active/B passive)
-- - Time-based exercises with direction (faster/longer is better)
-- - Personal records with partner tracking

-- ============================================
-- EXERCISES TABLE - New columns
-- ============================================

-- Player type: determines how points are distributed in pair mode
-- 'both_active' = both players get 100%
-- 'a_active_b_passive' = Player A gets 100%, Player B gets 50%
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS player_type TEXT DEFAULT 'both_active';

-- Time direction for time-based exercises
-- 'faster' = lower time is better (speed)
-- 'longer' = higher time is better (endurance)
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS time_direction TEXT;

-- Unit for milestone tracking (Wiederholungen, Ballberührungen, Zeit, etc.)
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS unit TEXT;

-- Animation steps for exercise visualization
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS animation_steps JSONB;

-- ============================================
-- EXERCISE_MILESTONES TABLE - New columns
-- ============================================

-- Current count (the actual milestone count achieved)
ALTER TABLE exercise_milestones
ADD COLUMN IF NOT EXISTS current_count INTEGER DEFAULT 0;

-- Achieved milestones (array of milestone counts that were achieved)
ALTER TABLE exercise_milestones
ADD COLUMN IF NOT EXISTS achieved_milestones INTEGER[];

-- Partner ID for pair mode records
ALTER TABLE exercise_milestones
ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Play mode: 'solo' (Balleimer/Roboter) or 'pair'
ALTER TABLE exercise_milestones
ADD COLUMN IF NOT EXISTS play_mode TEXT DEFAULT 'solo';

-- ============================================
-- EXERCISE_RECORDS TABLE - New table for detailed record tracking
-- This allows tracking best records separately for different partners
-- ============================================

CREATE TABLE IF NOT EXISTS exercise_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,

    -- Record value (count for normal, seconds for time-based)
    record_value INTEGER NOT NULL,

    -- Play mode: 'solo' or 'pair'
    play_mode TEXT NOT NULL DEFAULT 'solo',

    -- Partner for pair mode (NULL for solo)
    partner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

    -- When this record was achieved
    achieved_at TIMESTAMPTZ DEFAULT NOW(),

    -- Points earned for this record
    points_earned INTEGER DEFAULT 0,

    -- Season tracking
    season TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one best record per user/exercise/partner/mode combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_exercise_records_unique
ON exercise_records(user_id, exercise_id, play_mode, COALESCE(partner_id, '00000000-0000-0000-0000-000000000000'));

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_exercise_records_user ON exercise_records(user_id);

-- Index for fast lookup by exercise
CREATE INDEX IF NOT EXISTS idx_exercise_records_exercise ON exercise_records(exercise_id);

-- Index for partner records
CREATE INDEX IF NOT EXISTS idx_exercise_records_partner ON exercise_records(partner_id) WHERE partner_id IS NOT NULL;

-- ============================================
-- POINTS_HISTORY TABLE - Add partner tracking
-- ============================================

ALTER TABLE points_history
ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE points_history
ADD COLUMN IF NOT EXISTS play_mode TEXT;

-- ============================================
-- COMPLETED_EXERCISES TABLE - Add partner tracking
-- ============================================

ALTER TABLE completed_exercises
ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE completed_exercises
ADD COLUMN IF NOT EXISTS play_mode TEXT DEFAULT 'solo';

-- Update unique constraint to include partner
-- First drop the old constraint (not index!)
ALTER TABLE completed_exercises
DROP CONSTRAINT IF EXISTS completed_exercises_user_id_exercise_id_season_key;

-- Create new unique index with partner and play_mode
CREATE UNIQUE INDEX IF NOT EXISTS idx_completed_exercises_unique
ON completed_exercises(user_id, exercise_id, COALESCE(season, ''), COALESCE(play_mode, 'solo'), COALESCE(partner_id, '00000000-0000-0000-0000-000000000000'));

-- ============================================
-- HELPER FUNCTION: Update exercise record
-- ============================================

CREATE OR REPLACE FUNCTION update_exercise_record(
    p_user_id UUID,
    p_exercise_id UUID,
    p_record_value INTEGER,
    p_play_mode TEXT DEFAULT 'solo',
    p_partner_id UUID DEFAULT NULL,
    p_points_earned INTEGER DEFAULT 0,
    p_season TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_existing_value INTEGER;
    v_time_direction TEXT;
    v_is_better BOOLEAN;
BEGIN
    -- Get the time direction for this exercise
    SELECT time_direction INTO v_time_direction
    FROM exercises
    WHERE id = p_exercise_id;

    -- Check existing record
    SELECT record_value INTO v_existing_value
    FROM exercise_records
    WHERE user_id = p_user_id
      AND exercise_id = p_exercise_id
      AND play_mode = p_play_mode
      AND COALESCE(partner_id, '00000000-0000-0000-0000-000000000000') = COALESCE(p_partner_id, '00000000-0000-0000-0000-000000000000');

    -- Determine if new value is better
    IF v_existing_value IS NULL THEN
        v_is_better := TRUE;
    ELSIF v_time_direction = 'faster' THEN
        v_is_better := p_record_value < v_existing_value;
    ELSE
        -- For 'longer' time or count-based: higher is better
        v_is_better := p_record_value > v_existing_value;
    END IF;

    -- Update if better
    IF v_is_better THEN
        INSERT INTO exercise_records (
            user_id, exercise_id, record_value, play_mode, partner_id, points_earned, season, achieved_at
        ) VALUES (
            p_user_id, p_exercise_id, p_record_value, p_play_mode, p_partner_id, p_points_earned, p_season, NOW()
        )
        ON CONFLICT (user_id, exercise_id, play_mode, COALESCE(partner_id, '00000000-0000-0000-0000-000000000000'))
        DO UPDATE SET
            record_value = p_record_value,
            points_earned = p_points_earned,
            achieved_at = NOW(),
            updated_at = NOW(),
            season = COALESCE(p_season, exercise_records.season);

        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- HELPER FUNCTION: Get user's exercise records
-- ============================================

CREATE OR REPLACE FUNCTION get_user_exercise_records(
    p_user_id UUID,
    p_exercise_id UUID
) RETURNS TABLE (
    record_value INTEGER,
    play_mode TEXT,
    partner_id UUID,
    partner_name TEXT,
    achieved_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        er.record_value,
        er.play_mode,
        er.partner_id,
        CASE
            WHEN er.partner_id IS NOT NULL THEN p.first_name || ' ' || p.last_name
            ELSE NULL
        END as partner_name,
        er.achieved_at
    FROM exercise_records er
    LEFT JOIN profiles p ON er.partner_id = p.id
    WHERE er.user_id = p_user_id
      AND er.exercise_id = p_exercise_id
    ORDER BY er.record_value DESC;
END;
$$ LANGUAGE plpgsql;
