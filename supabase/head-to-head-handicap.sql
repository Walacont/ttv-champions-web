-- =========================================
-- Dynamic Head-to-Head Handicap System
-- =========================================
-- Tracks consecutive losses between player pairs
-- Suggests handicap when stronger player loses 2+ times in a row

-- =========================================
-- STEP 1: Create head_to_head_stats table
-- =========================================
CREATE TABLE IF NOT EXISTS head_to_head_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Always store with player_a having higher Elo at creation time
    -- But we track from perspective of who is currently stronger
    player_a_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    player_b_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Consecutive losses by the stronger player against the weaker
    -- Positive = stronger is losing streak, 0 = reset after win
    stronger_consecutive_losses INTEGER DEFAULT 0,

    -- Who is currently the stronger player (by Elo)
    current_stronger_id UUID,

    -- Suggested handicap points (0-7)
    suggested_handicap INTEGER DEFAULT 0,

    -- Total match stats
    player_a_wins INTEGER DEFAULT 0,
    player_b_wins INTEGER DEFAULT 0,
    total_matches INTEGER DEFAULT 0,

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
    winner_elo INTEGER;
    loser_elo INTEGER;
    stronger_id UUID;
    weaker_id UUID;
    current_losses INTEGER;
    new_losses INTEGER;
    new_handicap INTEGER;
    ordered_a UUID;
    ordered_b UUID;
BEGIN
    -- Get Elo ratings
    SELECT elo_rating INTO winner_elo FROM profiles WHERE id = NEW.winner_id;
    SELECT elo_rating INTO loser_elo FROM profiles WHERE id = NEW.loser_id;

    -- Determine who is stronger (by Elo before the match)
    -- Note: We use the Elo BEFORE the match result is applied
    -- Since this trigger runs after process_match_result, we need to reverse the change
    winner_elo := winner_elo - COALESCE(NEW.winner_elo_change, 0);
    loser_elo := loser_elo - COALESCE(NEW.loser_elo_change, 0);

    IF winner_elo >= loser_elo THEN
        stronger_id := NEW.winner_id;
        weaker_id := NEW.loser_id;
    ELSE
        stronger_id := NEW.loser_id;
        weaker_id := NEW.winner_id;
    END IF;

    -- Order player IDs consistently
    IF NEW.winner_id < NEW.loser_id THEN
        ordered_a := NEW.winner_id;
        ordered_b := NEW.loser_id;
    ELSE
        ordered_a := NEW.loser_id;
        ordered_b := NEW.winner_id;
    END IF;

    -- Get or create h2h record
    h2h_id := get_or_create_h2h_stats(NEW.winner_id, NEW.loser_id);

    -- Get current consecutive losses
    SELECT stronger_consecutive_losses INTO current_losses
    FROM head_to_head_stats WHERE id = h2h_id;

    current_losses := COALESCE(current_losses, 0);

    -- Update based on who won
    IF NEW.winner_id = stronger_id THEN
        -- Stronger player won -> reset streak
        new_losses := 0;
        new_handicap := 0;
    ELSE
        -- Weaker player won (upset) -> increment streak
        new_losses := current_losses + 1;

        -- Calculate handicap: starts at 0, then after 2 losses = 1, after 3 = 2, etc.
        -- Max 7
        IF new_losses >= 2 THEN
            new_handicap := LEAST(new_losses - 1, 7);
        ELSE
            new_handicap := 0;
        END IF;
    END IF;

    -- Update the h2h stats
    UPDATE head_to_head_stats SET
        stronger_consecutive_losses = new_losses,
        current_stronger_id = stronger_id,
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
    consecutive_losses INTEGER,
    stronger_player_id UUID,
    weaker_player_id UUID,
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
    p1_elo INTEGER;
    p2_elo INTEGER;
BEGIN
    -- Order IDs
    IF p1_id < p2_id THEN
        ordered_a := p1_id;
        ordered_b := p2_id;
    ELSE
        ordered_a := p2_id;
        ordered_b := p1_id;
    END IF;

    -- Get current Elo ratings
    SELECT elo_rating INTO p1_elo FROM profiles WHERE id = p1_id;
    SELECT elo_rating INTO p2_elo FROM profiles WHERE id = p2_id;

    -- Find h2h record
    SELECT * INTO h2h FROM head_to_head_stats
    WHERE player_a_id = ordered_a AND player_b_id = ordered_b;

    IF h2h IS NULL THEN
        -- No history
        RETURN QUERY SELECT
            0::INTEGER,
            0::INTEGER,
            (CASE WHEN p1_elo >= p2_elo THEN p1_id ELSE p2_id END)::UUID,
            (CASE WHEN p1_elo < p2_elo THEN p1_id ELSE p2_id END)::UUID,
            0::INTEGER,
            0::INTEGER,
            0::INTEGER;
    ELSE
        RETURN QUERY SELECT
            h2h.suggested_handicap,
            h2h.stronger_consecutive_losses,
            h2h.current_stronger_id,
            (CASE WHEN h2h.current_stronger_id = p1_id THEN p2_id ELSE p1_id END)::UUID,
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

-- Players can view their own h2h stats
CREATE POLICY "Users can view own h2h stats" ON head_to_head_stats
    FOR SELECT
    USING (auth.uid() = player_a_id OR auth.uid() = player_b_id);

-- System can insert/update
CREATE POLICY "System can manage h2h stats" ON head_to_head_stats
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- =========================================
-- Verification
-- =========================================
DO $$
BEGIN
    RAISE NOTICE 'Head-to-Head Handicap System erstellt:';
    RAISE NOTICE '- Tabelle: head_to_head_stats';
    RAISE NOTICE '- Trigger: Nach jedem Match wird H2H aktualisiert';
    RAISE NOTICE '- Regel: Nach 2 Niederlagen = +1 Handicap, max +7';
    RAISE NOTICE '- Reset: Bei Sieg des Stärkeren -> Handicap = 0';
END $$;
