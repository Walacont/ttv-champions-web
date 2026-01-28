-- ============================================
-- USER BLOCKS & CONTENT REPORTS
-- Block users and report inappropriate content
-- Required for App Store Compliance (Apple & Google)
-- ============================================

-- ============================================
-- USER BLOCKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User who is blocking
    blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- User being blocked
    blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_block UNIQUE (blocker_id, blocked_id),
    CONSTRAINT no_self_block CHECK (blocker_id != blocked_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);

-- Enable RLS
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own blocks" ON user_blocks;
CREATE POLICY "Users can view their own blocks"
    ON user_blocks FOR SELECT
    USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Users can create blocks" ON user_blocks;
CREATE POLICY "Users can create blocks"
    ON user_blocks FOR INSERT
    WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own blocks" ON user_blocks;
CREATE POLICY "Users can delete their own blocks"
    ON user_blocks FOR DELETE
    USING (blocker_id = auth.uid());


-- ============================================
-- CONTENT REPORTS TABLE
-- ============================================

-- Report types enum
DO $$ BEGIN
    CREATE TYPE report_type AS ENUM (
        'spam',
        'harassment',
        'hate_speech',
        'violence',
        'inappropriate_content',
        'impersonation',
        'misinformation',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Report status enum
DO $$ BEGIN
    CREATE TYPE report_status AS ENUM (
        'pending',
        'reviewed',
        'resolved',
        'dismissed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Content type enum
DO $$ BEGIN
    CREATE TYPE reportable_content_type AS ENUM (
        'user',
        'post',
        'poll',
        'comment',
        'match_media'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS content_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reporter
    reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- What is being reported
    content_type reportable_content_type NOT NULL,
    content_id UUID NOT NULL,

    -- The user who owns the reported content (for quick lookup)
    reported_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

    -- Report details
    report_type report_type NOT NULL,
    description TEXT CHECK (char_length(description) <= 1000),

    -- Status tracking
    status report_status DEFAULT 'pending',

    -- Admin handling
    reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    resolution_notes TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate reports from same user for same content
    CONSTRAINT unique_report UNIQUE (reporter_id, content_type, content_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_content_reports_reporter ON content_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_reported_user ON content_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status);
CREATE INDEX IF NOT EXISTS idx_content_reports_content ON content_reports(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_created_at ON content_reports(created_at DESC);

-- Enable RLS
ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own reports" ON content_reports;
CREATE POLICY "Users can view their own reports"
    ON content_reports FOR SELECT
    USING (reporter_id = auth.uid());

DROP POLICY IF EXISTS "Users can create reports" ON content_reports;
CREATE POLICY "Users can create reports"
    ON content_reports FOR INSERT
    WITH CHECK (reporter_id = auth.uid());

-- Admins can view all reports (coaches with admin flag)
DROP POLICY IF EXISTS "Admins can view all reports" ON content_reports;
CREATE POLICY "Admins can view all reports"
    ON content_reports FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('coach', 'admin')
        )
    );

-- Admins can update reports
DROP POLICY IF EXISTS "Admins can update reports" ON content_reports;
CREATE POLICY "Admins can update reports"
    ON content_reports FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('coach', 'admin')
        )
    );


-- ============================================
-- HIDDEN CONTENT TABLE (for hiding posts without blocking user)
-- ============================================
CREATE TABLE IF NOT EXISTS hidden_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User who hid the content
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Hidden content
    content_type reportable_content_type NOT NULL,
    content_id UUID NOT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicates
    CONSTRAINT unique_hidden_content UNIQUE (user_id, content_type, content_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hidden_content_user ON hidden_content(user_id);
CREATE INDEX IF NOT EXISTS idx_hidden_content_lookup ON hidden_content(user_id, content_type, content_id);

-- Enable RLS
ALTER TABLE hidden_content ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own hidden content" ON hidden_content;
CREATE POLICY "Users can view their own hidden content"
    ON hidden_content FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can hide content" ON hidden_content;
CREATE POLICY "Users can hide content"
    ON hidden_content FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can unhide content" ON hidden_content;
CREATE POLICY "Users can unhide content"
    ON hidden_content FOR DELETE
    USING (user_id = auth.uid());


-- ============================================
-- RPC FUNCTIONS - BLOCKING
-- ============================================

-- Block a user
CREATE OR REPLACE FUNCTION block_user(
    current_user_id UUID,
    target_user_id UUID
)
RETURNS JSON AS $$
DECLARE
    target_name TEXT;
BEGIN
    -- Validate: Can't block yourself
    IF current_user_id = target_user_id THEN
        RETURN json_build_object('success', false, 'error', 'Cannot block yourself');
    END IF;

    -- Check if already blocked
    IF EXISTS (
        SELECT 1 FROM user_blocks
        WHERE blocker_id = current_user_id AND blocked_id = target_user_id
    ) THEN
        RETURN json_build_object('success', false, 'error', 'User already blocked');
    END IF;

    -- Get target name for confirmation
    SELECT first_name || ' ' || last_name INTO target_name
    FROM profiles WHERE id = target_user_id;

    -- Create block
    INSERT INTO user_blocks (blocker_id, blocked_id)
    VALUES (current_user_id, target_user_id);

    -- Remove any existing friendships in both directions
    DELETE FROM friendships
    WHERE (requester_id = current_user_id AND addressee_id = target_user_id)
       OR (requester_id = target_user_id AND addressee_id = current_user_id);

    RETURN json_build_object(
        'success', true,
        'message', 'User blocked successfully',
        'blocked_user_name', target_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Unblock a user
CREATE OR REPLACE FUNCTION unblock_user(
    current_user_id UUID,
    target_user_id UUID
)
RETURNS JSON AS $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM user_blocks
    WHERE blocker_id = current_user_id AND blocked_id = target_user_id;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'User is not blocked');
    END IF;

    RETURN json_build_object(
        'success', true,
        'message', 'User unblocked successfully'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get list of blocked users
CREATE OR REPLACE FUNCTION get_blocked_users(current_user_id UUID)
RETURNS TABLE (
    id UUID,
    blocked_id UUID,
    blocked_first_name TEXT,
    blocked_last_name TEXT,
    blocked_avatar_url TEXT,
    blocked_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ub.id,
        p.id as blocked_id,
        p.first_name as blocked_first_name,
        p.last_name as blocked_last_name,
        p.avatar_url as blocked_avatar_url,
        ub.created_at as blocked_at
    FROM user_blocks ub
    INNER JOIN profiles p ON p.id = ub.blocked_id
    WHERE ub.blocker_id = current_user_id
    ORDER BY ub.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if a user is blocked
CREATE OR REPLACE FUNCTION is_user_blocked(
    current_user_id UUID,
    target_user_id UUID
)
RETURNS JSON AS $$
BEGIN
    RETURN json_build_object(
        'is_blocked', EXISTS (
            SELECT 1 FROM user_blocks
            WHERE blocker_id = current_user_id AND blocked_id = target_user_id
        ),
        'is_blocked_by', EXISTS (
            SELECT 1 FROM user_blocks
            WHERE blocker_id = target_user_id AND blocked_id = current_user_id
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get blocked user IDs (for filtering)
CREATE OR REPLACE FUNCTION get_blocked_user_ids(current_user_id UUID)
RETURNS UUID[] AS $$
DECLARE
    blocked_ids UUID[];
BEGIN
    SELECT ARRAY_AGG(blocked_id) INTO blocked_ids
    FROM user_blocks
    WHERE blocker_id = current_user_id;

    RETURN COALESCE(blocked_ids, ARRAY[]::UUID[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- RPC FUNCTIONS - REPORTING
-- ============================================

-- Report content or user
CREATE OR REPLACE FUNCTION report_content(
    reporter_user_id UUID,
    p_content_type TEXT,
    p_content_id UUID,
    p_report_type TEXT,
    p_description TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    reported_owner_id UUID;
    report_id UUID;
BEGIN
    -- Get the owner of the reported content
    CASE p_content_type
        WHEN 'user' THEN
            reported_owner_id := p_content_id;
        WHEN 'post' THEN
            SELECT user_id INTO reported_owner_id FROM community_posts WHERE id = p_content_id;
        WHEN 'poll' THEN
            SELECT user_id INTO reported_owner_id FROM community_polls WHERE id = p_content_id;
        WHEN 'comment' THEN
            SELECT user_id INTO reported_owner_id FROM post_comments WHERE id = p_content_id;
            IF reported_owner_id IS NULL THEN
                SELECT user_id INTO reported_owner_id FROM activity_comments WHERE id = p_content_id;
            END IF;
        WHEN 'match_media' THEN
            -- Match media owner would be determined by match participant
            reported_owner_id := NULL;
        ELSE
            RETURN json_build_object('success', false, 'error', 'Invalid content type');
    END CASE;

    -- Can't report yourself
    IF reporter_user_id = reported_owner_id THEN
        RETURN json_build_object('success', false, 'error', 'Cannot report your own content');
    END IF;

    -- Check if already reported
    IF EXISTS (
        SELECT 1 FROM content_reports
        WHERE reporter_id = reporter_user_id
        AND content_type = p_content_type::reportable_content_type
        AND content_id = p_content_id
    ) THEN
        RETURN json_build_object('success', false, 'error', 'You have already reported this content');
    END IF;

    -- Create the report
    INSERT INTO content_reports (
        reporter_id,
        content_type,
        content_id,
        reported_user_id,
        report_type,
        description
    )
    VALUES (
        reporter_user_id,
        p_content_type::reportable_content_type,
        p_content_id,
        reported_owner_id,
        p_report_type::report_type,
        p_description
    )
    RETURNING id INTO report_id;

    RETURN json_build_object(
        'success', true,
        'message', 'Report submitted successfully',
        'report_id', report_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Get my reports
CREATE OR REPLACE FUNCTION get_my_reports(current_user_id UUID)
RETURNS TABLE (
    id UUID,
    content_type reportable_content_type,
    content_id UUID,
    report_type report_type,
    description TEXT,
    status report_status,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cr.id,
        cr.content_type,
        cr.content_id,
        cr.report_type,
        cr.description,
        cr.status,
        cr.created_at
    FROM content_reports cr
    WHERE cr.reporter_id = current_user_id
    ORDER BY cr.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- RPC FUNCTIONS - HIDING CONTENT
-- ============================================

-- Hide a post/poll/comment
CREATE OR REPLACE FUNCTION hide_content(
    current_user_id UUID,
    p_content_type TEXT,
    p_content_id UUID
)
RETURNS JSON AS $$
BEGIN
    -- Check if already hidden
    IF EXISTS (
        SELECT 1 FROM hidden_content
        WHERE user_id = current_user_id
        AND content_type = p_content_type::reportable_content_type
        AND content_id = p_content_id
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Content already hidden');
    END IF;

    INSERT INTO hidden_content (user_id, content_type, content_id)
    VALUES (current_user_id, p_content_type::reportable_content_type, p_content_id);

    RETURN json_build_object(
        'success', true,
        'message', 'Content hidden successfully'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Unhide content
CREATE OR REPLACE FUNCTION unhide_content(
    current_user_id UUID,
    p_content_type TEXT,
    p_content_id UUID
)
RETURNS JSON AS $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM hidden_content
    WHERE user_id = current_user_id
    AND content_type = p_content_type::reportable_content_type
    AND content_id = p_content_id;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Content is not hidden');
    END IF;

    RETURN json_build_object(
        'success', true,
        'message', 'Content is now visible again'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get hidden content IDs for filtering
CREATE OR REPLACE FUNCTION get_hidden_content_ids(
    current_user_id UUID,
    p_content_type TEXT
)
RETURNS UUID[] AS $$
DECLARE
    hidden_ids UUID[];
BEGIN
    SELECT ARRAY_AGG(content_id) INTO hidden_ids
    FROM hidden_content
    WHERE user_id = current_user_id
    AND content_type = p_content_type::reportable_content_type;

    RETURN COALESCE(hidden_ids, ARRAY[]::UUID[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- UPDATE send_friend_request TO CHECK BLOCKS
-- ============================================

-- Update send_friend_request to check for blocks
CREATE OR REPLACE FUNCTION send_friend_request(
    current_user_id UUID,
    target_user_id UUID
)
RETURNS JSON AS $$
DECLARE
    existing_friendship friendships%ROWTYPE;
    new_friendship_id UUID;
    requester_name TEXT;
    requester_profile profiles%ROWTYPE;
    target_profile profiles%ROWTYPE;
    target_privacy_setting TEXT;
    should_auto_accept BOOLEAN := false;
    result_status TEXT;
    notification_type TEXT;
    notification_title TEXT;
    notification_message TEXT;
    result JSON;
BEGIN
    -- Validierung: Nicht sich selbst als Freund hinzufuegen
    IF current_user_id = target_user_id THEN
        RETURN json_build_object('success', false, 'error', 'Cannot follow yourself');
    END IF;

    -- Check if either user has blocked the other
    IF EXISTS (
        SELECT 1 FROM user_blocks
        WHERE (blocker_id = current_user_id AND blocked_id = target_user_id)
           OR (blocker_id = target_user_id AND blocked_id = current_user_id)
    ) THEN
        RETURN json_build_object('success', false, 'error', 'Cannot send follow request');
    END IF;

    -- Get requester profile
    SELECT * INTO requester_profile FROM profiles WHERE id = current_user_id;
    requester_name := COALESCE(requester_profile.first_name, '') || ' ' || COALESCE(requester_profile.last_name, '');
    requester_name := TRIM(requester_name);
    IF requester_name = '' THEN
        requester_name := 'Ein Nutzer';
    END IF;

    -- Get target profile and privacy settings
    SELECT * INTO target_profile FROM profiles WHERE id = target_user_id;
    target_privacy_setting := COALESCE(target_profile.privacy_settings->>'profile_visibility', 'global');

    -- Check ob bereits eine Freundschaft existiert (in beide Richtungen)
    SELECT * INTO existing_friendship
    FROM friendships
    WHERE (requester_id = current_user_id AND addressee_id = target_user_id)
       OR (requester_id = target_user_id AND addressee_id = current_user_id)
    LIMIT 1;

    -- Wenn bereits existiert
    IF existing_friendship.id IS NOT NULL THEN
        IF existing_friendship.status = 'accepted' THEN
            RETURN json_build_object('success', false, 'error', 'Already following');
        ELSIF existing_friendship.status = 'pending' THEN
            -- Wenn die andere Person bereits eine Anfrage gesendet hat
            IF existing_friendship.requester_id = target_user_id THEN
                -- Auto-accept: both want to follow each other
                UPDATE friendships
                SET status = 'accepted', updated_at = NOW()
                WHERE id = existing_friendship.id;

                -- Notification: Mutual follow
                INSERT INTO notifications (user_id, type, title, message, data)
                VALUES (
                    target_user_id,
                    'new_follower',
                    'Neuer Abonnent',
                    requester_name || ' folgt dir jetzt',
                    json_build_object('friendship_id', existing_friendship.id, 'user_id', current_user_id)
                );

                RETURN json_build_object(
                    'success', true,
                    'message', 'Now following (mutual)',
                    'status', 'accepted',
                    'instant', true
                );
            ELSE
                RETURN json_build_object('success', false, 'error', 'Follow request already pending');
            END IF;
        ELSIF existing_friendship.status = 'blocked' THEN
            RETURN json_build_object('success', false, 'error', 'Cannot send follow request');
        END IF;
    END IF;

    -- Determine if auto-accept based on profile_visibility
    IF target_privacy_setting = 'global' THEN
        should_auto_accept := true;
    ELSIF target_privacy_setting = 'club_only' THEN
        IF requester_profile.club_id IS NOT NULL
           AND target_profile.club_id IS NOT NULL
           AND requester_profile.club_id = target_profile.club_id THEN
            should_auto_accept := true;
        ELSE
            should_auto_accept := false;
        END IF;
    ELSIF target_privacy_setting = 'followers_only' THEN
        IF EXISTS (
            SELECT 1 FROM friendships
            WHERE requester_id = target_user_id
            AND addressee_id = current_user_id
            AND status = 'accepted'
        ) THEN
            should_auto_accept := true;
        ELSE
            should_auto_accept := false;
        END IF;
    ELSE
        should_auto_accept := true;
    END IF;

    -- Create friendship with appropriate status
    IF should_auto_accept THEN
        result_status := 'accepted';
        notification_type := 'new_follower';
        notification_title := 'Neuer Abonnent';
        notification_message := requester_name || ' folgt dir jetzt';
    ELSE
        result_status := 'pending';
        notification_type := 'follow_request';
        notification_title := 'Neue Abonnement-Anfrage';
        notification_message := requester_name || ' moechte dir folgen';
    END IF;

    -- Insert new friendship
    INSERT INTO friendships (requester_id, addressee_id, status)
    VALUES (current_user_id, target_user_id, result_status::friendship_status)
    RETURNING id INTO new_friendship_id;

    -- Create notification
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
        target_user_id,
        notification_type,
        notification_title,
        notification_message,
        json_build_object(
            'friendship_id', new_friendship_id,
            'requester_id', current_user_id,
            'requires_action', NOT should_auto_accept
        )
    );

    result := json_build_object(
        'success', true,
        'message', CASE WHEN should_auto_accept THEN 'Now following' ELSE 'Follow request sent' END,
        'status', result_status,
        'friendship_id', new_friendship_id,
        'instant', should_auto_accept
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- UPDATE search_players TO EXCLUDE BLOCKED USERS
-- ============================================

CREATE OR REPLACE FUNCTION search_players(
    search_query TEXT,
    current_user_id UUID,
    limit_count INT DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    club_id UUID,
    club_name TEXT,
    elo_rating INT,
    is_friend BOOLEAN,
    friendship_status friendship_status
) AS $$
DECLARE
    current_user_club_id UUID;
BEGIN
    -- Get current user's club_id once
    SELECT p.club_id INTO current_user_club_id FROM profiles p WHERE p.id = current_user_id;

    RETURN QUERY
    SELECT
        p.id,
        p.first_name,
        p.last_name,
        p.avatar_url,
        p.club_id,
        c.name as club_name,
        p.elo_rating,
        -- Check if already friends
        EXISTS (
            SELECT 1 FROM friendships f
            WHERE (f.requester_id = current_user_id AND f.addressee_id = p.id)
               OR (f.requester_id = p.id AND f.addressee_id = current_user_id)
        ) as is_friend,
        -- Get friendship status if exists
        (
            SELECT f.status FROM friendships f
            WHERE (f.requester_id = current_user_id AND f.addressee_id = p.id)
               OR (f.requester_id = p.id AND f.addressee_id = current_user_id)
            LIMIT 1
        ) as friendship_status
    FROM profiles p
    LEFT JOIN clubs c ON p.club_id = c.id
    WHERE
        -- Not the current user
        p.id != current_user_id
        -- Exclude blocked users (in both directions)
        AND NOT EXISTS (
            SELECT 1 FROM user_blocks ub
            WHERE (ub.blocker_id = current_user_id AND ub.blocked_id = p.id)
               OR (ub.blocker_id = p.id AND ub.blocked_id = current_user_id)
        )
        -- Search filter
        AND (
            p.first_name ILIKE '%' || search_query || '%'
            OR p.last_name ILIKE '%' || search_query || '%'
            OR (p.first_name || ' ' || p.last_name) ILIKE '%' || search_query || '%'
        )
        -- Privacy filter
        AND (
            (p.privacy_settings->>'searchable' = 'global' OR p.privacy_settings->>'searchable' = 'true')
            OR (
                p.privacy_settings->>'searchable' = 'club_only'
                AND p.club_id IS NOT NULL
                AND p.club_id = current_user_club_id
            )
            OR (
                p.privacy_settings->>'searchable' = 'friends_only'
                AND EXISTS (
                    SELECT 1 FROM friendships f2
                    WHERE ((f2.requester_id = current_user_id AND f2.addressee_id = p.id)
                        OR (f2.requester_id = p.id AND f2.addressee_id = current_user_id))
                    AND f2.status = 'accepted'
                )
            )
        )
    ORDER BY
        -- Friends first
        CASE WHEN EXISTS (
            SELECT 1 FROM friendships f3
            WHERE ((f3.requester_id = current_user_id AND f3.addressee_id = p.id)
                OR (f3.requester_id = p.id AND f3.addressee_id = current_user_id))
            AND f3.status = 'accepted'
        ) THEN 0 ELSE 1 END,
        p.first_name, p.last_name
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

DROP TRIGGER IF EXISTS update_content_reports_updated_at ON content_reports;
CREATE TRIGGER update_content_reports_updated_at
BEFORE UPDATE ON content_reports
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();


-- ============================================
-- NOTIFY COACHES ON NEW REPORT
-- ============================================

-- Function to notify coaches when a new report is created
CREATE OR REPLACE FUNCTION notify_coaches_on_report()
RETURNS TRIGGER AS $$
DECLARE
    reporter_name TEXT;
    reported_name TEXT;
    report_type_label TEXT;
    content_type_label TEXT;
    coach_record RECORD;
BEGIN
    -- Get reporter name
    SELECT COALESCE(first_name || ' ' || last_name, 'Unbekannt')
    INTO reporter_name
    FROM profiles WHERE id = NEW.reporter_id;

    -- Get reported user name
    SELECT COALESCE(first_name || ' ' || last_name, 'Unbekannt')
    INTO reported_name
    FROM profiles WHERE id = NEW.reported_user_id;

    -- Map report type to German label
    report_type_label := CASE NEW.report_type
        WHEN 'spam' THEN 'Spam'
        WHEN 'harassment' THEN 'Belästigung'
        WHEN 'hate_speech' THEN 'Hassrede'
        WHEN 'violence' THEN 'Gewalt'
        WHEN 'inappropriate_content' THEN 'Unangemessener Inhalt'
        WHEN 'impersonation' THEN 'Identitätsdiebstahl'
        WHEN 'misinformation' THEN 'Fehlinformation'
        ELSE 'Sonstiges'
    END;

    -- Map content type to German label
    content_type_label := CASE NEW.content_type::TEXT
        WHEN 'user' THEN 'Nutzer'
        WHEN 'post' THEN 'Beitrag'
        WHEN 'poll' THEN 'Umfrage'
        WHEN 'comment' THEN 'Kommentar'
        ELSE 'Inhalt'
    END;

    -- Create notification for all coaches in the reporter's club
    FOR coach_record IN
        SELECT p.id
        FROM profiles p
        WHERE p.role IN ('coach', 'admin', 'head_coach')
        AND (
            -- Same club as reporter
            p.club_id = (SELECT club_id FROM profiles WHERE id = NEW.reporter_id)
            -- Or same club as reported user
            OR p.club_id = (SELECT club_id FROM profiles WHERE id = NEW.reported_user_id)
        )
    LOOP
        INSERT INTO notifications (
            user_id,
            type,
            title,
            message,
            data
        ) VALUES (
            coach_record.id,
            'content_report',
            'Neue Meldung eingegangen',
            reporter_name || ' hat einen ' || content_type_label || ' gemeldet (' || report_type_label || ')',
            json_build_object(
                'report_id', NEW.id,
                'reporter_id', NEW.reporter_id,
                'reported_user_id', NEW.reported_user_id,
                'content_type', NEW.content_type,
                'report_type', NEW.report_type,
                'url', '/admin-reports.html'
            )
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to notify coaches on new report
DROP TRIGGER IF EXISTS trigger_notify_coaches_on_report ON content_reports;
CREATE TRIGGER trigger_notify_coaches_on_report
AFTER INSERT ON content_reports
FOR EACH ROW
EXECUTE FUNCTION notify_coaches_on_report();


-- ============================================
-- Done! Block and Report system is ready.
-- ============================================
