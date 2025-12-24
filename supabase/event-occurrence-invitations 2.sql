-- Migration: Add occurrence_date to event_invitations for per-occurrence responses
-- This allows players to respond to specific occurrences of recurring events separately

-- Add occurrence_date column to track which specific date this invitation is for
ALTER TABLE event_invitations
ADD COLUMN IF NOT EXISTS occurrence_date DATE;

-- For existing invitations, set occurrence_date from the event's start_date
UPDATE event_invitations ei
SET occurrence_date = e.start_date
FROM events e
WHERE ei.event_id = e.id
AND ei.occurrence_date IS NULL;

-- Create index for efficient querying by occurrence date
CREATE INDEX IF NOT EXISTS idx_event_invitations_occurrence_date
ON event_invitations(event_id, occurrence_date);

-- Create unique constraint to prevent duplicate invitations for same user/event/date
-- First, remove any duplicates if they exist
DELETE FROM event_invitations a
USING event_invitations b
WHERE a.id < b.id
AND a.event_id = b.event_id
AND a.user_id = b.user_id
AND a.occurrence_date = b.occurrence_date;

-- Now add the constraint
ALTER TABLE event_invitations
DROP CONSTRAINT IF EXISTS unique_event_user_occurrence;

ALTER TABLE event_invitations
ADD CONSTRAINT unique_event_user_occurrence
UNIQUE (event_id, user_id, occurrence_date);

-- Add comment
COMMENT ON COLUMN event_invitations.occurrence_date IS
'The specific date this invitation is for. For recurring events, each occurrence gets its own invitation.';
