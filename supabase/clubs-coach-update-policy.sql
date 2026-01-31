-- ============================================
-- RLS Policy: Allow coaches/head_coaches to update their own club
-- ============================================
-- Run this in Supabase SQL Editor

-- Allow coaches and head_coaches to update their own club
CREATE POLICY "clubs_update_coach" ON clubs
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('coach', 'head_coach')
            AND profiles.club_id = clubs.id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('coach', 'head_coach')
            AND profiles.club_id = clubs.id
        )
    );
