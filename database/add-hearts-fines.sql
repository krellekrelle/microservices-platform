-- Add Hearts Fines system
-- Tracks fines for hearts games with fine club membership feature

-- Add member_of_fineclub column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS member_of_fineclub BOOLEAN DEFAULT FALSE;

-- Add fines_calculated flag to hearts_games table
ALTER TABLE hearts_games 
ADD COLUMN IF NOT EXISTS fines_calculated BOOLEAN DEFAULT FALSE;

-- Create hearts_fines table
CREATE TABLE IF NOT EXISTS hearts_fines (
    id SERIAL PRIMARY KEY,
    fine_size INTEGER NOT NULL, -- Points / 4, rounded up
    date TIMESTAMP WITH TIME ZONE NOT NULL, -- When game ended
    game_id VARCHAR(255) REFERENCES hearts_games(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    is_participant BOOLEAN DEFAULT TRUE, -- TRUE if played in game, FALSE if fine club non-participant
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_hearts_fines_game_id ON hearts_fines(game_id);
CREATE INDEX IF NOT EXISTS idx_hearts_fines_user_id ON hearts_fines(user_id);
CREATE INDEX IF NOT EXISTS idx_hearts_fines_date ON hearts_fines(date);

-- Create view for combined user fines (LoL + Hearts)
CREATE OR REPLACE VIEW user_fines_summary AS
SELECT 
    u.id as user_id,
    u.name,
    u.email,
    u.member_of_fineclub,
    COALESCE(SUM(lf.fine_size), 0) as total_lol_fines,
    COALESCE(SUM(hf.fine_size), 0) as total_hearts_fines,
    COALESCE(SUM(lf.fine_size), 0) + COALESCE(SUM(hf.fine_size), 0) as total_all_fines,
    COUNT(DISTINCT lf.id) as lol_fine_count,
    COUNT(DISTINCT hf.id) as hearts_fine_count
FROM users u
LEFT JOIN lol_fines lf ON u.id = lf.user_id
LEFT JOIN hearts_fines hf ON u.id = hf.user_id
GROUP BY u.id, u.name, u.email, u.member_of_fineclub
ORDER BY total_all_fines DESC;
