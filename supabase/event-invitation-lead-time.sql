-- Add invitation lead time support for events
-- This allows coaches to specify "send invitations X days/hours before the event"
-- which is especially useful for recurring events

-- Add lead time columns to events table
ALTER TABLE events
ADD COLUMN IF NOT EXISTS invitation_lead_time_value INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS invitation_lead_time_unit TEXT DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN events.invitation_lead_time_value IS 'Number of units before event to send invitation (e.g., 3)';
COMMENT ON COLUMN events.invitation_lead_time_unit IS 'Unit of time: hours, days, or weeks';

-- Create an index for querying events that need invitations sent
CREATE INDEX IF NOT EXISTS idx_events_invitation_send_at ON events (invitation_send_at)
WHERE invitation_send_at IS NOT NULL AND deleted_at IS NULL;

-- Done!
SELECT 'Invitation lead time columns added!' as status;
