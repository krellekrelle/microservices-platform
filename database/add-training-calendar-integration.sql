-- Phase 2: Apple Calendar Integration
-- Add calendar sync tracking and user settings tables

-- Calendar sync logs table
CREATE TABLE IF NOT EXISTS calendar_sync_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    sync_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sessions_processed INTEGER NOT NULL DEFAULT 0,
    events_created INTEGER NOT NULL DEFAULT 0,
    sync_type VARCHAR(50) NOT NULL DEFAULT 'apple_calendar', -- apple_calendar, google_calendar, etc.
    settings JSONB, -- User preferences for sync
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, completed, failed
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Calendar user settings table
CREATE TABLE IF NOT EXISTS calendar_user_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE,
    calendar_provider VARCHAR(50) NOT NULL DEFAULT 'apple_calendar',
    default_training_time TIME DEFAULT '07:00:00',
    default_location VARCHAR(255),
    timezone VARCHAR(100) DEFAULT 'Europe/Copenhagen',
    reminder_settings JSONB DEFAULT '[
        {"minutes": 60, "description": "1 hour before training"},
        {"minutes": 15, "description": "15 minutes before training"}
    ]'::jsonb,
    auto_sync_enabled BOOLEAN DEFAULT true,
    calendar_url TEXT, -- CalDAV URL if applicable
    last_sync TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Calendar events tracking table
CREATE TABLE IF NOT EXISTS calendar_events (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL REFERENCES training_sessions(id),
    event_id VARCHAR(255) NOT NULL, -- External calendar event ID
    calendar_provider VARCHAR(50) NOT NULL DEFAULT 'apple_calendar',
    event_title VARCHAR(500),
    event_start TIMESTAMP NOT NULL,
    event_end TIMESTAMP NOT NULL,
    sync_status VARCHAR(20) DEFAULT 'created', -- created, updated, deleted, failed
    last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_calendar_sync_logs_user_id ON calendar_sync_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_logs_sync_date ON calendar_sync_logs(sync_date);
CREATE INDEX IF NOT EXISTS idx_calendar_user_settings_user_id ON calendar_user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_session ON calendar_events(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_event_id ON calendar_events(event_id);

-- Add some useful views
CREATE OR REPLACE VIEW calendar_sync_summary AS
SELECT 
    cus.user_id,
    COUNT(DISTINCT csl.id) as total_syncs,
    SUM(csl.events_created) as total_events_created,
    MAX(csl.sync_date) as last_sync_date,
    COUNT(DISTINCT ce.id) as active_calendar_events,
    cus.auto_sync_enabled,
    cus.calendar_provider
FROM calendar_user_settings cus
LEFT JOIN calendar_sync_logs csl ON cus.user_id = csl.user_id
LEFT JOIN calendar_events ce ON cus.user_id = ce.user_id AND ce.sync_status = 'created'
GROUP BY cus.user_id, cus.auto_sync_enabled, cus.calendar_provider;

-- Insert default calendar settings for existing users (if any)
INSERT INTO calendar_user_settings (user_id, calendar_provider, default_training_time, timezone)
SELECT 1, 'apple_calendar', '07:00:00', 'Europe/Copenhagen'
WHERE NOT EXISTS (SELECT 1 FROM calendar_user_settings WHERE user_id = 1);

-- Add helpful comments
COMMENT ON TABLE calendar_sync_logs IS 'Tracks calendar synchronization operations and results';
COMMENT ON TABLE calendar_user_settings IS 'User preferences for calendar integration';
COMMENT ON TABLE calendar_events IS 'Maps training sessions to calendar events for tracking';
COMMENT ON COLUMN calendar_user_settings.reminder_settings IS 'JSON array of reminder configurations with minutes and descriptions';
COMMENT ON COLUMN calendar_user_settings.calendar_url IS 'CalDAV URL for Apple Calendar or other providers';

-- Add a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_calendar_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_calendar_user_settings_updated_at
    BEFORE UPDATE ON calendar_user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_calendar_settings_updated_at();
