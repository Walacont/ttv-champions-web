-- Migration 007: Fix tournament_participants RLS policy
-- Issue: Policy fails with 406 error when auth.uid() is null or when checking club membership

-- Drop and recreate the view policy for tournament participants
DROP POLICY IF EXISTS "Users can view tournament participants" ON tournament_participants;

CREATE POLICY "Users can view tournament participants"
ON tournament_participants FOR SELECT
USING (
    -- Can view participants if the tournament is visible
    tournament_id IN (
        SELECT id FROM tournaments t
        WHERE
            -- Global tournaments are always visible
            t.is_club_only = false
            OR
            -- Club-only tournaments are visible to club members
            (
                t.is_club_only = true
                AND auth.uid() IS NOT NULL
                AND t.club_id IN (
                    SELECT club_id FROM profiles WHERE id = auth.uid()
                )
            )
    )
);

COMMENT ON POLICY "Users can view tournament participants" ON tournament_participants
IS 'Fixed: Handles NULL auth.uid() gracefully - global tournament participants always visible';
