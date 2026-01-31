-- ============================================
-- TOURNAMENT SYSTEM - Consolidated Migration
-- SC Champions - Turniere Feature
-- Includes all fixes from migrations 001-012
-- ============================================

-- ============================================
-- ENUM TYPES
-- ============================================

DO $$ BEGIN
    CREATE TYPE tournament_format AS ENUM (
        'round_robin',
        'pool_6',
        'pool_8',
        'groups_4',
        'knockout_16',
        'knockout_32',
        'double_elim_32',
        'groups_knockout_32',
        'groups_knockout_64',
        'doubles_team',
        'single_match'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE tournament_status AS ENUM (
        'draft', 'registration', 'in_progress', 'completed', 'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE tournament_match_status AS ENUM (
        'pending', 'in_progress', 'completed', 'walkover'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS tournaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    sport_id UUID NOT NULL REFERENCES sports(id) ON DELETE SET NULL,
    format tournament_format NOT NULL,
    max_participants INTEGER NOT NULL,
    is_open BOOLEAN DEFAULT true,
    is_club_only BOOLEAN DEFAULT false,
    join_code TEXT UNIQUE,
    with_handicap BOOLEAN DEFAULT false,
    is_live BOOLEAN DEFAULT false,
    match_deadline_days INTEGER DEFAULT 7,
    status tournament_status DEFAULT 'draft',
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    registration_deadline TIMESTAMPTZ,
    participant_count INTEGER DEFAULT 0,
    matches_total INTEGER DEFAULT 0,
    matches_completed INTEGER DEFAULT 0,
    winner_id UUID REFERENCES profiles(id),
    runner_up_id UUID REFERENCES profiles(id),
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tournament_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    seed INTEGER,
    elo_at_registration INTEGER,
    matches_played INTEGER DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    matches_lost INTEGER DEFAULT 0,
    sets_won INTEGER DEFAULT 0,
    sets_lost INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    final_rank INTEGER,
    is_active BOOLEAN DEFAULT true,
    disqualified_reason TEXT,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tournament_id, player_id)
);

CREATE TABLE IF NOT EXISTS tournament_rounds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    round_name TEXT,
    group_name TEXT,
    start_date TIMESTAMPTZ,
    deadline TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT false,
    is_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tournament_id, round_number, group_name)
);

CREATE TABLE IF NOT EXISTS tournament_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_id UUID REFERENCES tournament_rounds(id) ON DELETE SET NULL,
    match_number INTEGER,
    round_number INTEGER DEFAULT 1,
    player_a_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    player_b_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    scheduled_for TIMESTAMPTZ,
    deadline TIMESTAMPTZ,
    status tournament_match_status DEFAULT 'pending',
    winner_id UUID REFERENCES profiles(id),
    player_a_sets_won INTEGER DEFAULT 0,
    player_b_sets_won INTEGER DEFAULT 0,
    is_walkover BOOLEAN DEFAULT false,
    walkover_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tournament_standings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_id UUID REFERENCES tournament_rounds(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    matches_played INTEGER DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    matches_lost INTEGER DEFAULT 0,
    matches_drawn INTEGER DEFAULT 0,
    sets_won INTEGER DEFAULT 0,
    sets_lost INTEGER DEFAULT 0,
    sets_difference INTEGER DEFAULT 0,
    points_scored INTEGER DEFAULT 0,
    points_against INTEGER DEFAULT 0,
    points_difference INTEGER DEFAULT 0,
    tournament_points INTEGER DEFAULT 0,
    rank INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tournament_id, round_id, player_id)
);

-- tournament_match_id on match_requests
ALTER TABLE match_requests
ADD COLUMN IF NOT EXISTS tournament_match_id UUID REFERENCES tournament_matches(id) ON DELETE SET NULL;

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_tournaments_club ON tournaments(club_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_sport ON tournaments(sport_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_created_by ON tournaments(created_by);
CREATE INDEX IF NOT EXISTS idx_tournaments_join_code ON tournaments(join_code) WHERE join_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament ON tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_player ON tournament_participants(player_id);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_rank ON tournament_participants(tournament_id, final_rank);

CREATE INDEX IF NOT EXISTS idx_tournament_rounds_tournament ON tournament_rounds(tournament_id);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament ON tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(round_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_players ON tournament_matches(player_a_id, player_b_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_status ON tournament_matches(status);

CREATE INDEX IF NOT EXISTS idx_tournament_standings_tournament ON tournament_standings(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_standings_player ON tournament_standings(player_id);

CREATE INDEX IF NOT EXISTS idx_match_requests_tournament_match ON match_requests(tournament_match_id);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_tournament_participant_count()
RETURNS TRIGGER AS $fn$
BEGIN
    UPDATE tournaments
    SET participant_count = (
        SELECT COUNT(*)
        FROM tournament_participants
        WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)
    )
    WHERE id = COALESCE(NEW.tournament_id, OLD.tournament_id);
    RETURN COALESCE(NEW, OLD);
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tournament_participant_count_insert ON tournament_participants;
DROP TRIGGER IF EXISTS tournament_participant_count_delete ON tournament_participants;
DROP TRIGGER IF EXISTS update_tournament_participant_count ON tournament_participants;

CREATE TRIGGER tournament_participant_count_insert
AFTER INSERT ON tournament_participants
FOR EACH ROW EXECUTE FUNCTION update_tournament_participant_count();

CREATE TRIGGER tournament_participant_count_delete
AFTER DELETE ON tournament_participants
FOR EACH ROW EXECUTE FUNCTION update_tournament_participant_count();

CREATE OR REPLACE FUNCTION update_tournament_match_count()
RETURNS TRIGGER AS $fn$
BEGIN
    UPDATE tournaments
    SET
        matches_total = (
            SELECT COUNT(*) FROM tournament_matches
            WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)
        ),
        matches_completed = (
            SELECT COUNT(*) FROM tournament_matches
            WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)
            AND status = 'completed'
        )
    WHERE id = COALESCE(NEW.tournament_id, OLD.tournament_id);
    RETURN COALESCE(NEW, OLD);
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_tournament_match_counts ON tournament_matches;

CREATE TRIGGER update_tournament_match_counts
AFTER INSERT OR UPDATE OR DELETE ON tournament_matches
FOR EACH ROW EXECUTE FUNCTION update_tournament_match_count();

-- updated_at triggers
DO $fn$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
        DROP TRIGGER IF EXISTS update_tournaments_updated_at ON tournaments;
        CREATE TRIGGER update_tournaments_updated_at
            BEFORE UPDATE ON tournaments
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();

        DROP TRIGGER IF EXISTS update_tournament_standings_updated_at ON tournament_standings;
        CREATE TRIGGER update_tournament_standings_updated_at
            BEFORE UPDATE ON tournament_standings
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
END $fn$;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION generate_tournament_join_code()
RETURNS TEXT AS $fn$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$fn$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_rounds ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
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
DROP POLICY IF EXISTS "Creators can delete tournament matches" ON tournament_matches;

DROP POLICY IF EXISTS "Users can view tournament standings" ON tournament_standings;
DROP POLICY IF EXISTS "System can create tournament standings" ON tournament_standings;
DROP POLICY IF EXISTS "System can update tournament standings" ON tournament_standings;
DROP POLICY IF EXISTS "Creators can delete tournament standings" ON tournament_standings;

DROP POLICY IF EXISTS "Users can view tournament rounds" ON tournament_rounds;
DROP POLICY IF EXISTS "Coaches can manage tournament rounds" ON tournament_rounds;
DROP POLICY IF EXISTS "Tournament creators can manage rounds" ON tournament_rounds;

-- TOURNAMENTS
CREATE POLICY "Users can view tournaments" ON tournaments FOR SELECT
USING (
    (is_club_only = false)
    OR (is_club_only = true AND club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
);

CREATE POLICY "Users can create tournaments" ON tournaments FOR INSERT
WITH CHECK (club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Tournament creators and coaches can update" ON tournaments FOR UPDATE
USING (
    created_by = auth.uid()
    OR (club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach')))
);

CREATE POLICY "Tournament creators and coaches can delete" ON tournaments FOR DELETE
USING (
    created_by = auth.uid()
    OR (club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach')))
);

-- PARTICIPANTS (simple policy, no circular references)
CREATE POLICY "Users can view tournament participants" ON tournament_participants FOR SELECT
USING (
    tournament_id IN (
        SELECT id FROM tournaments t
        WHERE t.is_club_only = false
           OR (t.is_club_only = true AND auth.uid() IS NOT NULL
               AND t.club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
    )
);

CREATE POLICY "Users can join tournaments" ON tournament_participants FOR INSERT
WITH CHECK (
    player_id = auth.uid()
    AND tournament_id IN (
        SELECT id FROM tournaments
        WHERE status = 'registration'
        AND ((is_club_only = false) OR (is_club_only = true AND club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid())))
    )
);

CREATE POLICY "Users can leave tournaments" ON tournament_participants FOR DELETE
USING (player_id = auth.uid() AND tournament_id IN (SELECT id FROM tournaments WHERE status = 'registration'));

-- MATCHES
CREATE POLICY "Users can view tournament matches" ON tournament_matches FOR SELECT
USING (
    tournament_id IN (
        SELECT id FROM tournaments
        WHERE (is_club_only = false) OR (is_club_only = true AND club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
    )
);

CREATE POLICY "System can create tournament matches" ON tournament_matches FOR INSERT
WITH CHECK (
    tournament_id IN (
        SELECT id FROM tournaments
        WHERE created_by = auth.uid() OR club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach'))
    )
);

CREATE POLICY "System can update tournament matches" ON tournament_matches FOR UPDATE
USING (
    tournament_id IN (
        SELECT id FROM tournaments
        WHERE (is_club_only = false) OR (is_club_only = true AND club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
    )
);

CREATE POLICY "Creators can delete tournament matches" ON tournament_matches FOR DELETE
USING (
    tournament_id IN (
        SELECT id FROM tournaments
        WHERE created_by = auth.uid()
        OR club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach'))
    )
);

-- STANDINGS
CREATE POLICY "Users can view tournament standings" ON tournament_standings FOR SELECT
USING (
    tournament_id IN (
        SELECT id FROM tournaments
        WHERE (is_club_only = false) OR (is_club_only = true AND club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
    )
);

CREATE POLICY "System can create tournament standings" ON tournament_standings FOR INSERT
WITH CHECK (tournament_id IN (SELECT id FROM tournaments));

CREATE POLICY "System can update tournament standings" ON tournament_standings FOR UPDATE
USING (tournament_id IN (SELECT id FROM tournaments));

CREATE POLICY "Creators can delete tournament standings" ON tournament_standings FOR DELETE
USING (
    tournament_id IN (
        SELECT id FROM tournaments
        WHERE created_by = auth.uid()
        OR club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach'))
    )
);

-- ROUNDS
CREATE POLICY "Users can view tournament rounds" ON tournament_rounds FOR SELECT
USING (
    tournament_id IN (
        SELECT id FROM tournaments
        WHERE (is_club_only = false) OR (is_club_only = true AND club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid()))
    )
);

CREATE POLICY "Coaches can manage tournament rounds" ON tournament_rounds FOR ALL
USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('coach', 'head_coach')
    AND club_id IN (SELECT club_id FROM tournaments WHERE id = tournament_rounds.tournament_id)
))
WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('coach', 'head_coach')
    AND club_id IN (SELECT club_id FROM tournaments WHERE id = tournament_rounds.tournament_id)
));

CREATE POLICY "Tournament creators can manage rounds" ON tournament_rounds FOR ALL
USING (tournament_id IN (SELECT id FROM tournaments WHERE created_by = auth.uid()))
WITH CHECK (tournament_id IN (SELECT id FROM tournaments WHERE created_by = auth.uid()));
