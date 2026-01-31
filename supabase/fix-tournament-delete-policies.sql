-- Fix: Add missing DELETE policies for tournament_matches and tournament_standings

-- Tournament matches: creators and coaches can delete
DROP POLICY IF EXISTS "Creators can delete tournament matches" ON tournament_matches;
CREATE POLICY "Creators can delete tournament matches" ON tournament_matches FOR DELETE
USING (
    tournament_id IN (
        SELECT id FROM tournaments
        WHERE created_by = auth.uid()
        OR club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach'))
    )
);

-- Tournament standings: creators and coaches can delete
DROP POLICY IF EXISTS "Creators can delete tournament standings" ON tournament_standings;
CREATE POLICY "Creators can delete tournament standings" ON tournament_standings FOR DELETE
USING (
    tournament_id IN (
        SELECT id FROM tournaments
        WHERE created_by = auth.uid()
        OR club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach'))
    )
);
