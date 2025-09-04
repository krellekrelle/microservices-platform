-- Add Garmin Connect integration tables
-- Migration: 002_add_garmin_tables.sql

-- Table for storing Garmin Connect credentials (user-managed)
CREATE TABLE IF NOT EXISTS garmin_credentials (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(255) NOT NULL, -- Garmin Connect username
    password_encrypted TEXT NOT NULL, -- Encrypted Garmin Connect password
    iv_password VARCHAR(32), -- Initialization vector for password encryption/decryption
    is_active BOOLEAN DEFAULT true,
    last_successful_auth TIMESTAMP,
    auth_failures INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id) -- One Garmin account per platform user
);

-- Table for tracking workout sync to Garmin
CREATE TABLE IF NOT EXISTS garmin_workout_sync (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    training_session_id INTEGER REFERENCES training_sessions(id) ON DELETE CASCADE,
    garmin_workout_id VARCHAR(255), -- Workout ID from Garmin Connect
    workout_name VARCHAR(500),
    sync_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'success', 'failed', 'skipped'
    sync_attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_completed_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    workout_data JSONB, -- Store the workout structure that was sent
    garmin_response JSONB, -- Store response from Garmin API
    UNIQUE(training_session_id) -- One sync record per training session
);

-- Table for storing Garmin sync logs and debugging
CREATE TABLE IF NOT EXISTS garmin_sync_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    sync_type VARCHAR(50) NOT NULL, -- 'manual', 'automatic', 'test'
    action VARCHAR(50) NOT NULL, -- 'auth', 'create_workout', 'list_workouts'
    success BOOLEAN DEFAULT false,
    error_message TEXT,
    request_data JSONB,
    response_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add garmin_synced column to existing training_sessions table if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'training_sessions' 
        AND column_name = 'garmin_synced'
    ) THEN
        ALTER TABLE training_sessions ADD COLUMN garmin_synced BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Add garmin_sync_attempted column to track sync attempts
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'training_sessions' 
        AND column_name = 'garmin_sync_attempted'
    ) THEN
        ALTER TABLE training_sessions ADD COLUMN garmin_sync_attempted TIMESTAMP;
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_garmin_credentials_user_active ON garmin_credentials(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_garmin_workout_sync_user_status ON garmin_workout_sync(user_id, sync_status);
CREATE INDEX IF NOT EXISTS idx_garmin_workout_sync_session ON garmin_workout_sync(training_session_id);
CREATE INDEX IF NOT EXISTS idx_garmin_sync_logs_user_type ON garmin_sync_logs(user_id, sync_type);
CREATE INDEX IF NOT EXISTS idx_training_sessions_garmin_sync ON training_sessions(user_id, garmin_synced);

-- Create a view for easy querying of training sessions with Garmin sync status
CREATE OR REPLACE VIEW training_sessions_with_garmin_status AS
SELECT 
    ts.*,
    gws.sync_status as garmin_sync_status,
    gws.garmin_workout_id,
    gws.sync_completed_at as garmin_sync_completed_at,
    gws.error_message as garmin_sync_error
FROM training_sessions ts
LEFT JOIN garmin_workout_sync gws ON ts.id = gws.training_session_id;

COMMENT ON TABLE garmin_credentials IS 'User Garmin Connect credentials for workout synchronization';
COMMENT ON TABLE garmin_workout_sync IS 'Tracking table for workout synchronization to Garmin Connect';
COMMENT ON TABLE garmin_sync_logs IS 'Detailed logs for Garmin API interactions and debugging';
COMMENT ON VIEW training_sessions_with_garmin_status IS 'Training sessions with their Garmin sync status for easy querying';
COMMENT ON COLUMN garmin_credentials.iv_password IS 'Initialization vector for password encryption/decryption';
