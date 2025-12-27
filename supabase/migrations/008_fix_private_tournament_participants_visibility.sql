-- Migration 008: Fix tournament_participants visibility for private tournaments
-- Issue: Participants in private tournaments (is_open=false) cannot see other participants

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
    OR
    -- ALSO allow if the user is a participant in this tournament
    -- (even if it's a private/invitation-only tournament)
    (
        auth.uid() IS NOT NULL
        AND tournament_id IN (
            SELECT tournament_id
            FROM tournament_participants tp
            WHERE tp.player_id = auth.uid()
        )
    )
);

COMMENT ON POLICY "Users can view tournament participants" ON tournament_participants
IS 'Users can view participants if tournament is visible OR if they are a participant themselves';
