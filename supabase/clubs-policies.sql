-- ============================================
-- RLS Policies for clubs table
-- ============================================
-- Run this in Supabase SQL Editor

-- Enable RLS on clubs table (if not already enabled)
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read clubs
CREATE POLICY "clubs_select_all" ON clubs
    FOR SELECT
    USING (true);

-- Allow admins to insert new clubs
CREATE POLICY "clubs_insert_admin" ON clubs
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Allow admins to update clubs
CREATE POLICY "clubs_update_admin" ON clubs
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Allow admins to delete clubs
CREATE POLICY "clubs_delete_admin" ON clubs
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Also allow coaches to read their own club
CREATE POLICY "clubs_select_coach" ON clubs
    FOR SELECT
    USING (
        id IN (
            SELECT club_id FROM profiles
            WHERE profiles.id = auth.uid()
        )
    );
