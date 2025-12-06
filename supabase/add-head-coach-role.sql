-- ============================================
-- Add head_coach role to user_role ENUM
-- ============================================
-- Run this in Supabase SQL Editor

-- Add 'head_coach' to the user_role enum type
-- This allows distinguishing between regular coaches and head coaches
-- head_coach has additional permissions like promoting/demoting coaches and deleting offline players

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'head_coach';

-- Verify the change
SELECT enum_range(NULL::user_role);

-- Note: To make an existing coach a head_coach, run:
-- UPDATE profiles SET role = 'head_coach' WHERE id = 'your-user-id';
