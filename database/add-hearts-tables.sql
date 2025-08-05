-- Add Hearts Game tables to the existing microservices database
-- This extends the current user system to support Hearts card game functionality

-- Lobby and Game Sessions
CREATE TABLE IF NOT EXISTS hearts_games (
    id VARCHAR(255) PRIMARY KEY, -- UUID for game identification
    lobby_leader_id INTEGER REFERENCES users(id),
    game_state VARCHAR(20) DEFAULT 'lobby', -- lobby, passing, playing, finished, abandoned
    current_round INTEGER DEFAULT 1,
    current_trick INTEGER DEFAULT 0,
    hearts_broken BOOLEAN DEFAULT FALSE,
    pass_direction VARCHAR(10), -- left, right, across, none
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    winner_id INTEGER REFERENCES users(id),
    abandoned_reason TEXT -- disconnections, timeout, etc.
);

-- Player Seats and Game Participation
CREATE TABLE IF NOT EXISTS hearts_players (
    id SERIAL PRIMARY KEY,
    game_id VARCHAR(255) REFERENCES hearts_games(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    seat_position INTEGER CHECK (seat_position >= 0 AND seat_position <= 3),
    is_ready BOOLEAN DEFAULT FALSE,
    is_connected BOOLEAN DEFAULT TRUE,
    current_score INTEGER DEFAULT 0,
    round_score INTEGER DEFAULT 0,
    hand_cards TEXT, -- JSON array of card objects
    is_bot BOOLEAN DEFAULT FALSE,
    bot_difficulty VARCHAR(10) DEFAULT 'medium', -- easy, medium, hard
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, seat_position),
    UNIQUE(game_id, user_id)
);

-- Individual Tricks (for detailed game tracking)
CREATE TABLE IF NOT EXISTS hearts_tricks (
    id SERIAL PRIMARY KEY,
    game_id VARCHAR(255) REFERENCES hearts_games(id) ON DELETE CASCADE,
    round_number INTEGER,
    trick_number INTEGER,
    leader_seat INTEGER, -- who led the trick
    winner_seat INTEGER, -- who won the trick
    cards_played TEXT, -- JSON: [{seat: 0, card: "2C"}, {seat: 1, card: "3D"}, ...]
    points_in_trick INTEGER, -- hearts + queen of spades points
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Card Passing Tracking (for future analytics)
CREATE TABLE IF NOT EXISTS hearts_card_passes (
    id SERIAL PRIMARY KEY,
    game_id VARCHAR(255) REFERENCES hearts_games(id) ON DELETE CASCADE,
    round_number INTEGER,
    from_seat INTEGER,
    to_seat INTEGER,
    cards_passed TEXT, -- JSON array: ["AH", "KS", "QD"]
    pass_direction VARCHAR(10), -- left, right, across
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Game Results and Statistics
CREATE TABLE IF NOT EXISTS hearts_game_results (
    id SERIAL PRIMARY KEY,
    game_id VARCHAR(255) REFERENCES hearts_games(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    seat_position INTEGER,
    final_score INTEGER,
    place_finished INTEGER, -- 1st, 2nd, 3rd, 4th
    hearts_taken INTEGER,
    queen_taken BOOLEAN DEFAULT FALSE,
    shot_moon INTEGER DEFAULT 0, -- number of times shot the moon
    tricks_won INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Spectators (users watching but not playing)
CREATE TABLE IF NOT EXISTS hearts_spectators (
    id SERIAL PRIMARY KEY,
    game_id VARCHAR(255) REFERENCES hearts_games(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_hearts_games_state ON hearts_games(game_state);
CREATE INDEX IF NOT EXISTS idx_hearts_games_created ON hearts_games(created_at);
CREATE INDEX IF NOT EXISTS idx_hearts_players_game_seat ON hearts_players(game_id, seat_position);
CREATE INDEX IF NOT EXISTS idx_hearts_players_user ON hearts_players(user_id);
CREATE INDEX IF NOT EXISTS idx_hearts_tricks_game_round ON hearts_tricks(game_id, round_number, trick_number);
CREATE INDEX IF NOT EXISTS idx_hearts_results_user ON hearts_game_results(user_id);

-- Create view for Hearts game statistics
CREATE VIEW hearts_player_stats AS
SELECT 
    u.id as user_id,
    u.name,
    u.email,
    COUNT(hgr.id) as games_played,
    AVG(hgr.final_score) as avg_score,
    SUM(CASE WHEN hgr.place_finished = 1 THEN 1 ELSE 0 END) as wins,
    SUM(hgr.shot_moon) as moons_shot,
    SUM(hgr.hearts_taken) as total_hearts,
    SUM(CASE WHEN hgr.queen_taken THEN 1 ELSE 0 END) as queens_taken
FROM users u
LEFT JOIN hearts_game_results hgr ON u.id = hgr.user_id
LEFT JOIN hearts_games hg ON hgr.game_id = hg.id
WHERE hg.game_state = 'finished' OR hg.game_state IS NULL
GROUP BY u.id, u.name, u.email;
