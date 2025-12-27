-- Migration 011: Fix participant_count for all tournaments
-- Issue: Some tournaments have incorrect participant_count values

-- Recalculate and update participant_count for ALL tournaments
UPDATE tournaments
SET participant_count = (
    SELECT COUNT(*)
    FROM tournament_participants tp
    WHERE tp.tournament_id = tournaments.id
);

-- Verify the trigger still exists and recreate if needed
DROP TRIGGER IF EXISTS tournament_participant_count_insert ON tournament_participants;
DROP TRIGGER IF EXISTS tournament_participant_count_delete ON tournament_participants;

-- Recreate the trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_tournament_participant_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the tournament's participant_count
    UPDATE tournaments
    SET participant_count = (
        SELECT COUNT(*)
        FROM tournament_participants
        WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)
    )
    WHERE id = COALESCE(NEW.tournament_id, OLD.tournament_id);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers for INSERT and DELETE
CREATE TRIGGER tournament_participant_count_insert
AFTER INSERT ON tournament_participants
FOR EACH ROW
EXECUTE FUNCTION update_tournament_participant_count();

CREATE TRIGGER tournament_participant_count_delete
AFTER DELETE ON tournament_participants
FOR EACH ROW
EXECUTE FUNCTION update_tournament_participant_count();

COMMENT ON FUNCTION update_tournament_participant_count()
IS 'Auto-updates participant_count in tournaments table when participants join/leave';
