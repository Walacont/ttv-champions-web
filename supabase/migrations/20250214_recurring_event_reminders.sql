-- Recurring Event Reminders Migration
-- Adds: reminder_days_before, reminder_time columns for recurring event reminders
-- For recurring events, reminders are always sent with configurable timing (0-14 days before, at specific time)

-- Days before the occurrence to send reminder (0 = same day, 1-14 = days in advance)
ALTER TABLE events ADD COLUMN IF NOT EXISTS reminder_days_before INTEGER DEFAULT NULL;

-- Time of day to send the reminder (e.g. '09:00')
ALTER TABLE events ADD COLUMN IF NOT EXISTS reminder_time TEXT DEFAULT NULL;

-- Tracking column: when was the recurring reminder sent for this invitation?
ALTER TABLE event_invitations ADD COLUMN IF NOT EXISTS reminder_notified_at TIMESTAMPTZ DEFAULT NULL;
