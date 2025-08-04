-- Migration script to add match sync tracking system
-- Run this script to add the background sync functionality

-- Create match_sync_status table
CREATE TABLE IF NOT EXISTS match_sync_status (
    account_id INT PRIMARY KEY REFERENCES riot_accounts(id) ON DELETE CASCADE,
    last_sync_timestamp BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM DATE '2024-06-01') * 1000,
    sync_status VARCHAR(20) DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'complete', 'error')),
    backfill_complete BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_match_sync_status_sync_status ON match_sync_status(sync_status);
CREATE INDEX IF NOT EXISTS idx_match_sync_status_backfill ON match_sync_status(backfill_complete);
CREATE INDEX IF NOT EXISTS idx_match_sync_status_updated ON match_sync_status(updated_at);

-- Initialize sync status for all existing riot accounts
INSERT INTO match_sync_status (account_id, last_sync_timestamp)
SELECT 
    id,
    EXTRACT(EPOCH FROM DATE '2024-06-01') * 1000 -- June 1, 2024 in milliseconds
FROM riot_accounts
WHERE id NOT IN (SELECT account_id FROM match_sync_status);

-- Add a trigger to automatically create sync status for new riot accounts
CREATE OR REPLACE FUNCTION create_sync_status_for_new_account()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO match_sync_status (account_id, last_sync_timestamp)
    VALUES (NEW.id, EXTRACT(EPOCH FROM DATE '2024-06-01') * 1000);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists and recreate
DROP TRIGGER IF EXISTS trigger_create_sync_status ON riot_accounts;
CREATE TRIGGER trigger_create_sync_status
    AFTER INSERT ON riot_accounts
    FOR EACH ROW
    EXECUTE FUNCTION create_sync_status_for_new_account();

-- Verify the setup
SELECT 
    'Total riot accounts' as description,
    COUNT(*) as count
FROM riot_accounts
UNION ALL
SELECT 
    'Accounts with sync status' as description,
    COUNT(*) as count
FROM match_sync_status
UNION ALL
SELECT 
    'Accounts pending sync' as description,
    COUNT(*) as count
FROM match_sync_status 
WHERE sync_status = 'pending';
