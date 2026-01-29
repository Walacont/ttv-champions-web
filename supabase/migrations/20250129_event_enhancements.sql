-- Event Enhancements Migration
-- Adds: points settings, organizers, attachments, reminders, default participation status,
-- waitlist, decline comments, guardian notifications

-- ============================================
-- 1. NEW COLUMNS ON events TABLE
-- ============================================

-- Points settings per event
ALTER TABLE events ADD COLUMN IF NOT EXISTS award_points BOOLEAN DEFAULT NULL;
-- NULL = use category default (training=always, competition=off, meeting/other=never)
-- true = always award points
-- false = never award points

-- Organizer IDs (multiple coaches can be organizers)
ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_ids UUID[] DEFAULT '{}';
-- Array of user IDs who are organizers (in addition to organizer_id which is the creator)

-- Attachments (URLs to uploaded files in R2)
ALTER TABLE events ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
-- Array of { url, filename, type (pdf/image), uploaded_at, uploaded_by }

-- Automatic reminder settings
ALTER TABLE events ADD COLUMN IF NOT EXISTS auto_reminder TEXT DEFAULT 'disabled';
-- Options: 'disabled', 'after_48h' (48h after creation), 'before_48h' (48h before start)

ALTER TABLE events ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ DEFAULT NULL;
-- Track when reminder was sent to avoid duplicates

-- Default participation status
ALTER TABLE events ADD COLUMN IF NOT EXISTS default_participation_status TEXT DEFAULT 'pending';
-- 'pending' = unbeantwortet (must respond)
-- 'accepted' = teilnehmend (auto-accepted, only respond if declining)

-- Invite target mode
ALTER TABLE events ADD COLUMN IF NOT EXISTS invite_mode TEXT DEFAULT 'members';
-- 'members' = invite members (auto-notify guardians for kids)
-- 'guardians' = invite only guardians (for parent meetings etc.)

-- Notify guardians flag (auto-set when kids are invited)
ALTER TABLE events ADD COLUMN IF NOT EXISTS notify_guardians BOOLEAN DEFAULT TRUE;


-- ============================================
-- 2. ENHANCE event_invitations TABLE
-- ============================================

-- Decline comment (visible to organizers who accepted)
ALTER TABLE event_invitations ADD COLUMN IF NOT EXISTS decline_comment TEXT DEFAULT NULL;

-- Role in event (participant vs organizer)
ALTER TABLE event_invitations ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'participant';
-- 'participant' = normal participant, counts in participant list
-- 'organizer' = organizer, does NOT count as participant

-- Waitlist position (NULL = not on waitlist, number = position)
ALTER TABLE event_invitations ADD COLUMN IF NOT EXISTS waitlist_position INTEGER DEFAULT NULL;

-- Guardian response tracking (for child invitations)
ALTER TABLE event_invitations ADD COLUMN IF NOT EXISTS responded_by UUID DEFAULT NULL;
-- If a guardian responded on behalf of a child, store guardian's user_id


-- ============================================
-- 3. EVENT COMMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS event_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    occurrence_date DATE DEFAULT NULL,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NULL
);

-- RLS for event_comments
ALTER TABLE event_comments ENABLE ROW LEVEL SECURITY;

-- Anyone invited to the event can read comments
CREATE POLICY "Invited users can read event comments" ON event_comments
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM event_invitations ei
            WHERE ei.event_id = event_comments.event_id
            AND ei.user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM events e
            JOIN profiles p ON p.club_id = e.club_id
            WHERE e.id = event_comments.event_id
            AND p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

-- Invited users can create comments (if comments_enabled)
CREATE POLICY "Invited users can create event comments" ON event_comments
    FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM events e
            WHERE e.id = event_comments.event_id
            AND e.comments_enabled = true
        )
        AND (
            EXISTS (
                SELECT 1 FROM event_invitations ei
                WHERE ei.event_id = event_comments.event_id
                AND ei.user_id = auth.uid()
            )
            OR EXISTS (
                SELECT 1 FROM events e
                JOIN profiles p ON p.club_id = e.club_id
                WHERE e.id = event_comments.event_id
                AND p.id = auth.uid()
                AND p.role IN ('coach', 'head_coach', 'admin')
            )
        )
    );

-- Users can delete own comments
CREATE POLICY "Users can delete own event comments" ON event_comments
    FOR DELETE
    USING (auth.uid() = user_id);

-- Coaches can delete any comment in their club
CREATE POLICY "Coaches can delete event comments" ON event_comments
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM events e
            JOIN profiles p ON p.club_id = e.club_id
            WHERE e.id = event_comments.event_id
            AND p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_comments_event_id ON event_comments(event_id);
CREATE INDEX IF NOT EXISTS idx_event_comments_event_occurrence ON event_comments(event_id, occurrence_date);


-- ============================================
-- 4. EVENT WAITLIST TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS event_waitlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    occurrence_date DATE DEFAULT NULL,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 1,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    promoted_at TIMESTAMPTZ DEFAULT NULL,
    UNIQUE(event_id, occurrence_date, user_id)
);

ALTER TABLE event_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their waitlist status" ON event_waitlist
    FOR SELECT
    USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM events e
            JOIN profiles p ON p.club_id = e.club_id
            WHERE e.id = event_waitlist.event_id
            AND p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

CREATE POLICY "Users can join waitlist" ON event_waitlist
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave waitlist" ON event_waitlist
    FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Coaches can manage waitlist" ON event_waitlist
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM events e
            JOIN profiles p ON p.club_id = e.club_id
            WHERE e.id = event_waitlist.event_id
            AND p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

CREATE INDEX IF NOT EXISTS idx_event_waitlist_event ON event_waitlist(event_id, occurrence_date, position);


-- ============================================
-- 5. GUARDIAN EVENT NOTIFICATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS guardian_event_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    occurrence_date DATE DEFAULT NULL,
    child_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    guardian_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, declined
    decline_comment TEXT DEFAULT NULL,
    responded_at TIMESTAMPTZ DEFAULT NULL,
    notified_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(event_id, occurrence_date, child_id, guardian_id)
);

ALTER TABLE guardian_event_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Guardians can view own responses" ON guardian_event_responses
    FOR SELECT
    USING (
        auth.uid() = guardian_id
        OR EXISTS (
            SELECT 1 FROM events e
            JOIN profiles p ON p.club_id = e.club_id
            WHERE e.id = guardian_event_responses.event_id
            AND p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

CREATE POLICY "Guardians can respond" ON guardian_event_responses
    FOR UPDATE
    USING (auth.uid() = guardian_id)
    WITH CHECK (auth.uid() = guardian_id);

CREATE POLICY "System can create guardian responses" ON guardian_event_responses
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM events e
            JOIN profiles p ON p.club_id = e.club_id
            WHERE e.id = guardian_event_responses.event_id
            AND p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
        OR auth.uid() = guardian_id
    );

CREATE INDEX IF NOT EXISTS idx_guardian_event_responses_event ON guardian_event_responses(event_id, occurrence_date);
CREATE INDEX IF NOT EXISTS idx_guardian_event_responses_guardian ON guardian_event_responses(guardian_id);


-- ============================================
-- 6. FUNCTION: Promote from waitlist when participant declines
-- ============================================

CREATE OR REPLACE FUNCTION promote_from_waitlist()
RETURNS TRIGGER AS $$
DECLARE
    next_waitlist RECORD;
    event_max INTEGER;
    current_accepted INTEGER;
BEGIN
    -- Only trigger when status changes to 'declined'
    IF NEW.status = 'declined' AND (OLD.status IS NULL OR OLD.status != 'declined') THEN
        -- Get max participants for this event
        SELECT max_participants INTO event_max
        FROM events WHERE id = NEW.event_id;

        -- Only process if max_participants is set
        IF event_max IS NOT NULL THEN
            -- Count current accepted participants (excluding organizers)
            SELECT COUNT(*) INTO current_accepted
            FROM event_invitations
            WHERE event_id = NEW.event_id
            AND occurrence_date = NEW.occurrence_date
            AND status = 'accepted'
            AND role = 'participant';

            -- If there's room, promote next waitlisted person
            IF current_accepted < event_max THEN
                SELECT * INTO next_waitlist
                FROM event_waitlist
                WHERE event_id = NEW.event_id
                AND occurrence_date = NEW.occurrence_date
                AND promoted_at IS NULL
                ORDER BY position ASC
                LIMIT 1;

                IF FOUND THEN
                    -- Promote: update invitation to accepted
                    UPDATE event_invitations
                    SET status = 'accepted', response_at = NOW()
                    WHERE event_id = NEW.event_id
                    AND user_id = next_waitlist.user_id
                    AND occurrence_date = NEW.occurrence_date;

                    -- Mark as promoted
                    UPDATE event_waitlist
                    SET promoted_at = NOW()
                    WHERE id = next_waitlist.id;

                    -- Create notification for promoted user
                    INSERT INTO notifications (user_id, type, title, message, data, is_read, created_at)
                    VALUES (
                        next_waitlist.user_id,
                        'event_waitlist_promoted',
                        'Platz frei geworden!',
                        'Ein Platz ist frei geworden. Du bist jetzt auf der Teilnehmerliste.',
                        jsonb_build_object('event_id', NEW.event_id),
                        false,
                        NOW()
                    );
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for waitlist promotion
DROP TRIGGER IF EXISTS trigger_promote_from_waitlist ON event_invitations;
CREATE TRIGGER trigger_promote_from_waitlist
    AFTER UPDATE ON event_invitations
    FOR EACH ROW
    EXECUTE FUNCTION promote_from_waitlist();


-- ============================================
-- 7. Add realtime for new tables
-- ============================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'event_comments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE event_comments;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Could not add event_comments to realtime: %', SQLERRM;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'event_waitlist'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE event_waitlist;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Could not add event_waitlist to realtime: %', SQLERRM;
END $$;
