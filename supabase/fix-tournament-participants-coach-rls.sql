-- ============================================
-- Fix: Add coach RLS policies for tournament_participants
--
-- Problem: Coaches get 403 when adding/removing/updating players
-- because INSERT requires player_id = auth.uid() (self-only),
-- DELETE requires player_id = auth.uid(), and no UPDATE policy exists.
-- ============================================

-- Drop existing policies that need to be replaced
DROP POLICY IF EXISTS "Users can join tournaments" ON tournament_participants;
DROP POLICY IF EXISTS "Users can leave tournaments" ON tournament_participants;

-- Coach-specific policies
DROP POLICY IF EXISTS "Coaches can add players to tournaments" ON tournament_participants;
DROP POLICY IF EXISTS "Coaches can update tournament participants" ON tournament_participants;
DROP POLICY IF EXISTS "Coaches can remove players from tournaments" ON tournament_participants;

-- ============================================
-- INSERT: Players can join themselves + Coaches can add players
-- ============================================

-- Players can still join tournaments themselves (original policy)
CREATE POLICY "Users can join tournaments" ON tournament_participants FOR INSERT
WITH CHECK (
    -- Self-registration: player joins their own tournament
    (
        player_id = auth.uid()
        AND tournament_id IN (
            SELECT id FROM tournaments
            WHERE status = 'registration'
            AND ((is_club_only = false) OR (is_club_only = true AND club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid())))
        )
    )
    OR
    -- Coach adds players from their club to their club's tournament
    (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('coach', 'head_coach')
            AND club_id IN (
                SELECT club_id FROM tournaments WHERE id = tournament_participants.tournament_id
            )
        )
    )
);

-- ============================================
-- UPDATE: Coaches and tournament creators can update participants
-- (seeds, match stats, final_rank, disqualification, etc.)
-- ============================================

CREATE POLICY "Coaches can update tournament participants" ON tournament_participants FOR UPDATE
USING (
    tournament_id IN (
        SELECT id FROM tournaments
        WHERE created_by = auth.uid()
        OR club_id IN (
            SELECT club_id FROM profiles
            WHERE id = auth.uid() AND role IN ('coach', 'head_coach')
        )
    )
);

-- ============================================
-- DELETE: Players can leave + Coaches can remove players
-- ============================================

-- Players can leave during registration (original behavior) + coaches can remove
CREATE POLICY "Users can leave tournaments" ON tournament_participants FOR DELETE
USING (
    -- Self-removal during registration
    (
        player_id = auth.uid()
        AND tournament_id IN (SELECT id FROM tournaments WHERE status = 'registration')
    )
    OR
    -- Coach removes players from their club's tournament
    (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('coach', 'head_coach')
            AND club_id IN (
                SELECT club_id FROM tournaments WHERE id = tournament_participants.tournament_id
            )
        )
    )
    OR
    -- Tournament creator can remove players
    (
        tournament_id IN (
            SELECT id FROM tournaments WHERE created_by = auth.uid()
        )
    )
);
