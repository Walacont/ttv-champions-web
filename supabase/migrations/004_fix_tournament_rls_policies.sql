-- ============================================
-- FIX TOURNAMENT RLS POLICIES - Migration 004
-- Drop and recreate policies with correct role field
-- ============================================

-- Drop all existing tournament policies
DROP POLICY IF EXISTS "Users can view tournaments" ON tournaments;
DROP POLICY IF EXISTS "Users can create tournaments" ON tournaments;
DROP POLICY IF EXISTS "Tournament creators and coaches can update" ON tournaments;
DROP POLICY IF EXISTS "Tournament creators and coaches can delete" ON tournaments;

DROP POLICY IF EXISTS "Users can view tournament participants" ON tournament_participants;
DROP POLICY IF EXISTS "Users can join tournaments" ON tournament_participants;
DROP POLICY IF EXISTS "Users can leave tournaments" ON tournament_participants;

DROP POLICY IF EXISTS "Users can view tournament matches" ON tournament_matches;
DROP POLICY IF EXISTS "System can create tournament matches" ON tournament_matches;
DROP POLICY IF EXISTS "System can update tournament matches" ON tournament_matches;

DROP POLICY IF EXISTS "Users can view tournament standings" ON tournament_standings;
DROP POLICY IF EXISTS "System can create tournament standings" ON tournament_standings;
DROP POLICY IF EXISTS "System can update tournament standings" ON tournament_standings;

-- ============================================
-- RECREATE CORRECT POLICIES
-- ============================================

-- Policy: Users can view tournaments
CREATE POLICY "Users can view tournaments"
ON tournaments FOR SELECT
USING (
    (is_club_only = false)
    OR
    (is_club_only = true AND club_id IN (
        SELECT club_id FROM profiles WHERE id = auth.uid()
    ))
);

-- Policy: Users can create tournaments
CREATE POLICY "Users can create tournaments"
ON tournaments FOR INSERT
WITH CHECK (
    club_id IN (
        SELECT club_id FROM profiles WHERE id = auth.uid()
    )
);

-- Policy: Tournament creator and club coaches can update
CREATE POLICY "Tournament creators and coaches can update"
ON tournaments FOR UPDATE
USING (
    created_by = auth.uid()
    OR
    (club_id IN (
        SELECT club_id FROM profiles
        WHERE id = auth.uid() AND role = 'coach'
    ))
);

-- Policy: Tournament creator and club coaches can delete
CREATE POLICY "Tournament creators and coaches can delete"
ON tournaments FOR DELETE
USING (
    created_by = auth.uid()
    OR
    (club_id IN (
        SELECT club_id FROM profiles
        WHERE id = auth.uid() AND role = 'coach'
    ))
);

-- ============================================
-- TOURNAMENT PARTICIPANTS
-- ============================================

CREATE POLICY "Users can view tournament participants"
ON tournament_participants FOR SELECT
USING (
    tournament_id IN (
        SELECT id FROM tournaments
        WHERE (is_club_only = false)
        OR (is_club_only = true AND club_id IN (
            SELECT club_id FROM profiles WHERE id = auth.uid()
        ))
    )
);

CREATE POLICY "Users can join tournaments"
ON tournament_participants FOR INSERT
WITH CHECK (
    player_id = auth.uid()
    AND
    tournament_id IN (
        SELECT id FROM tournaments
        WHERE status = 'registration'
        AND (
            (is_club_only = false)
            OR
            (is_club_only = true AND club_id IN (
                SELECT club_id FROM profiles WHERE id = auth.uid()
            ))
        )
    )
);

CREATE POLICY "Users can leave tournaments"
ON tournament_participants FOR DELETE
USING (
    player_id = auth.uid()
    AND
    tournament_id IN (
        SELECT id FROM tournaments WHERE status = 'registration'
    )
);

-- ============================================
-- TOURNAMENT MATCHES
-- ============================================

CREATE POLICY "Users can view tournament matches"
ON tournament_matches FOR SELECT
USING (
    tournament_id IN (
        SELECT id FROM tournaments
        WHERE (is_club_only = false)
        OR (is_club_only = true AND club_id IN (
            SELECT club_id FROM profiles WHERE id = auth.uid()
        ))
    )
);

CREATE POLICY "System can create tournament matches"
ON tournament_matches FOR INSERT
WITH CHECK (
    tournament_id IN (
        SELECT id FROM tournaments
        WHERE created_by = auth.uid() OR club_id IN (
            SELECT club_id FROM profiles WHERE id = auth.uid() AND role = 'coach'
        )
    )
);

CREATE POLICY "System can update tournament matches"
ON tournament_matches FOR UPDATE
USING (
    tournament_id IN (
        SELECT id FROM tournaments
        WHERE (is_club_only = false)
        OR (is_club_only = true AND club_id IN (
            SELECT club_id FROM profiles WHERE id = auth.uid()
        ))
    )
);

-- ============================================
-- TOURNAMENT STANDINGS
-- ============================================

CREATE POLICY "Users can view tournament standings"
ON tournament_standings FOR SELECT
USING (
    tournament_id IN (
        SELECT id FROM tournaments
        WHERE (is_club_only = false)
        OR (is_club_only = true AND club_id IN (
            SELECT club_id FROM profiles WHERE id = auth.uid()
        ))
    )
);

CREATE POLICY "System can create tournament standings"
ON tournament_standings FOR INSERT
WITH CHECK (
    tournament_id IN (
        SELECT id FROM tournaments
    )
);

CREATE POLICY "System can update tournament standings"
ON tournament_standings FOR UPDATE
USING (
    tournament_id IN (
        SELECT id FROM tournaments
    )
);
