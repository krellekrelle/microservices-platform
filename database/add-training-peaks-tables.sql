-- Training Peaks Service Database Schema
-- This script adds tables for storing TrainingPeaks user credentials and training data

-- User credentials for TrainingPeaks (encrypted)
CREATE TABLE IF NOT EXISTS training_peaks_credentials (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    username_encrypted TEXT NOT NULL,
    password_encrypted TEXT NOT NULL,
    iv_username TEXT NOT NULL,
    iv_password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Training sessions data
CREATE TABLE IF NOT EXISTS training_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    type VARCHAR(100) NOT NULL,
    description TEXT,
    duration INTEGER, -- in minutes
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    week_start_date DATE NOT NULL, -- Monday of the training week
    UNIQUE(user_id, date, type, description)
);

-- Scraping logs for monitoring and debugging
CREATE TABLE IF NOT EXISTS training_scraping_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    scrape_type VARCHAR(50) NOT NULL, -- 'weekly', 'retry', 'manual'
    status VARCHAR(20) NOT NULL, -- 'success', 'error', 'warning'
    message TEXT,
    sessions_found INTEGER DEFAULT 0,
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    week_start_date DATE NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_training_sessions_user_date ON training_sessions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_training_sessions_week ON training_sessions(user_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_training_logs_user_date ON training_scraping_logs(user_id, scraped_at);

-- Update timestamp trigger for credentials
CREATE OR REPLACE FUNCTION update_training_credentials_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_training_credentials_timestamp ON training_peaks_credentials;
CREATE TRIGGER update_training_credentials_timestamp
    BEFORE UPDATE ON training_peaks_credentials
    FOR EACH ROW EXECUTE FUNCTION update_training_credentials_timestamp();
