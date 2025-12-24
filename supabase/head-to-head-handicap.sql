-- =========================================
-- Dynamic Head-to-Head Handicap System (v2)
-- =========================================
-- Tracks consecutive wins between player pairs
-- Suggests handicap when ANY player wins 2+ times in a row
-- (Not based on Elo - purely based on win streak)

-- =========================================
-- STEP 1: Drop old table and create new one
-- =========================================
DROP TABLE IF EXISTS head_to_head_stats CASCADE;

CREATE TABLE head_to_head_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Store players ordered by UUID for consistency
    player_a_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    player_b_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Who is currently on a winning streak (NULL if no streak >= 2)
    current_streak_winner_id UUID,

    -- Current consecutive wins by streak winner
    consecutive_wins INTEGER DEFAULT 0,

    -- Suggested handicap points (0-7) for the losing player
    suggested_handicap INTEGER DEFAULT 0,

    -- Total match stats
    player_a_wins INTEGER DEFAULT 0,
    player_b_wins INTEGER DEFAULT 0,
    total_matches INTEGER DEFAULT 0,

    -- Last winner (to track streaks)
    last_winner_id UUID,

    last_match_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure unique pair (order doesn't matter)
    UNIQUE(player_a_id, player_b_id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_h2h_players ON head_to_head_stats(player_a_id, player_b_id);
CREATE INDEX IF NOT EXISTS idx_h2h_player_a ON head_to_head_stats(player_a_id);
CREATE INDEX IF NOT EXISTS idx_h2h_player_b ON head_to_head_stats(player_b_id);

-- =========================================
-- STEP 2: Function to get/create h2h stats
-- =========================================
CREATE OR REPLACE FUNCTION get_or_create_h2h_stats(p1_id UUID, p2_id UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    h2h_id UUID;
    ordered_a UUID;
    ordered_b UUID;
BEGIN
    -- Always order by UUID to ensure consistency
    IF p1_id < p2_id THEN
        ordered_a := p1_id;
        ordered_b := p2_id;
    ELSE
        ordered_a := p2_id;
        ordered_b := p1_id;
    END IF;

    -- Try to find existing record
    SELECT id INTO h2h_id
    FROM head_to_head_stats
    WHERE (player_a_id = ordered_a AND player_b_id = ordered_b);

    -- Create if not exists
    IF h2h_id IS NULL THEN
        INSERT INTO head_to_head_stats (player_a_id, player_b_id)
        VALUES (ordered_a, ordered_b)
        RETURNING id INTO h2h_id;
    END IF;

    RETURN h2h_id;
END;
$$;

-- =========================================
-- STEP 3: Function to update h2h after match
-- =========================================
CREATE OR REPLACE FUNCTION update_head_to_head_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    h2h_id UUID;
    prev_last_winner UUID;
    prev_consecutive INTEGER;
    prev_handicap INTEGER;
    new_consecutive INTEGER;
    new_handicap INTEGER;
BEGIN
    -- Get or create h2h record
    h2h_id := get_or_create_h2h_stats(NEW.winner_id, NEW.loser_id);

    -- Get previous state
    SELECT last_winner_id, consecutive_wins, suggested_handicap
    INTO prev_last_winner, prev_consecutive, prev_handicap
    FROM head_to_head_stats WHERE id = h2h_id;

    prev_consecutive := COALESCE(prev_consecutive, 0);
    prev_handicap := COALESCE(prev_handicap, 0);

    -- Check if same player won again (continuing streak) or new winner (reset)
    IF prev_last_winner IS NULL OR prev_last_winner = NEW.winner_id THEN
        -- Same winner or first match - increment streak
        new_consecutive := prev_consecutive + 1;

        -- Increase handicap: starts after 2 wins
        -- 2 wins = 1, 3 wins = 2, 4 wins = 3, etc. (max 7)
        IF new_consecutive >= 2 THEN
            new_handicap := LEAST(new_consecutive - 1, 7);
        ELSE
            new_handicap := 0;
        END IF;
    ELSE
        -- DIFFERENT WINNER - underdog won!
        -- GRADUAL adjustment: decrease handicap by 1 instead of resetting to 0
        -- Example: 4 wins (handicap 3) -> underdog wins -> handicap becomes 2
        new_consecutive := 1;
        new_handicap := GREATEST(0, prev_handicap - 1);
    END IF;

    -- Update the h2h stats
    UPDATE head_to_head_stats SET
        last_winner_id = NEW.winner_id,
        consecutive_wins = new_consecutive,
        current_streak_winner_id = CASE WHEN new_consecutive >= 2 THEN NEW.winner_id ELSE NULL END,
        suggested_handicap = new_handicap,
        player_a_wins = CASE WHEN NEW.winner_id = player_a_id THEN player_a_wins + 1 ELSE player_a_wins END,
        player_b_wins = CASE WHEN NEW.winner_id = player_b_id THEN player_b_wins + 1 ELSE player_b_wins END,
        total_matches = total_matches + 1,
        last_match_at = NOW(),
        updated_at = NOW()
    WHERE id = h2h_id;

    RETURN NEW;
END;
$$;

-- =========================================
-- STEP 4: Create trigger on matches table
-- =========================================
DROP TRIGGER IF EXISTS trigger_update_h2h_stats ON matches;
CREATE TRIGGER trigger_update_h2h_stats
    AFTER INSERT ON matches
    FOR EACH ROW
    WHEN (NEW.processed = true)
    EXECUTE FUNCTION update_head_to_head_stats();

-- =========================================
-- STEP 5: Function to get h2h handicap suggestion
-- =========================================
CREATE OR REPLACE FUNCTION get_h2h_handicap(p1_id UUID, p2_id UUID)
RETURNS TABLE(
    suggested_handicap INTEGER,
    consecutive_wins INTEGER,
    streak_winner_id UUID,
    streak_loser_id UUID,
    total_matches INTEGER,
    p1_wins INTEGER,
    p2_wins INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    ordered_a UUID;
    ordered_b UUID;
    h2h RECORD;
BEGIN
    -- Order IDs
    IF p1_id < p2_id THEN
        ordered_a := p1_id;
        ordered_b := p2_id;
    ELSE
        ordered_a := p2_id;
        ordered_b := p1_id;
    END IF;

    -- Find h2h record
    SELECT * INTO h2h FROM head_to_head_stats
    WHERE player_a_id = ordered_a AND player_b_id = ordered_b;

    IF h2h IS NULL THEN
        -- No history
        RETURN QUERY SELECT
            0::INTEGER,
            0::INTEGER,
            NULL::UUID,
            NULL::UUID,
            0::INTEGER,
            0::INTEGER,
            0::INTEGER;
    ELSE
        RETURN QUERY SELECT
            h2h.suggested_handicap,
            h2h.consecutive_wins,
            h2h.current_streak_winner_id,
            -- The loser is the other player
            (CASE
                WHEN h2h.current_streak_winner_id = p1_id THEN p2_id
                WHEN h2h.current_streak_winner_id = p2_id THEN p1_id
                ELSE NULL
            END)::UUID,
            h2h.total_matches,
            (CASE WHEN p1_id = h2h.player_a_id THEN h2h.player_a_wins ELSE h2h.player_b_wins END)::INTEGER,
            (CASE WHEN p2_id = h2h.player_a_id THEN h2h.player_a_wins ELSE h2h.player_b_wins END)::INTEGER;
    END IF;
END;
$$;

-- =========================================
-- STEP 6: Enable RLS
-- =========================================
ALTER TABLE head_to_head_stats ENABLE ROW LEVEL SECURITY;

-- Drop old policies if exist
DROP POLICY IF EXISTS "Users can view own h2h stats" ON head_to_head_stats;
DROP POLICY IF EXISTS "System can manage h2h stats" ON head_to_head_stats;

-- Players can view their own h2h stats
CREATE POLICY "Users can view own h2h stats" ON head_to_head_stats
    FOR SELECT
    USING (auth.uid() = player_a_id OR auth.uid() = player_b_id);

-- System can insert/update (using SECURITY DEFINER functions)
CREATE POLICY "System can manage h2h stats" ON head_to_head_stats
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- =========================================
-- Verification
-- =========================================
DO $$
BEGIN
    RAISE NOTICE 'Head-to-Head Handicap System v2 (Fixed):';
    RAISE NOTICE '- Verfolgt Siegesserie zwischen zwei Spielern';
    RAISE NOTICE '- 2 Siege in Folge = +1 Handicap fuer Verlierer';
    RAISE NOTICE '- 3 Siege = +2, 4 Siege = +3, bis max +7';
    RAISE NOTICE '- Bei Niederlage des Seriengewinners: Handicap -1 (nicht Reset!)';
    RAISE NOTICE '  Beispiel: 4 Siege (Handicap 3) -> Underdog gewinnt -> Handicap 2';
    RAISE NOTICE '- Unabhaengig von Elo!';
END $$;
