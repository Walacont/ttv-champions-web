-- ============================================
-- TOURNAMENT VISIBILITY & RLS - Migration 003
-- Add visibility controls and Row Level Security
-- ============================================

-- Add is_club_only field to tournaments table
ALTER TABLE tournaments
ADD COLUMN is_club_only BOOLEAN DEFAULT false;

COMMENT ON COLUMN tournaments.is_club_only IS 'true = nur Vereinsmitglieder können sehen/beitreten, false = global sichtbar';

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on tournaments table
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view tournaments
-- - Global tournaments (is_club_only = false): everyone can see
-- - Club-only tournaments: only club members can see
CREATE POLICY "Users can view tournaments"
ON tournaments FOR SELECT
USING (
    -- Global tournaments are visible to all authenticated users
    (is_club_only = false)
    OR
    -- Club-only tournaments are visible to club members
    (is_club_only = true AND club_id IN (
        SELECT club_id FROM profiles WHERE id = auth.uid()
    ))
);

-- Policy: Users can create tournaments in their club
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
        WHERE id = auth.uid() AND is_coach = true
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
        WHERE id = auth.uid() AND is_coach = true
    ))
);

-- ============================================
-- TOURNAMENT PARTICIPANTS RLS
-- ============================================

-- Enable RLS on tournament_participants
ALTER TABLE tournament_participants ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view participants if they can view the tournament
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

-- Policy: Users can join tournaments
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

-- Policy: Users can leave tournaments (delete their own participation)
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
-- TOURNAMENT MATCHES RLS
-- ============================================

-- Enable RLS on tournament_matches
ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view matches if they can view the tournament
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

-- Policy: System can create matches (tournament start)
CREATE POLICY "System can create tournament matches"
ON tournament_matches FOR INSERT
WITH CHECK (
    tournament_id IN (
        SELECT id FROM tournaments
        WHERE created_by = auth.uid() OR club_id IN (
            SELECT club_id FROM profiles WHERE id = auth.uid() AND is_coach = true
        )
    )
);

-- Policy: System can update match results
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
-- TOURNAMENT STANDINGS RLS
-- ============================================

-- Enable RLS on tournament_standings
ALTER TABLE tournament_standings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view standings if they can view the tournament
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

-- Policy: System can create standings
CREATE POLICY "System can create tournament standings"
ON tournament_standings FOR INSERT
WITH CHECK (
    tournament_id IN (
        SELECT id FROM tournaments
    )
);

-- Policy: System can update standings
CREATE POLICY "System can update tournament standings"
ON tournament_standings FOR UPDATE
USING (
    tournament_id IN (
        SELECT id FROM tournaments
    )
);
