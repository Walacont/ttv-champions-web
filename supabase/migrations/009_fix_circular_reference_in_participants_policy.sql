-- Migration 009: Fix circular reference in tournament_participants RLS policy
-- Issue: Migration 008 created a circular reference that broke tournament visibility

-- Drop the broken policy
DROP POLICY IF EXISTS "Users can view tournament participants" ON tournament_participants;

-- Recreate with correct logic (no circular reference)
CREATE POLICY "Users can view tournament participants"
ON tournament_participants FOR SELECT
USING (
    -- Can view participants if the tournament is visible to the user
    tournament_id IN (
        SELECT id FROM tournaments t
        WHERE
            -- Global tournaments (not club-only) are visible to everyone
            (t.is_club_only = false)
            OR
            -- Club-only tournaments are visible to club members
            (
                t.is_club_only = true
                AND auth.uid() IS NOT NULL
                AND t.club_id IN (
                    SELECT club_id FROM profiles WHERE id = auth.uid()
                )
            )
            OR
            -- Tournaments where the user is a participant are visible
            -- (allows participants in private tournaments to see other participants)
            (
                auth.uid() IS NOT NULL
                AND EXISTS (
                    SELECT 1 FROM tournament_participants tp_self
                    WHERE tp_self.tournament_id = t.id
                      AND tp_self.player_id = auth.uid()
                )
            )
    )
);

COMMENT ON POLICY "Users can view tournament participants" ON tournament_participants
IS 'Users can view participants if tournament is visible to them (including as participants)';
