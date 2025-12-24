-- ============================================
-- Push Notification Subscriptions Table
-- Stores Web Push subscriptions for PWA notifications
-- ============================================

-- Create the push_subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,  -- Public key for encryption
    auth TEXT NOT NULL,     -- Auth secret for encryption
    user_agent TEXT,        -- Browser/device info
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only see their own subscriptions
CREATE POLICY "Users can view own push subscriptions"
ON push_subscriptions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own subscriptions
CREATE POLICY "Users can insert own push subscriptions"
ON push_subscriptions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own subscriptions
CREATE POLICY "Users can update own push subscriptions"
ON push_subscriptions FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own subscriptions
CREATE POLICY "Users can delete own push subscriptions"
ON push_subscriptions FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_push_subscription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updating timestamp
DROP TRIGGER IF EXISTS update_push_subscription_timestamp ON push_subscriptions;
CREATE TRIGGER update_push_subscription_timestamp
    BEFORE UPDATE ON push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_push_subscription_timestamp();

-- ============================================
-- Notification Preferences (extend existing user_preferences or create new)
-- ============================================

-- Add notification preferences columns to profiles if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'profiles' AND column_name = 'push_notifications_enabled') THEN
        ALTER TABLE profiles ADD COLUMN push_notifications_enabled BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'profiles' AND column_name = 'push_notify_matches') THEN
        ALTER TABLE profiles ADD COLUMN push_notify_matches BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'profiles' AND column_name = 'push_notify_rankings') THEN
        ALTER TABLE profiles ADD COLUMN push_notify_rankings BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'profiles' AND column_name = 'push_notify_social') THEN
        ALTER TABLE profiles ADD COLUMN push_notify_social BOOLEAN DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'profiles' AND column_name = 'push_notify_club') THEN
        ALTER TABLE profiles ADD COLUMN push_notify_club BOOLEAN DEFAULT true;
    END IF;
END $$;

-- ============================================
-- Function to get push subscriptions for a user
-- ============================================

CREATE OR REPLACE FUNCTION get_user_push_subscriptions(p_user_id UUID)
RETURNS TABLE (
    endpoint TEXT,
    p256dh TEXT,
    auth TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT ps.endpoint, ps.p256dh, ps.auth
    FROM push_subscriptions ps
    WHERE ps.user_id = p_user_id
      AND ps.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function to send push notification (called by Edge Function)
-- This just marks the last_used_at timestamp
-- ============================================

CREATE OR REPLACE FUNCTION mark_push_subscription_used(p_endpoint TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE push_subscriptions
    SET last_used_at = now()
    WHERE endpoint = p_endpoint;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function to deactivate invalid subscriptions
-- Called when push fails (subscription expired)
-- ============================================

CREATE OR REPLACE FUNCTION deactivate_push_subscription(p_endpoint TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE push_subscriptions
    SET is_active = false
    WHERE endpoint = p_endpoint;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
