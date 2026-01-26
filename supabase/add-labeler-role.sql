-- ============================================
-- Add labeler role to user_role ENUM
-- ============================================
-- Run this in Supabase SQL Editor

-- Add 'labeler' to the user_role enum type
-- This role is for team members who label videos for ML training
-- labeler can only access the /label.html page

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'labeler';

-- Verify the change
SELECT enum_range(NULL::user_role);

-- Note: To create a labeler account:
-- 1. User registers normally
-- 2. Run: UPDATE profiles SET role = 'labeler' WHERE email = 'team-member@example.com';
--    Or:  UPDATE profiles SET role = 'labeler' WHERE id = 'user-uuid-here';
