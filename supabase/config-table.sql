-- Create config table for application settings
-- This table stores key-value pairs for global configuration

CREATE TABLE IF NOT EXISTS config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read config (public data)
CREATE POLICY "config_read_all" ON config
    FOR SELECT
    USING (true);

-- Only admins can modify config
CREATE POLICY "config_admin_modify" ON config
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Insert season reset config
-- lastResetDate: November 11, 2025 at 15:49:00 UTC (16:49:00 UTC+1)
INSERT INTO config (key, value)
VALUES (
    'seasonReset',
    '{"lastResetDate": "2025-11-11T15:49:00.000Z"}'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();

-- Create trigger to update updated_at on config changes
CREATE OR REPLACE FUNCTION update_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS config_updated_at ON config;
CREATE TRIGGER config_updated_at
    BEFORE UPDATE ON config
    FOR EACH ROW
    EXECUTE FUNCTION update_config_updated_at();
