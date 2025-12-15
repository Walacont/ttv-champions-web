-- ============================================
-- FIX PROFILE_CLUB_SPORTS RLS POLICIES
-- ============================================
-- Allow users to insert their own club/sport membership during registration
-- (when using an invitation code)

-- Drop the old restrictive insert policy
DROP POLICY IF EXISTS "profile_club_sports_insert_policy" ON profile_club_sports;

-- Create new insert policy that also allows self-insert
CREATE POLICY "profile_club_sports_insert_policy" ON profile_club_sports
    FOR INSERT WITH CHECK (
        -- User kann sich selbst eintragen (für Registrierung mit Code)
        user_id = auth.uid()
        OR
        -- Admin kann alles
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
        OR
        -- Head_Coach kann für seinen Club/Sport
        EXISTS (
            SELECT 1 FROM profile_club_sports pcs
            WHERE pcs.user_id = auth.uid()
            AND pcs.club_id = profile_club_sports.club_id
            AND pcs.sport_id = profile_club_sports.sport_id
            AND pcs.role = 'head_coach'
        )
    );

-- Also fix club_sports insert for admins (from earlier issue)
DROP POLICY IF EXISTS club_sports_admin_insert ON club_sports;
CREATE POLICY club_sports_admin_insert ON club_sports FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS club_sports_admin_update ON club_sports;
CREATE POLICY club_sports_admin_update ON club_sports FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS club_sports_admin_delete ON club_sports;
CREATE POLICY club_sports_admin_delete ON club_sports FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );
