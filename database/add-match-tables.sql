-- Add match tracking tables to support League of Legends match data
-- This matches the C# models from lol-bødekasse-service

-- Create matches table (based on Match.cs)
CREATE TABLE lol_matches (
    match_id VARCHAR(20) PRIMARY KEY, -- MatchId
    data_version VARCHAR(10), -- DataVersion
    end_of_game_result VARCHAR(20), -- EndOfGameResult
    game_creation BIGINT, -- GameCreation
    game_duration INTEGER, -- GameDuration
    game_end_timestamp BIGINT, -- GameEndTimestamp
    game_start_timestamp BIGINT, -- GameStartTimestamp
    game_id BIGINT, -- GameId
    game_mode VARCHAR(20), -- GameMode
    game_name VARCHAR(50), -- GameName
    game_type VARCHAR(20), -- GameType
    game_version VARCHAR(20), -- GameVersion
    map_id INTEGER, -- MapId
    queue_id INTEGER, -- QueueId
    platform_id VARCHAR(10), -- PlatformId
    loaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create participants table (based on Participant.cs)
CREATE TABLE lol_participants (
    participant_primary_key SERIAL PRIMARY KEY, -- ParticipantPrimaryKey
    match_id VARCHAR(20) REFERENCES lol_matches(match_id) ON DELETE CASCADE, -- MatchId FK
    participant_id INTEGER, -- ParticipantId (1-10 in each match)
    puuid VARCHAR(78), -- Puuid - links to riot_accounts.puuid
    riot_id_tagline VARCHAR(5), -- RiotIdTagline
    profile_icon INTEGER, -- ProfileIcon
    summoner_level INTEGER, -- SummonerLevel
    summoner_name VARCHAR(100), -- SummonerName
    
    -- Game outcome
    win BOOLEAN, -- Win
    game_ended_in_surrender BOOLEAN, -- GameEndedInSurrender
    
    -- Champion and position
    champion_name VARCHAR(50), -- ChampionName
    lane VARCHAR(10), -- Lane
    role VARCHAR(10), -- Role
    team_position VARCHAR(10), -- TeamPosition
    individual_position VARCHAR(10), -- IndividualPosition
    
    -- KDA and kills
    kills INTEGER, -- Kills
    deaths INTEGER, -- Deaths
    assists INTEGER, -- Assists
    kda DECIMAL(10,4), -- Kda (double in C#)
    kill_participation DECIMAL(10,4), -- KillParticipation (double in C#)
    largest_killing_spree INTEGER, -- LargestKillingSpree
    largest_multi_kill INTEGER, -- LargestMultiKill
    solo_kills INTEGER, -- SoloKills
    double_kills INTEGER, -- DoubleKills
    triple_kills INTEGER, -- TripleKills
    quadra_kills INTEGER, -- QuadraKills
    penta_kills INTEGER, -- PentaKills
    
    -- Items (0-6)
    item0 INTEGER, -- Item0
    item1 INTEGER, -- Item1
    item2 INTEGER, -- Item2
    item3 INTEGER, -- Item3
    item4 INTEGER, -- Item4
    item5 INTEGER, -- Item5
    item6 INTEGER, -- Item6
    
    -- Game stats
    time_played INTEGER, -- TimePlayed
    gold_earned INTEGER, -- GoldEarned
    longest_time_spent_living INTEGER, -- LongestTimeSpentLiving
    neutral_minions_killed INTEGER, -- NeutralMinionsKilled
    time_ccing_others INTEGER, -- TimeCCingOthers
    total_damage_dealt_to_champions INTEGER, -- TotalDamageDealtToChampions
    total_damage_shielded_on_teammates INTEGER, -- TotalDamageShieldedOnTeammates
    total_damage_taken INTEGER, -- TotalDamageTaken
    total_heal INTEGER, -- TotalHeal
    total_heals_on_teammates INTEGER, -- TotalHealsOnTeammates
    total_minions_killed INTEGER, -- TotalMinionsKilled
    total_time_cc_dealt INTEGER, -- TotalTimeCCDealt
    total_time_spent_dead INTEGER, -- TotalTimeSpentDead
    turret_kills INTEGER, -- TurretKills
    turret_takedowns INTEGER, -- TurretTakedowns
    turrets_lost INTEGER, -- TurretsLost
    vision_score INTEGER, -- VisionScore
    wards_placed INTEGER, -- WardsPlaced
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create teams table (based on Team.cs)
CREATE TABLE lol_teams (
    team_id SERIAL PRIMARY KEY, -- TeamId (auto-increment primary key)
    match_id VARCHAR(20) REFERENCES lol_matches(match_id) ON DELETE CASCADE, -- MatchId FK
    win BOOLEAN, -- Win
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create bans table (based on Ban.cs)
CREATE TABLE lol_bans (
    ban_id SERIAL PRIMARY KEY, -- BanId (auto-increment primary key)
    team_id INTEGER REFERENCES lol_teams(team_id) ON DELETE CASCADE, -- TeamId FK
    champion_id INTEGER, -- ChampionId
    pick_turn INTEGER -- PickTurn
);

-- Create fines table (based on Fine.cs)
CREATE TABLE lol_fines (
    id SERIAL PRIMARY KEY, -- Id (auto-increment)
    fine_size INTEGER, -- FineSize
    date TIMESTAMP WITH TIME ZONE, -- Date
    match_id VARCHAR(20) REFERENCES lol_matches(match_id) ON DELETE CASCADE, -- MatchId FK
    fine_type VARCHAR(20), -- FineType enum (WonAram, LostAram, YasouFine)
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE -- UserId FK (maps to our users table)
);

-- Create indexes for performance
CREATE INDEX idx_lol_matches_game_creation ON lol_matches(game_creation);
CREATE INDEX idx_lol_matches_queue_id ON lol_matches(queue_id);
CREATE INDEX idx_lol_matches_game_mode ON lol_matches(game_mode);
CREATE INDEX idx_lol_matches_loaded_at ON lol_matches(loaded_at);

CREATE INDEX idx_lol_participants_match_id ON lol_participants(match_id);
CREATE INDEX idx_lol_participants_puuid ON lol_participants(puuid);
CREATE INDEX idx_lol_participants_summoner_name ON lol_participants(summoner_name);
CREATE INDEX idx_lol_participants_champion_name ON lol_participants(champion_name);

CREATE INDEX idx_lol_teams_match_id ON lol_teams(match_id);
CREATE INDEX idx_lol_bans_team_id ON lol_bans(team_id);
CREATE INDEX idx_lol_fines_match_id ON lol_fines(match_id);
CREATE INDEX idx_lol_fines_user_id ON lol_fines(user_id);

-- Create view for matches with known users (matches C# query logic)
CREATE VIEW lol_matches_with_users AS
SELECT DISTINCT
    m.match_id,
    m.game_creation,
    m.game_duration,
    m.game_mode,
    m.queue_id,
    m.platform_id,
    m.loaded_at,
    COUNT(DISTINCT ra.user_id) as known_users_count,
    STRING_AGG(DISTINCT u.name, ', ') as known_user_names,
    STRING_AGG(DISTINCT ra.summoner_name, ', ') as known_summoner_names
FROM lol_matches m
JOIN lol_participants p ON m.match_id = p.match_id
LEFT JOIN riot_accounts ra ON p.puuid = ra.puuid
LEFT JOIN users u ON ra.user_id = u.id
GROUP BY m.match_id, m.game_creation, m.game_duration, m.game_mode, m.queue_id, m.platform_id, m.loaded_at
ORDER BY m.game_creation DESC;
