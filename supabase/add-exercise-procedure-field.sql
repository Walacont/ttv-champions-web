-- Add procedure field to exercises table for step-by-step instructions
-- Also fix exercise_milestones column naming

-- Add procedure field (JSONB array of steps)
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS procedure JSONB;

-- Fix exercise_milestones table - rename completion_count to current_count for consistency with code
-- Check if column exists before renaming
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'exercise_milestones'
        AND column_name = 'completion_count'
    ) THEN
        ALTER TABLE exercise_milestones
        RENAME COLUMN completion_count TO current_count;
    END IF;
END $$;

-- Also ensure completed_exercises has the right structure for personal records
-- Add current_count column if it doesn't exist (for tracking total completions)
ALTER TABLE completed_exercises
ADD COLUMN IF NOT EXISTS current_count INTEGER DEFAULT 1;

COMMENT ON COLUMN exercises.procedure IS 'Step-by-step instructions as JSONB array, e.g. [{"step": 1, "text": "Partner spielt RH-Schupf diagonal"}, ...]';
COMMENT ON COLUMN exercise_milestones.current_count IS 'Total number of times the user has completed this exercise';
COMMENT ON COLUMN completed_exercises.current_count IS 'Total number of completions for this exercise in this season';
