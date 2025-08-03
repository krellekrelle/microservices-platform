-- Add Riot Accounts table to the existing microservices database
-- This extends the current user system to support League of Legends account linking

-- Create riot_accounts table
CREATE TABLE riot_accounts (
    id SERIAL PRIMARY KEY,
    puuid VARCHAR(78) UNIQUE NOT NULL, -- Riot's permanent unique identifier
    summoner_name VARCHAR(100) NOT NULL,
    summoner_tag VARCHAR(5) NOT NULL, -- Riot ID tag (e.g., #EUW)
    region VARCHAR(10) NOT NULL DEFAULT 'europe', -- API region
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_riot_accounts_puuid ON riot_accounts(puuid);
CREATE INDEX idx_riot_accounts_user_id ON riot_accounts(user_id);
CREATE INDEX idx_riot_accounts_summoner_name ON riot_accounts(summoner_name);

-- Add trigger for updating updated_at on riot_accounts
CREATE TRIGGER update_riot_accounts_updated_at 
    BEFORE UPDATE ON riot_accounts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create view for easy riot account management
CREATE VIEW riot_account_management AS
SELECT 
    ra.id,
    ra.puuid,
    ra.summoner_name,
    ra.summoner_tag,
    ra.region,
    u.email,
    u.name as user_name,
    ra.created_at
FROM riot_accounts ra
JOIN users u ON ra.user_id = u.id
ORDER BY ra.created_at DESC;
