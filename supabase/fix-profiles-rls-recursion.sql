-- ============================================
-- FIX PROFILES RLS INFINITE RECURSION
-- ============================================
-- The previous policy caused infinite recursion by querying profiles within profiles policy

-- Drop the problematic policy
DROP POLICY IF EXISTS profiles_select ON profiles;

-- Create a helper function to get user's club_id (SECURITY DEFINER avoids recursion)
CREATE OR REPLACE FUNCTION public.get_my_club_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT club_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Create a helper function to check if user is admin (SECURITY DEFINER avoids recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_club_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Create new policy using the helper functions
-- Admins can see all profiles, others can see own profile and profiles in same club
CREATE POLICY profiles_select ON profiles FOR SELECT
    USING (
        public.is_admin() OR
        id = auth.uid() OR
        (club_id IS NOT NULL AND club_id = public.get_my_club_id())
    );

-- Ensure update policy exists and is correct
DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- Drop duplicate policy if exists
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
