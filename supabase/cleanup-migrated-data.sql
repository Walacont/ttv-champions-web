-- Cleanup all migrated data to start fresh
-- Run this BEFORE running the migration again
-- WARNING: This deletes ALL data from these tables!

-- Disable triggers temporarily to avoid foreign key issues
SET session_replication_role = 'replica';

-- Delete in correct order (child tables first, then parent tables)

-- User subcollections
TRUNCATE TABLE points_history CASCADE;
TRUNCATE TABLE xp_history CASCADE;

-- Match related
TRUNCATE TABLE doubles_matches CASCADE;
TRUNCATE TABLE doubles_match_requests CASCADE;
TRUNCATE TABLE doubles_pairings CASCADE;
TRUNCATE TABLE matches CASCADE;
TRUNCATE TABLE match_requests CASCADE;

-- Training & Attendance
TRUNCATE TABLE attendance CASCADE;
TRUNCATE TABLE training_sessions CASCADE;

-- Other content
TRUNCATE TABLE challenges CASCADE;
TRUNCATE TABLE exercises CASCADE;
TRUNCATE TABLE invitation_codes CASCADE;
TRUNCATE TABLE notifications CASCADE;

-- Activity feed
TRUNCATE TABLE activity_feed CASCADE;

-- Subgroups (before profiles because of references)
TRUNCATE TABLE subgroups CASCADE;

-- Config
TRUNCATE TABLE config CASCADE;

-- Profiles
DELETE FROM profiles;

-- Clubs
TRUNCATE TABLE clubs CASCADE;

-- Delete auth users (run this separately in Supabase Dashboard > Authentication > Users)
-- Or use this (requires service_role key):
-- DELETE FROM auth.users WHERE id IN (SELECT id FROM auth.users WHERE email IS NOT NULL);

-- Re-enable triggers
SET session_replication_role = 'origin';

-- Verify cleanup
SELECT 'profiles' as table_name, COUNT(*) as count FROM profiles
UNION ALL SELECT 'clubs', COUNT(*) FROM clubs
UNION ALL SELECT 'matches', COUNT(*) FROM matches
UNION ALL SELECT 'doubles_matches', COUNT(*) FROM doubles_matches
UNION ALL SELECT 'attendance', COUNT(*) FROM attendance
UNION ALL SELECT 'training_sessions', COUNT(*) FROM training_sessions
UNION ALL SELECT 'points_history', COUNT(*) FROM points_history
UNION ALL SELECT 'xp_history', COUNT(*) FROM xp_history;
