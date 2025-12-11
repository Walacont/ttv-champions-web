-- Add club_leave to the activity_events event_type constraint
-- This enables tracking when players leave a club (either by request or being kicked)

-- First, drop the existing constraint
ALTER TABLE activity_events DROP CONSTRAINT IF EXISTS valid_event_type;

-- Add new constraint including 'club_leave'
ALTER TABLE activity_events ADD CONSTRAINT valid_event_type
    CHECK (event_type IN ('club_join', 'club_leave', 'rank_up', 'milestone', 'achievement'));

-- ============================================
-- UPDATE RLS POLICY: Add club_leave visibility
-- ============================================
-- club_leave events should only be visible to club members (same as club_join)
-- IMPORTANT: club_join/club_leave checks are moved OUTSIDE the EXISTS subquery
-- to avoid RLS conflicts with the profiles table

-- Drop existing policy
DROP POLICY IF EXISTS "Users can view activity events based on type and privacy" ON activity_events;

-- Recreate policy with club_leave included
-- Structure: Direct checks first (no subqueries that might hit other RLS policies)
CREATE POLICY "Users can view activity events based on type and privacy"
    ON activity_events FOR SELECT
    USING (
        -- 1. User can always see their own events
        user_id = auth.uid()
        OR
        -- 2. club_join and club_leave events: Directly check if viewer is in the same club
        --    (Moved outside EXISTS to avoid profiles RLS conflicts)
        (
            event_type IN ('club_join', 'club_leave')
            AND club_id IS NOT NULL
            AND club_id = (SELECT p.club_id FROM profiles p WHERE p.id = auth.uid())
        )
        OR
        -- 3. Other events (rank_up, milestone, achievement): Check privacy settings
        (
            event_type NOT IN ('club_join', 'club_leave')
            AND EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = activity_events.user_id
                -- User must not be invisible (searchable = 'none')
                AND COALESCE(p.privacy_settings->>'searchable', 'global') != 'none'
                AND (
                    -- rank_up events: Visible based on privacy settings
                    (
                        activity_events.event_type = 'rank_up'
                        AND (
                            -- If searchable = 'global': visible to club members and followers
                            (
                                COALESCE(p.privacy_settings->>'searchable', 'global') = 'global'
                                AND (
                                    -- Club members can see it
                                    p.club_id = (SELECT club_id FROM profiles WHERE id = auth.uid())
                                    OR
                                    -- Followers can see it
                                    EXISTS (
                                        SELECT 1 FROM friendships
                                        WHERE requester_id = auth.uid()
                                        AND addressee_id = activity_events.user_id
                                        AND status = 'accepted'
                                    )
                                )
                            )
                            OR
                            -- If searchable = 'club_only': only club members can see it
                            (
                                p.privacy_settings->>'searchable' = 'club_only'
                                AND p.club_id = (SELECT club_id FROM profiles WHERE id = auth.uid())
                            )
                            OR
                            -- If searchable = 'friends_only': only followers can see it
                            (
                                p.privacy_settings->>'searchable' = 'friends_only'
                                AND EXISTS (
                                    SELECT 1 FROM friendships
                                    WHERE requester_id = auth.uid()
                                    AND addressee_id = activity_events.user_id
                                    AND status = 'accepted'
                                )
                            )
                        )
                    )
                    OR
                    -- milestone and achievement events: same as rank_up
                    (
                        activity_events.event_type IN ('milestone', 'achievement')
                        AND (
                            (
                                COALESCE(p.privacy_settings->>'searchable', 'global') = 'global'
                                AND (
                                    p.club_id = (SELECT club_id FROM profiles WHERE id = auth.uid())
                                    OR
                                    EXISTS (
                                        SELECT 1 FROM friendships
                                        WHERE requester_id = auth.uid()
                                        AND addressee_id = activity_events.user_id
                                        AND status = 'accepted'
                                    )
                                )
                            )
                            OR
                            (
                                p.privacy_settings->>'searchable' = 'club_only'
                                AND p.club_id = (SELECT club_id FROM profiles WHERE id = auth.uid())
                            )
                            OR
                            (
                                p.privacy_settings->>'searchable' = 'friends_only'
                                AND EXISTS (
                                    SELECT 1 FROM friendships
                                    WHERE requester_id = auth.uid()
                                    AND addressee_id = activity_events.user_id
                                    AND status = 'accepted'
                                )
                            )
                        )
                    )
                )
            )
        )
    );

-- ============================================
-- TRIGGER: Track club leaves
-- ============================================

-- Update the club join/leave trigger function to handle both cases
-- Note: Removed dependency on 'ranks' table as it may not exist
CREATE OR REPLACE FUNCTION create_club_join_event()
RETURNS TRIGGER AS $$
DECLARE
    v_club_name TEXT;
    v_old_club_name TEXT;
BEGIN
    -- Handle CLUB JOIN: club_id changed from NULL to a value, or changed to a different club
    IF (OLD.club_id IS DISTINCT FROM NEW.club_id) AND NEW.club_id IS NOT NULL THEN
        -- Get club name
        SELECT name INTO v_club_name FROM clubs WHERE id = NEW.club_id;

        -- Insert club join activity event
        INSERT INTO activity_events (user_id, club_id, event_type, event_data)
        VALUES (
            NEW.id,
            NEW.club_id,
            'club_join',
            jsonb_build_object(
                'club_name', COALESCE(v_club_name, 'Unbekannt'),
                'display_name', COALESCE(NEW.display_name, NEW.first_name, 'Spieler'),
                'avatar_url', NEW.avatar_url
            )
        );
    END IF;

    -- Handle CLUB LEAVE: club_id changed from a value to NULL
    IF OLD.club_id IS NOT NULL AND NEW.club_id IS NULL THEN
        -- Get old club name for the event
        SELECT name INTO v_old_club_name FROM clubs WHERE id = OLD.club_id;

        -- Insert club leave activity event
        -- Note: We use OLD.club_id so the event is visible to the old club members
        INSERT INTO activity_events (user_id, club_id, event_type, event_data)
        VALUES (
            NEW.id,
            OLD.club_id,  -- Use the OLD club_id so event shows for the club that was left
            'club_leave',
            jsonb_build_object(
                'club_name', COALESCE(v_old_club_name, 'Unbekannt'),
                'display_name', COALESCE(NEW.display_name, NEW.first_name, 'Spieler'),
                'avatar_url', NEW.avatar_url
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: The trigger already exists from activity-events.sql
-- It will now use the updated function that handles both joins and leaves
