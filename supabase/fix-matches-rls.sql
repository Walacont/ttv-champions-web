-- Fix RLS policy for matches table
-- Currently too restrictive - only allows seeing matches from own club
-- Should also allow seeing matches where user is a player

DROP POLICY IF EXISTS matches_select ON matches;
CREATE POLICY matches_select ON matches FOR SELECT
    USING (
        -- Same club matches
        club_id IN (SELECT club_id FROM profiles WHERE id = (SELECT auth.uid()))
        -- OR matches where user is player A
        OR player_a_id = (SELECT auth.uid())
        -- OR matches where user is player B
        OR player_b_id = (SELECT auth.uid())
        -- OR matches where user is winner
        OR winner_id = (SELECT auth.uid())
        -- OR matches where user is loser
        OR loser_id = (SELECT auth.uid())
        -- OR cross-club matches (club_id is NULL)
        OR club_id IS NULL
    );

-- Verify the policy
SELECT
    polname as policy_name,
    polcmd as command,
    pg_get_expr(polqual, polrelid) as using_expression
FROM pg_policy
WHERE polrelid = 'matches'::regclass;
