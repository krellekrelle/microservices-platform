-- Add user devices table for Garmin device sync functionality
-- This table stores user's connected Garmin devices and their workout sync preferences

CREATE TABLE IF NOT EXISTS user_devices (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    device_name VARCHAR(255) NOT NULL,
    device_type VARCHAR(255),
    device_type_display_name VARCHAR(255),
    workout_push_enabled BOOLEAN DEFAULT false,
    battery_level INTEGER,
    battery_status VARCHAR(50),
    last_sync_time TIMESTAMP,
    firmware_version VARCHAR(100),
    software_version VARCHAR(100),
    connection_type VARCHAR(50),
    primary_device BOOLEAN DEFAULT false,
    sync_capable BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, device_id)
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_push_enabled ON user_devices(user_id, workout_push_enabled);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_devices_updated_at
    BEFORE UPDATE ON user_devices
    FOR EACH ROW
    EXECUTE FUNCTION update_user_devices_updated_at();
