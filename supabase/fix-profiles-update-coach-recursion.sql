-- ============================================
-- FIX PROFILES UPDATE COACH POLICY RECURSION
-- ============================================
-- The profiles_update_coach policy causes infinite recursion by querying profiles within profiles policy
-- This fix uses SECURITY DEFINER functions to avoid recursion

-- Drop the problematic policy
DROP POLICY IF EXISTS profiles_update_coach ON profiles;

-- Create helper function to check if user is a coach/head_coach/admin
CREATE OR REPLACE FUNCTION public.is_coach_or_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('coach', 'head_coach', 'admin')
  );
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_coach_or_admin() TO authenticated;

-- Create new policy using helper functions
-- Coaches/head_coaches/admins can update profiles in their club
CREATE POLICY profiles_update_coach ON profiles FOR UPDATE
    USING (
        -- User can update if they are coach/head_coach/admin in the same club
        (public.is_coach_or_admin() AND club_id = public.get_my_club_id())
        OR
        -- Or if it's their own profile
        id = auth.uid()
    )
    WITH CHECK (
        -- Same check for WITH CHECK
        (public.is_coach_or_admin() AND club_id = public.get_my_club_id())
        OR
        id = auth.uid()
    );

-- Note: This policy works together with profiles_update_own from fix-profiles-rls-recursion.sql
-- If both policies exist, either one allowing the update will permit it (policies are OR'd together)
