-- Migration 010: Revert to simple working policy for tournament_participants
-- Issue: Migrations 008 and 009 created circular references causing 500 errors
-- Solution: Revert to the simple, working policy from migration 007

-- Drop the broken policy
DROP POLICY IF EXISTS "Users can view tournament participants" ON tournament_participants;

-- Recreate the SIMPLE working policy (no circular references)
CREATE POLICY "Users can view tournament participants"
ON tournament_participants FOR SELECT
USING (
    tournament_id IN (
        SELECT id FROM tournaments t
        WHERE
            -- Global tournaments (not club-only)
            t.is_club_only = false
            OR
            -- Club-only tournaments for club members
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
IS 'Simple policy: view participants if tournament is globally visible or user is in same club';
