-- ============================================
-- FIX PROFILES RLS FOR COACH ACCESS
-- ============================================
-- Allow coaches to see profiles of players in their club/sport via profile_club_sports

-- Drop existing policy
DROP POLICY IF EXISTS profiles_select ON profiles;

-- Create helper function to check if user is a coach who can see this profile
CREATE OR REPLACE FUNCTION public.can_coach_see_profile(profile_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  -- Check if the current user is a coach/head_coach and the profile is in their club/sport
  SELECT EXISTS (
    SELECT 1
    FROM profile_club_sports pcs_coach
    INNER JOIN profile_club_sports pcs_player
      ON pcs_coach.club_id = pcs_player.club_id
      AND pcs_coach.sport_id = pcs_player.sport_id
    WHERE pcs_coach.user_id = auth.uid()
      AND pcs_coach.role IN ('coach', 'head_coach')
      AND pcs_player.user_id = profile_id
  );
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.can_coach_see_profile(uuid) TO authenticated;

-- Create new comprehensive policy
-- Users can see:
-- 1. Their own profile
-- 2. Profiles in the same club (via club_id in profiles table)
-- 3. Profiles they coach (via profile_club_sports)
-- 4. All profiles if they are admin
CREATE POLICY profiles_select ON profiles FOR SELECT
    USING (
        public.is_admin() OR
        id = auth.uid() OR
        (club_id IS NOT NULL AND club_id = public.get_my_club_id()) OR
        public.can_coach_see_profile(id)
    );
