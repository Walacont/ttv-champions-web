-- Fix: Add missing columns to doubles_match_requests table
-- These columns are needed to properly transfer match_mode, handicap_used, and handicap
-- from the request to the actual doubles_matches record

-- Add match_mode column to doubles_match_requests
ALTER TABLE doubles_match_requests
ADD COLUMN IF NOT EXISTS match_mode TEXT DEFAULT 'best-of-5';

-- Add handicap_used column to doubles_match_requests
ALTER TABLE doubles_match_requests
ADD COLUMN IF NOT EXISTS handicap_used BOOLEAN DEFAULT false;

-- Add handicap column to doubles_match_requests
ALTER TABLE doubles_match_requests
ADD COLUMN IF NOT EXISTS handicap JSONB;

-- Update the trigger function to include these fields when creating doubles_matches
CREATE OR REPLACE FUNCTION process_approved_doubles_match_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Only process when status changes to 'approved'
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        -- Create doubles match from request (extract from JSONB team_a and team_b)
        INSERT INTO doubles_matches (
            club_id, winning_team,
            team_a_player1_id, team_a_player2_id, team_a_pairing_id,
            team_b_player1_id, team_b_player2_id, team_b_pairing_id,
            sets, match_mode, handicap_used, handicap, is_cross_club, created_at
        ) VALUES (
            NEW.club_id, NEW.winning_team,
            (NEW.team_a->>'player1_id')::UUID,
            (NEW.team_a->>'player2_id')::UUID,
            NEW.team_a->>'pairing_id',
            (NEW.team_b->>'player1_id')::UUID,
            (NEW.team_b->>'player2_id')::UUID,
            NEW.team_b->>'pairing_id',
            NEW.sets,
            COALESCE(NEW.match_mode, 'best-of-5'),
            COALESCE(NEW.handicap_used, false),
            NEW.handicap,
            NEW.is_cross_club,
            NOW()
        );

        -- Delete the request after creating the match
        DELETE FROM doubles_match_requests WHERE id = NEW.id;

        RETURN NULL;
    END IF;

    RETURN NEW;
END;
$$;

-- Recreate trigger to use updated function
DROP TRIGGER IF EXISTS trigger_process_approved_doubles_request ON doubles_match_requests;
CREATE TRIGGER trigger_process_approved_doubles_request
    AFTER UPDATE ON doubles_match_requests
    FOR EACH ROW
    EXECUTE FUNCTION process_approved_doubles_match_request();

-- Also update the alternative function name if it exists
CREATE OR REPLACE FUNCTION process_approved_doubles_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Only process when status changes to 'approved'
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        -- Create the doubles match from the request
        INSERT INTO doubles_matches (
            club_id,
            team_a_player1_id,
            team_a_player2_id,
            team_a_pairing_id,
            team_b_player1_id,
            team_b_player2_id,
            team_b_pairing_id,
            winning_team,
            sets,
            match_mode,
            handicap_used,
            handicap,
            is_cross_club,
            created_by
        ) VALUES (
            NEW.club_id,
            (NEW.team_a->>'player1_id')::UUID,
            (NEW.team_a->>'player2_id')::UUID,
            NEW.team_a->>'pairing_id',
            (NEW.team_b->>'player1_id')::UUID,
            (NEW.team_b->>'player2_id')::UUID,
            NEW.team_b->>'pairing_id',
            NEW.winning_team,
            NEW.sets,
            COALESCE(NEW.match_mode, 'best-of-5'),
            COALESCE(NEW.handicap_used, false),
            NEW.handicap,
            NEW.is_cross_club,
            NEW.initiated_by
        );
    END IF;

    RETURN NEW;
END;
$$;

-- Recreate alternative trigger if it exists
DROP TRIGGER IF EXISTS process_approved_doubles_request_trigger ON doubles_match_requests;
CREATE TRIGGER process_approved_doubles_request_trigger
    AFTER UPDATE ON doubles_match_requests
    FOR EACH ROW
    EXECUTE FUNCTION process_approved_doubles_request();
