-- ============================================
-- FRIENDSHIPS (Freundschaftssystem)
-- ============================================

-- Enum für Freundschafts-Status (nur erstellen wenn nicht existiert)
DO $$ BEGIN
    CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'blocked');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Friendships Tabelle
CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Initiator der Freundschaftsanfrage
    requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Empfänger der Freundschaftsanfrage
    addressee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Status der Freundschaft
    status friendship_status DEFAULT 'pending',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraint: Keine doppelten Freundschaftsanfragen (bidirektional)
    CONSTRAINT unique_friendship UNIQUE (requester_id, addressee_id),

    -- Constraint: Keine Selbst-Freundschaften
    CONSTRAINT no_self_friendship CHECK (requester_id != addressee_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);

-- Compound index für schnelle bidirektionale Suche
CREATE INDEX IF NOT EXISTS idx_friendships_both_users ON friendships(requester_id, addressee_id);

-- ============================================
-- RLS POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own friendships" ON friendships;
DROP POLICY IF EXISTS "Users can create friendship requests" ON friendships;
DROP POLICY IF EXISTS "Users can update friendship status" ON friendships;
DROP POLICY IF EXISTS "Users can delete friendships" ON friendships;

-- Policy: Nutzer können ihre eigenen Freundschaften sehen (als requester oder addressee)
CREATE POLICY "Users can view their own friendships"
ON friendships
FOR SELECT
USING (
    auth.uid() = requester_id
    OR auth.uid() = addressee_id
);

-- Policy: Nutzer können Freundschaftsanfragen erstellen
CREATE POLICY "Users can create friendship requests"
ON friendships
FOR INSERT
WITH CHECK (auth.uid() = requester_id);

-- Policy: Nutzer können Freundschaftsanfragen updaten (annehmen/ablehnen)
-- Nur der addressee kann den Status ändern (von pending -> accepted/blocked)
-- Beide können die Freundschaft löschen (DELETE policy unten)
CREATE POLICY "Users can update friendship status"
ON friendships
FOR UPDATE
USING (
    auth.uid() = addressee_id
    OR auth.uid() = requester_id
);

-- Policy: Nutzer können Freundschaften löschen (als requester oder addressee)
CREATE POLICY "Users can delete friendships"
ON friendships
FOR DELETE
USING (
    auth.uid() = requester_id
    OR auth.uid() = addressee_id
);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

DROP TRIGGER IF EXISTS update_friendships_updated_at ON friendships;
CREATE TRIGGER update_friendships_updated_at
BEFORE UPDATE ON friendships
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- ============================================
-- REALTIME
-- ============================================

-- Enable realtime for friendships table
ALTER PUBLICATION supabase_realtime ADD TABLE friendships;

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- 1. Funktion: Spieler suchen (mit Privacy-Settings)
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
        -- Nicht der aktuelle User selbst
        p.id != current_user_id
        -- Suchfilter
        AND (
            p.first_name ILIKE '%' || search_query || '%'
            OR p.last_name ILIKE '%' || search_query || '%'
            OR (p.first_name || ' ' || p.last_name) ILIKE '%' || search_query || '%'
        )
        -- Privacy-Filter: Nur sichtbare Spieler
        AND (
            -- Global sichtbar
            (p.privacy_settings->>'searchable' = 'global' OR p.privacy_settings->>'searchable' = 'true')
            -- Oder Club-Only und selber Club
            OR (
                p.privacy_settings->>'searchable' = 'club_only'
                AND p.club_id IS NOT NULL
                AND p.club_id = current_user_club_id
            )
            -- Oder Friends-Only und bereits befreundet
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
        -- Freunde zuerst
        CASE WHEN EXISTS (
            SELECT 1 FROM friendships f3
            WHERE ((f3.requester_id = current_user_id AND f3.addressee_id = p.id)
                OR (f3.requester_id = p.id AND f3.addressee_id = current_user_id))
            AND f3.status = 'accepted'
        ) THEN 0 ELSE 1 END,
        -- Dann nach Name
        p.first_name, p.last_name
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Funktion: Freundschaftsanfrage senden
CREATE OR REPLACE FUNCTION send_friend_request(
    current_user_id UUID,
    target_user_id UUID
)
RETURNS JSON AS $$
DECLARE
    existing_friendship friendships%ROWTYPE;
    new_friendship_id UUID;
    requester_name TEXT;
    result JSON;
BEGIN
    -- Validierung: Nicht sich selbst als Freund hinzufügen
    IF current_user_id = target_user_id THEN
        RETURN json_build_object('success', false, 'error', 'Cannot befriend yourself');
    END IF;

    -- Get requester name for notification
    SELECT first_name || ' ' || last_name INTO requester_name
    FROM profiles WHERE id = current_user_id;

    -- Check ob bereits eine Freundschaft existiert (in beide Richtungen)
    SELECT * INTO existing_friendship
    FROM friendships
    WHERE (requester_id = current_user_id AND addressee_id = target_user_id)
       OR (requester_id = target_user_id AND addressee_id = current_user_id)
    LIMIT 1;

    -- Wenn bereits existiert
    IF existing_friendship.id IS NOT NULL THEN
        IF existing_friendship.status = 'accepted' THEN
            RETURN json_build_object('success', false, 'error', 'Already friends');
        ELSIF existing_friendship.status = 'pending' THEN
            -- Wenn die andere Person bereits eine Anfrage gesendet hat, direkt akzeptieren
            IF existing_friendship.requester_id = target_user_id THEN
                UPDATE friendships
                SET status = 'accepted', updated_at = NOW()
                WHERE id = existing_friendship.id;

                -- Benachrichtigung: Anfrage wurde gegenseitig akzeptiert
                INSERT INTO notifications (user_id, type, title, message, data)
                VALUES (
                    target_user_id,
                    'friend_request_accepted',
                    'Freundschaft bestätigt',
                    requester_name || ' hat deine Freundschaftsanfrage akzeptiert!',
                    json_build_object('friendship_id', existing_friendship.id, 'user_id', current_user_id)
                );

                RETURN json_build_object(
                    'success', true,
                    'message', 'Friend request accepted (mutual)',
                    'status', 'accepted'
                );
            ELSE
                RETURN json_build_object('success', false, 'error', 'Friend request already pending');
            END IF;
        ELSIF existing_friendship.status = 'blocked' THEN
            RETURN json_build_object('success', false, 'error', 'Cannot send friend request');
        END IF;
    END IF;

    -- Neue Freundschaftsanfrage erstellen
    INSERT INTO friendships (requester_id, addressee_id, status)
    VALUES (current_user_id, target_user_id, 'pending')
    RETURNING id INTO new_friendship_id;

    -- Benachrichtigung erstellen
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
        target_user_id,
        'friend_request',
        'Neue Freundschaftsanfrage',
        requester_name || ' möchte mit dir befreundet sein',
        json_build_object('friendship_id', new_friendship_id, 'requester_id', current_user_id)
    );

    result := json_build_object(
        'success', true,
        'message', 'Friend request sent',
        'status', 'pending',
        'friendship_id', new_friendship_id
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Funktion: Freundschaftsanfrage akzeptieren
CREATE OR REPLACE FUNCTION accept_friend_request(
    current_user_id UUID,
    friendship_id UUID
)
RETURNS JSON AS $$
DECLARE
    friendship friendships%ROWTYPE;
    accepter_name TEXT;
BEGIN
    -- Freundschaft abrufen
    SELECT * INTO friendship
    FROM friendships
    WHERE id = friendship_id
    AND addressee_id = current_user_id
    AND status = 'pending';

    IF friendship.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Friend request not found or not pending');
    END IF;

    -- Get accepter name for notification
    SELECT first_name || ' ' || last_name INTO accepter_name
    FROM profiles WHERE id = current_user_id;

    -- Status auf 'accepted' setzen
    UPDATE friendships
    SET status = 'accepted', updated_at = NOW()
    WHERE id = friendship_id;

    -- Benachrichtigung an den ursprünglichen Requester senden
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
        friendship.requester_id,
        'friend_request_accepted',
        'Freundschaftsanfrage akzeptiert',
        accepter_name || ' hat deine Freundschaftsanfrage akzeptiert!',
        json_build_object('friendship_id', friendship_id, 'user_id', current_user_id)
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Friend request accepted',
        'friendship_id', friendship_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Funktion: Freundschaftsanfrage ablehnen
CREATE OR REPLACE FUNCTION decline_friend_request(
    current_user_id UUID,
    friendship_id UUID
)
RETURNS JSON AS $$
DECLARE
    friendship friendships%ROWTYPE;
BEGIN
    -- Freundschaft abrufen
    SELECT * INTO friendship
    FROM friendships
    WHERE id = friendship_id
    AND addressee_id = current_user_id
    AND status = 'pending';

    IF friendship.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Friend request not found or not pending');
    END IF;

    -- Anfrage löschen (statt auf 'rejected' setzen)
    DELETE FROM friendships WHERE id = friendship_id;

    RETURN json_build_object(
        'success', true,
        'message', 'Friend request declined'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Funktion: Freund entfernen
CREATE OR REPLACE FUNCTION remove_friend(
    current_user_id UUID,
    friend_id UUID
)
RETURNS JSON AS $$
DECLARE
    deleted_count INT;
BEGIN
    -- Freundschaft löschen (bidirektional)
    DELETE FROM friendships
    WHERE ((requester_id = current_user_id AND addressee_id = friend_id)
        OR (requester_id = friend_id AND addressee_id = current_user_id))
    AND status = 'accepted';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Friendship not found');
    END IF;

    RETURN json_build_object(
        'success', true,
        'message', 'Friend removed'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Funktion: Freunde abrufen
CREATE OR REPLACE FUNCTION get_friends(current_user_id UUID)
RETURNS TABLE (
    id UUID,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    club_id UUID,
    club_name TEXT,
    elo_rating INT,
    friendship_id UUID,
    friendship_created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.first_name,
        p.last_name,
        p.avatar_url,
        p.club_id,
        c.name as club_name,
        p.elo_rating,
        f.id as friendship_id,
        f.created_at as friendship_created_at
    FROM friendships f
    INNER JOIN profiles p ON (
        CASE
            WHEN f.requester_id = current_user_id THEN p.id = f.addressee_id
            ELSE p.id = f.requester_id
        END
    )
    LEFT JOIN clubs c ON p.club_id = c.id
    WHERE (f.requester_id = current_user_id OR f.addressee_id = current_user_id)
    AND f.status = 'accepted'
    ORDER BY p.first_name, p.last_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Funktion: Ausstehende Freundschaftsanfragen abrufen
CREATE OR REPLACE FUNCTION get_pending_friend_requests(current_user_id UUID)
RETURNS TABLE (
    id UUID,
    requester_id UUID,
    requester_first_name TEXT,
    requester_last_name TEXT,
    requester_avatar_url TEXT,
    requester_club_id UUID,
    requester_club_name TEXT,
    requester_elo_rating INT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        p.id as requester_id,
        p.first_name as requester_first_name,
        p.last_name as requester_last_name,
        p.avatar_url as requester_avatar_url,
        p.club_id as requester_club_id,
        c.name as requester_club_name,
        p.elo_rating as requester_elo_rating,
        f.created_at
    FROM friendships f
    INNER JOIN profiles p ON p.id = f.requester_id
    LEFT JOIN clubs c ON p.club_id = c.id
    WHERE f.addressee_id = current_user_id
    AND f.status = 'pending'
    ORDER BY f.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Funktion: Gesendete Freundschaftsanfragen abrufen
CREATE OR REPLACE FUNCTION get_sent_friend_requests(current_user_id UUID)
RETURNS TABLE (
    id UUID,
    addressee_id UUID,
    addressee_first_name TEXT,
    addressee_last_name TEXT,
    addressee_avatar_url TEXT,
    addressee_club_id UUID,
    addressee_club_name TEXT,
    addressee_elo_rating INT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        f.id,
        p.id as addressee_id,
        p.first_name as addressee_first_name,
        p.last_name as addressee_last_name,
        p.avatar_url as addressee_avatar_url,
        p.club_id as addressee_club_id,
        c.name as addressee_club_name,
        p.elo_rating as addressee_elo_rating,
        f.created_at
    FROM friendships f
    INNER JOIN profiles p ON p.id = f.addressee_id
    LEFT JOIN clubs c ON p.club_id = c.id
    WHERE f.requester_id = current_user_id
    AND f.status = 'pending'
    ORDER BY f.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
