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

-- ============================================
-- RLS Policies for invitation_codes table
-- ============================================

-- Enable RLS on invitation_codes table
ALTER TABLE invitation_codes ENABLE ROW LEVEL SECURITY;

-- Allow admins to do everything with invitation codes
CREATE POLICY "invitation_codes_admin_all" ON invitation_codes
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Allow coaches to create codes for their own club
CREATE POLICY "invitation_codes_coach_insert" ON invitation_codes
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'coach'
            AND profiles.club_id = club_id
        )
    );

-- Allow coaches to read codes for their own club
CREATE POLICY "invitation_codes_coach_select" ON invitation_codes
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'coach'
            AND profiles.club_id = invitation_codes.club_id
        )
    );

-- Allow anyone to read a code by its code value (for validation during registration)
CREATE POLICY "invitation_codes_public_select_by_code" ON invitation_codes
    FOR SELECT
    USING (true);
