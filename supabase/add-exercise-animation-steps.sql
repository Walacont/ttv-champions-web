-- Migration: Add animation_steps field to exercises table
-- This allows storing table tennis exercise animations with exercises

-- Add animation_steps column (JSONB to store array of animation steps)
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS animation_steps JSONB DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN exercises.animation_steps IS 'Optional array of animation steps for table tennis exercises. Each step contains: player (A/B), strokeType, side (VH/RH), fromPosition, toPosition, isShort, variants, repetitions, playerDecides';

-- Example structure of animation_steps:
-- {
--   "steps": [
--     {
--       "player": "A",
--       "strokeType": "A",
--       "side": "RH",
--       "fromPosition": "RH",
--       "toPosition": "RH",
--       "isShort": true,
--       "variants": [{"condition": "lang", "side": "VH", "strokeType": "T", "toPosition": "RH"}],
--       "repetitions": {"min": 3, "max": 8},
--       "playerDecides": false
--     }
--   ]
-- }
