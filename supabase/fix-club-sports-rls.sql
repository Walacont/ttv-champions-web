-- ============================================
-- FIX CLUB_SPORTS RLS POLICIES
-- ============================================
-- Allow admins to manage club_sports entries

-- Drop existing policies if any
DROP POLICY IF EXISTS club_sports_admin_insert ON club_sports;
DROP POLICY IF EXISTS club_sports_admin_all ON club_sports;

-- Allow admins to insert club_sports
CREATE POLICY club_sports_admin_insert ON club_sports FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Allow admins to update club_sports
DROP POLICY IF EXISTS club_sports_admin_update ON club_sports;
CREATE POLICY club_sports_admin_update ON club_sports FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Allow admins to delete club_sports
DROP POLICY IF EXISTS club_sports_admin_delete ON club_sports;
CREATE POLICY club_sports_admin_delete ON club_sports FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );
