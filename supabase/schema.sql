-- SC Champions - Supabase PostgreSQL Schema
-- Migration von Firebase Firestore
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE user_role AS ENUM ('player', 'coach', 'admin');
CREATE TYPE request_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE match_request_status AS ENUM ('pending_player', 'pending_coach', 'approved', 'rejected');
CREATE TYPE match_proposal_status AS ENUM ('pending', 'accepted', 'declined', 'counter_proposed', 'cancelled');
CREATE TYPE doubles_request_status AS ENUM ('pending_opponent', 'pending_coach', 'approved', 'rejected');

-- ============================================
-- SPORTS (NEU für Multi-Sport!)
-- ============================================

CREATE TABLE sports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    icon TEXT, -- FontAwesome icon name
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Standard-Sportarten einfügen
INSERT INTO sports (name, display_name, icon) VALUES
    ('table_tennis', 'Tischtennis', 'fa-table-tennis-paddle-ball'),
    ('badminton', 'Badminton', 'fa-shuttlecock'),
    ('tennis', 'Tennis', 'fa-tennis-ball'),
    ('padel', 'Padel', 'fa-racquet');

-- ============================================
-- CLUBS
-- ============================================

CREATE TABLE clubs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Welche Sportarten ein Club anbietet
CREATE TABLE club_sports (
    club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
    sport_id UUID REFERENCES sports(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    PRIMARY KEY (club_id, sport_id)
);

-- ============================================
-- USERS (profiles) - 1:1 Firebase Struktur
-- ============================================

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Basis-Daten (Firebase: users collection)
    email TEXT,
    first_name TEXT,
    last_name TEXT,
    display_name TEXT,
    birthdate TEXT,  -- Firebase speichert als String "2001-12-09"
    gender TEXT,
    age_group TEXT,
    avatar_url TEXT,  -- Firebase: photoURL
    role user_role DEFAULT 'player',
    club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,

    -- Stats
    xp INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,
    elo_rating INTEGER DEFAULT 800,
    highest_elo INTEGER DEFAULT 800,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    league TEXT,  -- "Diamond", "Gold", etc.

    -- Doubles Stats
    doubles_elo_rating INTEGER DEFAULT 800,
    highest_doubles_elo INTEGER DEFAULT 800,
    doubles_matches_played INTEGER DEFAULT 0,
    doubles_matches_won INTEGER DEFAULT 0,
    doubles_matches_lost INTEGER DEFAULT 0,

    -- Tischtennis-spezifisch
    qttr_points INTEGER,

    -- Status Flags
    is_offline BOOLEAN DEFAULT false,
    onboarding_complete BOOLEAN DEFAULT false,

    -- Push Notifications (Firebase: fcmToken)
    fcm_token TEXT,
    fcm_token_updated_at TIMESTAMPTZ,
    notifications_enabled BOOLEAN DEFAULT true,
    notification_preferences JSONB DEFAULT '{"challengeAvailable": true, "matchApproved": true, "matchRequest": true, "matchSuggestion": false, "rankUp": true, "trainingReminder": true}',
    notification_preferences_updated_at TIMESTAMPTZ,

    -- Leaderboard & Privacy
    leaderboard_preferences JSONB DEFAULT '{"effort": true, "season": true, "skill": true, "ranks": true, "doubles": true}',
    privacy_settings JSONB DEFAULT '{"searchable": true, "showElo": true}',

    -- Season Tracking
    last_season_reset TIMESTAMPTZ,
    last_xp_update TIMESTAMPTZ,

    -- Subgroups (Firebase: subgroupIDs array)
    subgroup_ids TEXT[],  -- Array von Subgroup-IDs

    -- Migration Tracking
    migrated_at TIMESTAMPTZ,
    migrated_from TEXT,  -- Original Firebase Doc ID

    -- Club Request (wenn pending)
    club_request_status request_status,
    club_request_id UUID,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SUBGROUPS (Trainingsgruppen)
-- ============================================

CREATE TABLE subgroups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    sport_id UUID REFERENCES sports(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    training_days JSONB, -- ["monday", "wednesday"]
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spieler zu Subgroups zuordnen
CREATE TABLE subgroup_members (
    subgroup_id UUID REFERENCES subgroups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    PRIMARY KEY (subgroup_id, user_id)
);

-- ============================================
-- CLUB REQUESTS (Beitrittsanfragen)
-- ============================================

CREATE TABLE club_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    status request_status DEFAULT 'pending',
    message TEXT,
    reviewed_by UUID REFERENCES profiles(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- LEAVE CLUB REQUESTS (Austrittsanfragen)
-- ============================================

CREATE TABLE leave_club_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    status request_status DEFAULT 'pending',
    reason TEXT,
    reviewed_by UUID REFERENCES profiles(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TRAINING SESSIONS
-- ============================================

CREATE TABLE training_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    subgroup_id UUID REFERENCES subgroups(id) ON DELETE SET NULL,
    sport_id UUID REFERENCES sports(id) ON DELETE SET NULL,
    title TEXT,
    date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ATTENDANCE (Anwesenheit)
-- ============================================

CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    session_id UUID REFERENCES training_sessions(id) ON DELETE CASCADE,
    subgroup_id UUID REFERENCES subgroups(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    present BOOLEAN DEFAULT true,
    xp_awarded INTEGER DEFAULT 0,
    notes TEXT,
    recorded_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, date, subgroup_id)
);

-- ============================================
-- MATCHES (Einzelmatches)
-- ============================================

CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    sport_id UUID REFERENCES sports(id) ON DELETE SET NULL,

    player_a_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    player_b_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    winner_id UUID REFERENCES profiles(id),
    loser_id UUID REFERENCES profiles(id),

    -- Ergebnis
    sets JSONB, -- [{"playerA": 11, "playerB": 9}, ...]
    player_a_sets_won INTEGER DEFAULT 0,
    player_b_sets_won INTEGER DEFAULT 0,

    -- Elo-Änderungen
    elo_change INTEGER,
    player_a_elo_before INTEGER,
    player_b_elo_before INTEGER,
    player_a_elo_after INTEGER,
    player_b_elo_after INTEGER,

    played_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MATCH REQUESTS (Spieler-initiierte Matches)
-- ============================================

CREATE TABLE match_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
    sport_id UUID REFERENCES sports(id) ON DELETE SET NULL,

    player_a_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    player_b_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    winner_id UUID REFERENCES profiles(id),
    loser_id UUID REFERENCES profiles(id),

    sets JSONB,
    status match_request_status DEFAULT 'pending_player',

    -- Approvals tracking
    approvals JSONB DEFAULT '{}',

    is_cross_club BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MATCH PROPOSALS (Zukünftige Match-Planung)
-- ============================================

CREATE TABLE match_proposals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    sport_id UUID REFERENCES sports(id) ON DELETE SET NULL,

    requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    proposed_date DATE,
    proposed_time TIME,
    message TEXT,

    status match_proposal_status DEFAULT 'pending',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DOUBLES MATCHES (Doppelmatches)
-- ============================================

CREATE TABLE doubles_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
    sport_id UUID REFERENCES sports(id) ON DELETE SET NULL,

    -- Team A
    team_a_player1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    team_a_player2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Team B
    team_b_player1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    team_b_player2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Ergebnis
    winning_team TEXT CHECK (winning_team IN ('A', 'B')),
    sets JSONB,
    team_a_sets_won INTEGER DEFAULT 0,
    team_b_sets_won INTEGER DEFAULT 0,

    is_cross_club BOOLEAN DEFAULT false,
    played_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DOUBLES MATCH REQUESTS
-- ============================================

CREATE TABLE doubles_match_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
    sport_id UUID REFERENCES sports(id) ON DELETE SET NULL,

    initiated_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Teams als JSONB (flexibler)
    team_a JSONB NOT NULL, -- {"player1_id": "...", "player2_id": "..."}
    team_b JSONB NOT NULL,

    sets JSONB,
    winning_team TEXT CHECK (winning_team IN ('A', 'B')),
    match_mode TEXT DEFAULT 'best-of-5',
    handicap_used BOOLEAN DEFAULT false,
    handicap JSONB,

    status doubles_request_status DEFAULT 'pending_opponent',
    approvals JSONB DEFAULT '{}',

    is_cross_club BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DOUBLES PAIRINGS (Doppel-Paarungen Statistiken)
-- ============================================

CREATE TABLE doubles_pairings (
    id TEXT PRIMARY KEY, -- Pairing ID format: "player1_player2" (sorted UUIDs)
    player1_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    player2_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    player1_name TEXT,
    player2_name TEXT,
    player1_club_id_at_match UUID REFERENCES clubs(id) ON DELETE SET NULL,
    player2_club_id_at_match UUID REFERENCES clubs(id) ON DELETE SET NULL,

    club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,

    matches_played INTEGER DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    matches_lost INTEGER DEFAULT 0,
    win_rate REAL DEFAULT 0.0,
    current_elo_rating INTEGER DEFAULT 800,

    last_played TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by player
CREATE INDEX idx_doubles_pairings_player1 ON doubles_pairings(player1_id);
CREATE INDEX idx_doubles_pairings_player2 ON doubles_pairings(player2_id);
CREATE INDEX idx_doubles_pairings_club ON doubles_pairings(club_id);
CREATE INDEX idx_doubles_pairings_wins ON doubles_pairings(matches_won DESC);

-- ============================================
-- CHALLENGES (Tägliche Challenges)
-- ============================================

CREATE TABLE challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    sport_id UUID REFERENCES sports(id) ON DELETE SET NULL,
    subgroup_id UUID REFERENCES subgroups(id) ON DELETE SET NULL,

    title TEXT NOT NULL,
    description TEXT,
    xp_reward INTEGER DEFAULT 10,

    date DATE NOT NULL,
    is_active BOOLEAN DEFAULT true,

    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- EXERCISES (Übungen - Global)
-- ============================================

CREATE TABLE exercises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sport_id UUID REFERENCES sports(id) ON DELETE SET NULL,

    name TEXT NOT NULL,
    description TEXT,
    category TEXT, -- "grundlagen", "advanced", etc.
    difficulty INTEGER DEFAULT 1,
    xp_reward INTEGER DEFAULT 10,

    -- Rekordhalter
    record_count INTEGER,
    record_holder_id UUID REFERENCES profiles(id),
    record_holder_name TEXT,
    record_holder_club TEXT,
    record_holder_club_id UUID REFERENCES clubs(id),
    record_updated_at TIMESTAMPTZ,

    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- USER HISTORY TABLES (ersetzt Subcollections)
-- ============================================

-- Points History
CREATE TABLE points_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    reason TEXT,
    awarded_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- XP History
CREATE TABLE xp_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    xp INTEGER NOT NULL,
    reason TEXT,
    source TEXT, -- 'attendance', 'challenge', 'exercise', etc.
    awarded_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Streaks (pro Subgroup)
CREATE TABLE streaks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    subgroup_id UUID NOT NULL REFERENCES subgroups(id) ON DELETE CASCADE,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_attendance_date DATE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, subgroup_id)
);

-- Completed Challenges
CREATE TABLE completed_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, challenge_id)
);

-- Completed Exercises
CREATE TABLE completed_exercises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    count INTEGER DEFAULT 1, -- Wie oft absolviert
    best_score INTEGER, -- Falls Rekord relevant
    season TEXT, -- z.B. "2024-Q1"
    completed_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, exercise_id, season)
);

-- Exercise Milestones
CREATE TABLE exercise_milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    completion_count INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, exercise_id)
);

-- ============================================
-- INVITATION CODES
-- ============================================

CREATE TABLE invitation_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE,
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    subgroup_id UUID REFERENCES subgroups(id) ON DELETE SET NULL,

    max_uses INTEGER,
    use_count INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,

    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CONFIG (System-Konfiguration)
-- ============================================

CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Season config einfügen
INSERT INTO config (key, value) VALUES
    ('current_season', '{"name": "2024-Q4", "start": "2024-10-01", "end": "2024-12-31"}'),
    ('season_reset', '{"lastResetDate": "2024-11-13T00:00:00.000Z"}');

-- ============================================
-- INDEXES für Performance
-- ============================================

CREATE INDEX idx_profiles_club ON profiles(club_id);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_matches_club ON matches(club_id);
CREATE INDEX idx_matches_players ON matches(player_a_id, player_b_id);
CREATE INDEX idx_matches_sport ON matches(sport_id);
CREATE INDEX idx_attendance_user_date ON attendance(user_id, date);
CREATE INDEX idx_attendance_club_date ON attendance(club_id, date);
CREATE INDEX idx_training_sessions_club_date ON training_sessions(club_id, date);
CREATE INDEX idx_challenges_club_date ON challenges(club_id, date);
CREATE INDEX idx_xp_history_user ON xp_history(user_id);
CREATE INDEX idx_points_history_user ON points_history(user_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_clubs_updated_at BEFORE UPDATE ON clubs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_sports_updated_at BEFORE UPDATE ON sports FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_subgroups_updated_at BEFORE UPDATE ON subgroups FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_matches_updated_at BEFORE UPDATE ON matches FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_exercises_updated_at BEFORE UPDATE ON exercises FOR EACH ROW EXECUTE FUNCTION update_updated_at();
