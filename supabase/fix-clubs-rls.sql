-- ============================================
-- FIX CLUBS RLS POLICIES
-- ============================================
-- Add RLS policies for clubs table to allow admins to delete clubs

-- Enable RLS on clubs table if not already enabled
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS clubs_select ON clubs;
DROP POLICY IF EXISTS clubs_insert ON clubs;
DROP POLICY IF EXISTS clubs_update ON clubs;
DROP POLICY IF EXISTS clubs_delete ON clubs;

-- SELECT: Everyone can view all clubs
CREATE POLICY clubs_select ON clubs FOR SELECT
    USING (true);

-- INSERT: Only admins can create clubs
CREATE POLICY clubs_insert ON clubs FOR INSERT
    WITH CHECK (public.is_admin());

-- UPDATE: Only admins can update clubs
CREATE POLICY clubs_update ON clubs FOR UPDATE
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- DELETE: Only admins can delete clubs
CREATE POLICY clubs_delete ON clubs FOR DELETE
    USING (public.is_admin());
