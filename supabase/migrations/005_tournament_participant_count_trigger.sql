-- ============================================
-- TOURNAMENT PARTICIPANT COUNT TRIGGER
-- Auto-update participant_count when players join/leave
-- ============================================

-- Function to update tournament participant count
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

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS tournament_participant_count_insert ON tournament_participants;
DROP TRIGGER IF EXISTS tournament_participant_count_delete ON tournament_participants;

-- Trigger on INSERT
CREATE TRIGGER tournament_participant_count_insert
AFTER INSERT ON tournament_participants
FOR EACH ROW
EXECUTE FUNCTION update_tournament_participant_count();

-- Trigger on DELETE
CREATE TRIGGER tournament_participant_count_delete
AFTER DELETE ON tournament_participants
FOR EACH ROW
EXECUTE FUNCTION update_tournament_participant_count();

-- Update all existing tournaments to have correct participant_count
UPDATE tournaments
SET participant_count = (
    SELECT COUNT(*)
    FROM tournament_participants tp
    WHERE tp.tournament_id = tournaments.id
);
