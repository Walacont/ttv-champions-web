-- ============================================
-- Fix: Add foreign key from guardian_links.guardian_id to profiles.id
-- ============================================
-- Problem: The guardian_id in guardian_links references auth.users(id),
-- but Supabase's automatic join syntax requires a direct foreign key
-- to profiles for the query:
--   .select('guardian_id, is_primary, profiles!guardian_links_guardian_id_fkey(...)')
--
-- Since profiles.id = auth.users.id (profiles references auth.users),
-- we can safely add a secondary foreign key to profiles.
-- ============================================

-- Add the foreign key constraint from guardian_links.guardian_id to profiles.id
-- This allows Supabase to resolve the join in player-management queries
ALTER TABLE guardian_links
DROP CONSTRAINT IF EXISTS guardian_links_guardian_id_profiles_fkey;

ALTER TABLE guardian_links
ADD CONSTRAINT guardian_links_guardian_id_profiles_fkey
FOREIGN KEY (guardian_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Note: This does NOT remove the existing constraint to auth.users
-- Both constraints can coexist since profiles.id = auth.users.id
