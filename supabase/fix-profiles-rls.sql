-- ============================================
-- FIX PROFILES RLS POLICY
-- ============================================
-- Allow users to always read their own profile, even without a club

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS profiles_select ON profiles;

-- Create new policy: Users can read own profile OR profiles in same club
CREATE POLICY profiles_select ON profiles FOR SELECT
    USING (
        id = auth.uid() OR
        club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid() AND club_id IS NOT NULL)
    );

-- Ensure update policy exists and is correct
DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Drop duplicate policy if exists
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
