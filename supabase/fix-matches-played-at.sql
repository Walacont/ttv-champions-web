-- Fix matches without played_at date
-- Sets played_at to created_at for all matches where played_at is NULL

-- =============================================================================
-- 1. FIX SINGLES MATCHES
-- =============================================================================
UPDATE matches
SET played_at = created_at
WHERE played_at IS NULL;

-- =============================================================================
-- 2. FIX DOUBLES MATCHES
-- =============================================================================
UPDATE doubles_matches
SET played_at = created_at
WHERE played_at IS NULL;

-- =============================================================================
-- 3. UPDATE DOUBLES TRIGGER FUNCTION to include played_at
-- =============================================================================
CREATE OR REPLACE FUNCTION process_approved_doubles_match_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only process when status changes to 'approved'
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        -- Create doubles match from request (extract from JSONB team_a and team_b)
        INSERT INTO doubles_matches (
            club_id, winning_team,
            team_a_player1_id, team_a_player2_id, team_a_pairing_id,
            team_b_player1_id, team_b_player2_id, team_b_pairing_id,
            sets, match_mode, handicap_used, handicap, is_cross_club, played_at, created_at
        ) VALUES (
            NEW.club_id, NEW.winning_team,
            (NEW.team_a->>'player1_id')::UUID,
            (NEW.team_a->>'player2_id')::UUID,
            NEW.team_a->>'pairing_id',
            (NEW.team_b->>'player1_id')::UUID,
            (NEW.team_b->>'player2_id')::UUID,
            NEW.team_b->>'pairing_id',
            NEW.sets, COALESCE(NEW.match_mode, 'best-of-5'), COALESCE(NEW.handicap_used, false), NEW.handicap, NEW.is_cross_club, NOW(), NOW()
        );

        -- Delete the request
        DELETE FROM doubles_match_requests WHERE id = NEW.id;

        RETURN NULL;
    END IF;

    RETURN NEW;
END;
$$;

-- =============================================================================
-- 4. SHOW RESULTS
-- =============================================================================
SELECT 'Singles matches' as type,
    COUNT(*) FILTER (WHERE played_at IS NOT NULL) as with_played_at,
    COUNT(*) FILTER (WHERE played_at IS NULL) as without_played_at
FROM matches
UNION ALL
SELECT 'Doubles matches',
    COUNT(*) FILTER (WHERE played_at IS NOT NULL),
    COUNT(*) FILTER (WHERE played_at IS NULL)
FROM doubles_matches;
