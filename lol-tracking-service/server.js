const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const port = process.env.PORT || 3003;

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Middleware
app.use(cors());
app.use(express.json());
// DO NOT use express.static here - it bypasses authentication
// app.use(express.static(path.join(__dirname, 'public')));

// Authentication middleware (following the established pattern)
const checkAuth = async (req, res, next) => {
    try {
        const authResponse = await fetch(`${process.env.AUTH_SERVICE_URL}/check-auth`, {
            method: 'GET',
            headers: {
                'Cookie': req.headers.cookie || ''
            }
        });
        
        const authData = await authResponse.json();
        
        console.log('Auth check response:', authData); // Debug log
        
        if (!authData.authenticated) {
            // Redirect to main landing page instead of returning JSON error
            return res.redirect('/');
        }
        
        // Check user status - the auth service returns user.status, not userStatus
        if (!authData.user || authData.user.status !== 'approved') {
            // Redirect to main landing page instead of returning JSON error
            return res.redirect('/');
        }
        
        req.user = authData.user;
        next();
    } catch (error) {
        console.error('Auth check failed:', error);
        // Redirect to main landing page instead of returning JSON error
        return res.redirect('/');
    }
};

// Admin authentication middleware
const checkAdmin = async (req, res, next) => {
    try {
        const authResponse = await fetch(`${process.env.AUTH_SERVICE_URL}/check-auth`, {
            method: 'GET',
            headers: {
                'Cookie': req.headers.cookie || ''
            }
        });
        
        const authData = await authResponse.json();
        
        if (!authData.authenticated) {
            // Redirect to main landing page instead of returning JSON error
            return res.redirect('/');
        }
        
        if (!authData.user || authData.user.status !== 'approved') {
            // Redirect to main landing page instead of returning JSON error
            return res.redirect('/');
        }
        
        if (!authData.user.isAdmin) {
            // Redirect to main landing page instead of returning JSON error
            return res.redirect('/');
        }
        
        req.user = authData.user;
        next();
    } catch (error) {
        console.error('Admin auth check failed:', error);
        // Redirect to main landing page instead of returning JSON error
        return res.redirect('/');
    }
};

// Riot API helper functions
const RIOT_API_BASE = {
    europe: 'https://europe.api.riotgames.com',
    americas: 'https://americas.api.riotgames.com',
    asia: 'https://asia.api.riotgames.com'
};

const RIOT_PLATFORM_BASE = {
    euw1: 'https://euw1.api.riotgames.com',
    eun1: 'https://eun1.api.riotgames.com',
    na1: 'https://na1.api.riotgames.com',
    kr: 'https://kr.api.riotgames.com'
};

// Get account by Riot ID (gameName#tagLine)
const getRiotAccountByRiotId = async (gameName, tagLine, region = 'europe') => {
    const url = `${RIOT_API_BASE[region]}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    
    const response = await fetch(url, {
        headers: {
            'X-Riot-Token': process.env.RIOT_API_KEY
        }
    });
    
    if (!response.ok) {
        throw new Error(`Riot API error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
};

// Routes

// Root route - serve the management interface
app.get('/', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin route - serve the admin interface
app.get('/admin', checkAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Admin matches route - serve the match management interface
app.get('/admin/matches-manager', checkAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'matches.html'));
});

// Serve static assets for authenticated users
app.use('/static', checkAuth, express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'lol-tracking-service',
        timestamp: new Date().toISOString(),
        riotApiConfigured: !!process.env.RIOT_API_KEY
    });
});

// Test Riot API connection (for debugging)
app.get('/test-riot-api', checkAuth, async (req, res) => {
    if (!process.env.RIOT_API_KEY) {
        return res.status(500).json({ 
            error: 'Riot API key not configured',
            configured: false
        });
    }
    
    try {
        // Test with a known account (Faker)
        const testAccount = await getRiotAccountByRiotId('Hide on bush', 'KR1', 'asia');
        res.json({
            success: true,
            message: 'Riot API connection successful',
            testAccount: {
                gameName: testAccount.gameName,
                tagLine: testAccount.tagLine
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            configured: true
        });
    }
});

// Get user's Riot accounts
app.get('/riot-accounts', checkAuth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, puuid, summoner_name, summoner_tag, region, created_at FROM riot_accounts WHERE user_id = $1 ORDER BY created_at DESC',
            [req.user.id]
        );
        
        res.json({
            success: true,
            accounts: result.rows
        });
    } catch (error) {
        console.error('Error fetching riot accounts:', error);
        res.status(500).json({ error: 'Failed to fetch riot accounts' });
    }
});

// Admin: Get all Riot accounts across all users
app.get('/admin/riot-accounts', checkAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                ra.id,
                ra.puuid,
                ra.summoner_name,
                ra.summoner_tag,
                ra.region,
                ra.created_at,
                u.name as user_name,
                u.email as user_email,
                u.status as user_status
            FROM riot_accounts ra
            JOIN users u ON ra.user_id = u.id
            ORDER BY ra.created_at DESC
        `);
        
        res.json({
            success: true,
            totalAccounts: result.rows.length,
            accounts: result.rows
        });
    } catch (error) {
        console.error('Error fetching all riot accounts:', error);
        res.status(500).json({ error: 'Failed to fetch riot accounts' });
    }
});

// Admin: Get Riot accounts statistics
app.get('/admin/riot-accounts/stats', checkAdmin, async (req, res) => {
    try {
        const statsResult = await pool.query(`
            SELECT 
                COUNT(*) as total_accounts,
                COUNT(DISTINCT user_id) as unique_users,
                region,
                COUNT(*) as accounts_per_region
            FROM riot_accounts 
            GROUP BY region
            ORDER BY accounts_per_region DESC
        `);
        
        const userStatsResult = await pool.query(`
            SELECT 
                u.name,
                u.email,
                COUNT(ra.id) as account_count
            FROM users u
            LEFT JOIN riot_accounts ra ON u.id = ra.user_id
            WHERE u.status = 'approved'
            GROUP BY u.id, u.name, u.email
            ORDER BY account_count DESC
        `);
        
        const totalResult = await pool.query(`
            SELECT 
                COUNT(*) as total_accounts,
                COUNT(DISTINCT user_id) as total_users_with_accounts
            FROM riot_accounts
        `);
        
        res.json({
            success: true,
            overview: totalResult.rows[0],
            regionStats: statsResult.rows,
            userStats: userStatsResult.rows
        });
    } catch (error) {
        console.error('Error fetching riot accounts stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Add new Riot account
app.post('/riot-accounts', checkAuth, async (req, res) => {
    const { summonerName, summonerTag, region = 'europe' } = req.body;
    
    if (!summonerName || !summonerTag) {
        return res.status(400).json({ 
            error: 'summonerName and summonerTag are required' 
        });
    }
    
    // Check if API key is configured
    if (!process.env.RIOT_API_KEY) {
        return res.status(500).json({ 
            error: 'Riot API key not configured. Please contact administrator.' 
        });
    }
    
    try {
        // Get account data from Riot API
        const riotAccount = await getRiotAccountByRiotId(summonerName, summonerTag, region);
        
        // Check if account is already linked to any user
        const existingAccount = await pool.query(
            'SELECT id, user_id FROM riot_accounts WHERE puuid = $1',
            [riotAccount.puuid]
        );
        
        if (existingAccount.rows.length > 0) {
            return res.status(409).json({ 
                error: 'This Riot account is already linked to a user' 
            });
        }
        
        // Add account to database
        const result = await pool.query(
            `INSERT INTO riot_accounts (puuid, summoner_name, summoner_tag, region, user_id) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id, puuid, summoner_name, summoner_tag, region, created_at`,
            [riotAccount.puuid, riotAccount.gameName, riotAccount.tagLine, region, req.user.id]
        );
        
        res.status(201).json({
            success: true,
            message: 'Riot account added successfully',
            account: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error adding riot account:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            constraint: error.constraint
        });
        
        if (error.message.includes('Riot API error: 404')) {
            return res.status(404).json({ 
                error: 'Summoner not found. Please check the summoner name and tag.',
                details: error.message
            });
        }
        
        if (error.message.includes('Riot API error: 401')) {
            return res.status(500).json({ 
                error: 'Riot API authentication failed. Please contact administrator.',
                details: error.message
            });
        }
        
        if (error.message.includes('Riot API error: 403')) {
            return res.status(500).json({ 
                error: 'Riot API rate limit exceeded. Please try again in a few minutes.',
                details: error.message
            });
        }
        
        if (error.message.includes('Riot API error:')) {
            return res.status(500).json({ 
                error: `Riot API error: ${error.message}. Please try again later.`,
                details: error.message
            });
        }
        
        // Database constraint errors
        if (error.code === '23503') { // Foreign key constraint violation
            if (error.constraint === 'riot_accounts_user_id_fkey') {
                return res.status(500).json({ 
                    error: 'User account data is missing from database. Please contact administrator.',
                    details: `User ID ${req.user.id} not found in users table. Database may need restoration.`
                });
            }
            return res.status(500).json({ 
                error: 'Database constraint violation.',
                details: `Foreign key violation: ${error.constraint} - ${error.detail}`
            });
        }
        
        if (error.code === '23505') { // Unique constraint violation
            if (error.constraint === 'riot_accounts_puuid_key') {
                return res.status(409).json({ 
                    error: 'This Riot account is already linked to a user.',
                    details: 'PUUID already exists in database'
                });
            }
            return res.status(409).json({ 
                error: 'Duplicate entry detected.',
                details: `Constraint violation: ${error.constraint}`
            });
        }
        
        // Database connection errors
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            return res.status(500).json({ 
                error: 'Database connection failed. Please contact administrator.',
                details: error.message
            });
        }
        
        // Network/fetch errors
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
            return res.status(500).json({ 
                error: 'Network error occurred while contacting Riot API.',
                details: error.message
            });
        }
        
        // Generic database or other errors with more details
        res.status(500).json({ 
            error: 'Failed to add riot account. Please try again.',
            details: error.message,
            errorCode: error.code || 'UNKNOWN_ERROR'
        });
    }
});

// Remove Riot account
app.delete('/riot-accounts/:id', checkAuth, async (req, res) => {
    const accountId = req.params.id;
    
    try {
        // Verify the account belongs to the user and permanently delete it
        const result = await pool.query(
            'DELETE FROM riot_accounts WHERE id = $1 AND user_id = $2 RETURNING id, summoner_name',
            [accountId, req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Riot account not found or does not belong to you' 
            });
        }
        
        res.json({
            success: true,
            message: `Riot account "${result.rows[0].summoner_name}" permanently deleted`
        });
        
    } catch (error) {
        console.error('Error removing riot account:', error);
        res.status(500).json({ error: 'Failed to remove riot account' });
    }
});

// Get account details (for testing/debugging)
app.get('/riot-accounts/:id', checkAuth, async (req, res) => {
    const accountId = req.params.id;
    
    try {
        const result = await pool.query(
            `SELECT ra.*, u.name as user_name, u.email 
             FROM riot_accounts ra 
             JOIN users u ON ra.user_id = u.id 
             WHERE ra.id = $1 AND ra.user_id = $2`,
            [accountId, req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Riot account not found' 
            });
        }
        
        res.json({
            success: true,
            account: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error fetching riot account:', error);
        res.status(500).json({ error: 'Failed to fetch riot account details' });
    }
});

// Match loading functionality
// Helper function to convert dates to epoch timestamps
const dateToEpoch = (dateString) => {
    return Math.floor(new Date(dateString).getTime() / 1000);
};

// Helper function to get match IDs for a PUUID in a date range
const getMatchIdsForPuuid = async (puuid, startEpoch, endEpoch, region = 'europe') => {
    const count = 100;
    const requestUrl = `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?startTime=${startEpoch}&endTime=${endEpoch}&start=0&count=${count}`;
    
    const response = await fetch(requestUrl, {
        headers: { 'X-Riot-Token': process.env.RIOT_API_KEY }
    });
    
    if (!response.ok) {
        if (response.status === 429) {
            throw new Error('Riot API rate limit exceeded (429). Please wait a few minutes before trying again.');
        }
        if (response.status === 403) {
            throw new Error('Riot API access forbidden (403). Check your API key or permissions.');
        }
        if (response.status === 401) {
            throw new Error('Riot API authentication failed (401). Check your API key.');
        }
        if (response.status === 404) {
            throw new Error('Riot API resource not found (404).');
        }
        throw new Error(`Riot API error: ${response.status}`);
    }
    return await response.json();
};

// Helper function to get match details
const getMatchDetails = async (matchId, region = 'europe') => {
    const requestUrl = `https://${region}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
    
    const response = await fetch(requestUrl, {
        headers: { 'X-Riot-Token': process.env.RIOT_API_KEY }
    });
    
    if (!response.ok) {
        if (response.status === 429) {
            throw new Error('Riot API rate limit exceeded (429). Please wait a few minutes before trying again.');
        }
        if (response.status === 403) {
            throw new Error('Riot API access forbidden (403). Check your API key or permissions.');
        }
        if (response.status === 401) {
            throw new Error('Riot API authentication failed (401). Check your API key.');
        }
        if (response.status === 404) {
            throw new Error('Riot API resource not found (404).');
        }
        throw new Error(`Riot API error: ${response.status}`);
    }
    
    return await response.json();
};

// Helper function to save match to database
const saveMatchToDatabase = async (matchData) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Check if match already exists
        const existingMatch = await client.query(
            'SELECT match_id FROM lol_matches WHERE match_id = $1',
            [matchData.metadata.matchId]
        );
        
        if (existingMatch.rows.length > 0) {
            await client.query('ROLLBACK');
            return { alreadyExists: true, matchId: matchData.metadata.matchId };
        }
        
        // Insert match
        await client.query(`
            INSERT INTO lol_matches (
                match_id, data_version, end_of_game_result, game_creation,
                game_duration, game_end_timestamp, game_start_timestamp,
                game_id, game_mode, game_name, game_type, game_version,
                map_id, queue_id, platform_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
            matchData.metadata.matchId,
            matchData.metadata.dataVersion,
            matchData.info.endOfGameResult,
            matchData.info.gameCreation,
            matchData.info.gameDuration,
            matchData.info.gameEndTimestamp,
            matchData.info.gameStartTimestamp,
            matchData.info.gameId,
            matchData.info.gameMode,
            matchData.info.gameName,
            matchData.info.gameType,
            matchData.info.gameVersion,
            matchData.info.mapId,
            matchData.info.queueId,
            matchData.info.platformId
        ]);
        
        // Insert teams and bans
        for (const team of matchData.info.teams) {
            const teamResult = await client.query(`
                INSERT INTO lol_teams (match_id, win) 
                VALUES ($1, $2) 
                RETURNING team_id
            `, [matchData.metadata.matchId, team.win]);
            
            const teamId = teamResult.rows[0].team_id;
            
            // Insert bans for this team
            for (const ban of team.bans) {
                await client.query(`
                    INSERT INTO lol_bans (team_id, champion_id, pick_turn)
                    VALUES ($1, $2, $3)
                `, [teamId, ban.championId, ban.pickTurn]);
            }
        }
        
        // Insert participants
        for (const participant of matchData.info.participants) {
            // Get the summoner name with fallback options (prioritize riotIdGameName)
            const summonerName = participant.riotIdGameName || 
                                participant.summonerName || 
                                participant.gameName || 
                                'Unknown Player';
            
            await client.query(`
                INSERT INTO lol_participants (
                    match_id, participant_id, puuid, riot_id_tagline,
                    profile_icon, summoner_level, summoner_name, win,
                    game_ended_in_surrender, champion_name, lane, role,
                    team_position, individual_position, kills, deaths, assists,
                    kda, kill_participation, largest_killing_spree,
                    largest_multi_kill, solo_kills, double_kills, triple_kills,
                    quadra_kills, penta_kills, item0, item1, item2, item3,
                    item4, item5, item6, time_played, gold_earned,
                    longest_time_spent_living, neutral_minions_killed,
                    time_ccing_others, total_damage_dealt_to_champions,
                    total_damage_shielded_on_teammates, total_damage_taken,
                    total_heal, total_heals_on_teammates, total_minions_killed,
                    total_time_cc_dealt, total_time_spent_dead, turret_kills,
                    turret_takedowns, turrets_lost, vision_score, wards_placed
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                    $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26,
                    $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38,
                    $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51
                )
            `, [
                matchData.metadata.matchId,
                participant.participantId,
                participant.puuid,
                participant.riotIdTagline,
                participant.profileIcon,
                participant.summonerLevel,
                summonerName, // Use the fallback summoner name
                participant.win,
                participant.gameEndedInSurrender,
                participant.championName,
                participant.lane,
                participant.role,
                participant.teamPosition,
                participant.individualPosition,
                participant.kills,
                participant.deaths,
                participant.assists,
                participant.challenges?.kda || 0,
                participant.challenges?.killParticipation || 0,
                participant.largestKillingSpree,
                participant.largestMultiKill,
                participant.challenges?.soloKills || 0,
                participant.doubleKills,
                participant.tripleKills,
                participant.quadraKills,
                participant.pentaKills,
                participant.item0,
                participant.item1,
                participant.item2,
                participant.item3,
                participant.item4,
                participant.item5,
                participant.item6,
                participant.timePlayed,
                participant.goldEarned,
                participant.longestTimeSpentLiving,
                participant.neutralMinionsKilled,
                participant.timeCCingOthers,
                participant.totalDamageDealtToChampions,
                participant.totalDamageShieldedOnTeammates,
                participant.totalDamageTaken,
                participant.totalHeal,
                participant.totalHealsOnTeammates,
                participant.totalMinionsKilled,
                participant.totalTimeCCDealt,
                participant.totalTimeSpentDead,
                participant.turretKills,
                participant.turretTakedowns,
                participant.turretsLost,
                participant.visionScore,
                participant.wardsPlaced
            ]);
        }
        
        await client.query('COMMIT');
        return { success: true, matchId: matchData.metadata.matchId };
        
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

// Admin endpoint to load matches for a date range
app.post('/admin/load-matches', checkAdmin, async (req, res) => {
    try {
        const { startDate, endDate, region = 'europe' } = req.body;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ 
                error: 'Start date and end date are required' 
            });
        }
        
        const startEpoch = dateToEpoch(startDate);
        const endEpoch = dateToEpoch(endDate);
        
        // Get all riot accounts
        const accountsResult = await pool.query(
            'SELECT puuid, summoner_name FROM riot_accounts'
        );
        
        const results = {
            processed: 0,
            newMatches: 0,
            existingMatches: 0,
            errors: []
        };
        
        // Track matches loaded in this session to avoid double-counting
        const matchesLoadedThisSession = new Set();
        
        // Process each account
        for (const account of accountsResult.rows) {
            try {
                console.log(`Processing matches for ${account.summoner_name} (${account.puuid})`);
                
                // Get match IDs for this account
                const matchIds = await getMatchIdsForPuuid(account.puuid, startEpoch, endEpoch, region);
                
                // Process each match
                for (const matchId of matchIds) {
                    try {
                        // Skip if we already processed this match in this session
                        if (matchesLoadedThisSession.has(matchId)) {
                            results.processed++;
                            continue;
                        }
                        
                        const matchDetails = await getMatchDetails(matchId, region);
                        const saveResult = await saveMatchToDatabase(matchDetails);
                        
                        if (saveResult.alreadyExists) {
                            // This match was already in the database before this session
                            results.existingMatches++;
                        } else {
                            // This is a new match loaded in this session
                            results.newMatches++;
                            matchesLoadedThisSession.add(matchId);
                        }
                        
                        results.processed++;
                        
                        // Small delay to avoid rate limiting
                        await new Promise(resolve => setTimeout(resolve, 100));
                        
                    } catch (matchError) {
                        console.error(`Error processing match ${matchId}:`, matchError);
                        results.errors.push(`Match ${matchId}: ${matchError.message}`);
                    }
                }
                
            } catch (accountError) {
                console.error(`Error processing account ${account.summoner_name}:`, accountError);
                results.errors.push(`Account ${account.summoner_name}: ${accountError.message}`);
            }
        }
        
        res.json({
            success: true,
            results
        });
        
    } catch (error) {
        console.error('Error loading matches:', error);
        res.status(500).json({ error: 'Failed to load matches' });
    }
});

// Admin endpoint to get matches with pagination
app.get('/admin/matches', checkAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        
        const result = await pool.query(`
            SELECT 
                m.*,
                mv.known_users_count,
                mv.known_user_names,
                mv.known_summoner_names,
                COUNT(f.id) as fine_count,
                SUM(f.fine_size) as total_fine_amount
            FROM lol_matches m
            LEFT JOIN lol_matches_with_users mv ON m.match_id = mv.match_id
            LEFT JOIN lol_fines f ON m.match_id = f.match_id
            GROUP BY m.match_id, mv.known_users_count, mv.known_user_names, mv.known_summoner_names
            ORDER BY m.game_creation DESC 
            LIMIT $1 OFFSET $2
        `, [limit, offset]);
        
        // Now get match results separately for each match
        for (let match of result.rows) {
            const participantsResult = await pool.query(`
                SELECT p.win, ra.user_id
                FROM lol_participants p
                LEFT JOIN riot_accounts ra ON p.puuid = ra.puuid
                WHERE p.match_id = $1 AND ra.user_id IS NOT NULL
            `, [match.match_id]);
            
            const knownParticipants = participantsResult.rows;
            
            if (knownParticipants.length === 0) {
                match.match_result = 'No known users';
            } else {
                const winResults = knownParticipants.map(p => p.win);
                const uniqueResults = [...new Set(winResults)];
                
                if (uniqueResults.length > 1) {
                    match.match_result = 'Split Teams';
                } else if (uniqueResults[0] === true) {
                    match.match_result = 'Team Won';
                } else {
                    match.match_result = 'Team Lost';
                }
            }
            
            // Get fine details for this match
            const finesResult = await pool.query(`
                SELECT 
                    f.fine_type,
                    f.fine_size,
                    u.name as user_name,
                    ra.summoner_name
                FROM lol_fines f
                JOIN users u ON f.user_id = u.id
                LEFT JOIN riot_accounts ra ON u.id = ra.user_id
                WHERE f.match_id = $1
                ORDER BY f.fine_type, u.name
            `, [match.match_id]);
            
            match.fine_details = finesResult.rows;
        }
        
        const totalResult = await pool.query('SELECT COUNT(*) FROM lol_matches');
        const total = parseInt(totalResult.rows[0].count);
        
        res.json({
            matches: result.rows,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('Error fetching matches:', error);
        res.status(500).json({ error: 'Failed to fetch matches' });
    }
});

// Admin endpoint to get match loading statistics
app.get('/admin/match-stats', checkAdmin, async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total_matches,
                COUNT(DISTINCT CASE WHEN known_users_count > 0 THEN match_id END) as matches_with_known_users,
                MIN(game_creation) as earliest_match,
                MAX(game_creation) as latest_match,
                MAX(loaded_at) as last_loaded
            FROM lol_matches_with_users
        `);
        
        const modeStats = await pool.query(`
            SELECT game_mode, COUNT(*) as count 
            FROM lol_matches 
            GROUP BY game_mode 
            ORDER BY count DESC
        `);
        
        res.json({
            general: stats.rows[0],
            byGameMode: modeStats.rows
        });
        
    } catch (error) {
        console.error('Error fetching match stats:', error);
        res.status(500).json({ error: 'Failed to fetch match statistics' });
    }
});

// Admin endpoint to delete ALL matches (must be before :matchId route)
app.delete('/admin/matches/all', checkAdmin, async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Get count before deletion for reporting
        const countResult = await client.query('SELECT COUNT(*) FROM lol_matches');
        const totalMatches = parseInt(countResult.rows[0].count);
        
        if (totalMatches === 0) {
            await client.query('ROLLBACK');
            return res.json({
                success: true,
                message: 'No matches to delete',
                deletedCount: 0
            });
        }
        
        // Delete in correct order due to foreign key constraints
        // 1. Delete all fines
        const finesResult = await client.query('DELETE FROM lol_fines');
        
        // 2. Delete all bans
        const bansResult = await client.query('DELETE FROM lol_bans');
        
        // 3. Delete all teams
        const teamsResult = await client.query('DELETE FROM lol_teams');
        
        // 4. Delete all participants
        const participantsResult = await client.query('DELETE FROM lol_participants');
        
        // 5. Delete all matches
        const matchesResult = await client.query('DELETE FROM lol_matches');
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            message: 'All matches deleted successfully',
            deletedCount: totalMatches,
            details: {
                matches: matchesResult.rowCount,
                participants: participantsResult.rowCount,
                teams: teamsResult.rowCount,
                bans: bansResult.rowCount,
                fines: finesResult.rowCount
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting all matches:', error);
        res.status(500).json({ error: 'Failed to delete all matches' });
    } finally {
        client.release();
    }
});

// Admin endpoint to delete a match
app.delete('/admin/matches/:matchId', checkAdmin, async (req, res) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Get count before deletion for reporting
        const countResult = await client.query('SELECT COUNT(*) FROM lol_matches');
        const totalMatches = parseInt(countResult.rows[0].count);
        
        if (totalMatches === 0) {
            await client.query('ROLLBACK');
            return res.json({
                success: true,
                message: 'No matches to delete',
                deletedCount: 0
            });
        }
        
        // Delete in correct order due to foreign key constraints
        // 1. Delete all fines
        const finesResult = await client.query('DELETE FROM lol_fines');
        
        // 2. Delete all bans
        const bansResult = await client.query('DELETE FROM lol_bans');
        
        // 3. Delete all teams
        const teamsResult = await client.query('DELETE FROM lol_teams');
        
        // 4. Delete all participants
        const participantsResult = await client.query('DELETE FROM lol_participants');
        
        // 5. Delete all matches
        const matchesResult = await client.query('DELETE FROM lol_matches');
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            message: 'All matches deleted successfully',
            deletedCount: totalMatches,
            details: {
                matches: matchesResult.rowCount,
                participants: participantsResult.rowCount,
                teams: teamsResult.rowCount,
                bans: bansResult.rowCount,
                fines: finesResult.rowCount
            }
        });
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting all matches:', error);
        res.status(500).json({ error: 'Failed to delete all matches' });
    } finally {
        client.release();
    }
});

// Helper function to calculate fines for a match
const calculateFinesForMatch = async (matchId) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Get match details
        const matchResult = await client.query(`
            SELECT match_id, game_mode, queue_id 
            FROM lol_matches 
            WHERE match_id = $1 AND fines_calculated = false
        `, [matchId]);
        
        if (matchResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { alreadyCalculated: true };
        }
        
        const match = matchResult.rows[0];
        
        // Get participants with their riot account info
        const participantsResult = await client.query(`
            SELECT p.*, ra.user_id, ra.summoner_name as account_name, u.name as user_name
            FROM lol_participants p
            LEFT JOIN riot_accounts ra ON p.puuid = ra.puuid
            LEFT JOIN users u ON ra.user_id = u.id
            WHERE p.match_id = $1
        `, [matchId]);
        
        const participants = participantsResult.rows;
        const knownUsers = participants.filter(p => p.user_id);
        
        // Check if we have at least 3 known users
        if (knownUsers.length < 3) {
            await client.query('UPDATE lol_matches SET fines_calculated = true WHERE match_id = $1', [matchId]);
            await client.query('COMMIT');
            return { 
                success: true, 
                finesApplied: 0, 
                reason: 'Less than 3 known users in match' 
            };
        }
        
        // Check if all known users are on the same team
        const teamResults = knownUsers.map(p => p.win);
        const uniqueTeamResults = [...new Set(teamResults)];
        
        if (uniqueTeamResults.length > 1) {
            await client.query('UPDATE lol_matches SET fines_calculated = true WHERE match_id = $1', [matchId]);
            await client.query('COMMIT');
            return { 
                success: true, 
                finesApplied: 0, 
                reason: 'Known users are on different teams - skipping fine calculation' 
            };
        }
        
        // All known users are on the same team, get the team result
        const teamWon = knownUsers[0].win;
        
        const gameMode = match.game_mode.toLowerCase();
        const fines = [];
        
        // Get all users who have registered riot accounts for ARAM/URF/BRAWL win/loss fines
        const allUsersWithAccounts = await client.query(`
            SELECT DISTINCT u.id, u.name 
            FROM users u 
            JOIN riot_accounts ra ON u.id = ra.user_id
        `);
        
        // 1. Yasuo fine logic
        for (const participant of knownUsers) {
            const deaths = participant.deaths || 0;
            let deathThreshold = 10; // Default for normal games
            
            // Adjust threshold based on game mode
            if (['aram', 'urf'].includes(gameMode)) {
                deathThreshold = 13;
            } else if (gameMode === 'nexusblitz') { // Nexus Blitz is "BRAWL"
                deathThreshold = 8;
            }
            
            if (deaths >= deathThreshold) {
                fines.push({
                    userId: participant.user_id,
                    fineType: 'YasouFine',
                    fineSize: 10,
                    reason: `${deaths} deaths (threshold: ${deathThreshold})`
                });
            }
        }
        
        // 2. ARAM/URF/BRAWL win/loss fines
        if (['aram', 'urf', 'nexusblitz'].includes(gameMode)) {
            const participatingUserIds = knownUsers.map(p => p.user_id);
            const nonParticipatingUsers = allUsersWithAccounts.rows.filter(
                u => !participatingUserIds.includes(u.id)
            );
            
            if (teamWon) {
                // Team won - fine non-participating users
                for (const user of nonParticipatingUsers) {
                    fines.push({
                        userId: user.id,
                        fineType: 'WonAram',
                        fineSize: 5,
                        reason: `Did not participate in winning ${gameMode.toUpperCase()} game`
                    });
                }
            } else {
                // Team lost - fine participating users
                for (const participant of knownUsers) {
                    fines.push({
                        userId: participant.user_id,
                        fineType: 'LostAram',
                        fineSize: 5,
                        reason: `Lost ${gameMode.toUpperCase()} game`
                    });
                }
            }
        }
        
        // Insert fines into database
        for (const fine of fines) {
            await client.query(`
                INSERT INTO lol_fines (match_id, user_id, fine_type, fine_size, date)
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            `, [matchId, fine.userId, fine.fineType, fine.fineSize]);
        }
        
        // Mark match as fines calculated
        await client.query('UPDATE lol_matches SET fines_calculated = true WHERE match_id = $1', [matchId]);
        
        await client.query('COMMIT');
        
        return {
            success: true,
            finesApplied: fines.length,
            fines: fines
        };
        
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

// Admin endpoint to calculate fines for a single match
app.post('/admin/matches/:matchId/calculate-fines', checkAdmin, async (req, res) => {
    try {
        const matchId = req.params.matchId;
        const result = await calculateFinesForMatch(matchId);
        
        if (result.alreadyCalculated) {
            return res.json({
                success: false,
                message: 'Fines already calculated for this match'
            });
        }
        
        res.json({
            success: true,
            message: `Fines calculation complete for match ${matchId}`,
            finesApplied: result.finesApplied,
            reason: result.reason,
            fines: result.fines
        });
        
    } catch (error) {
        console.error('Error calculating fines:', error);
        res.status(500).json({ error: 'Failed to calculate fines' });
    }
});

// Admin endpoint to calculate fines for multiple matches
app.post('/admin/matches/bulk-calculate-fines', checkAdmin, async (req, res) => {
    try {
        const { matchIds } = req.body;
        
        if (!matchIds || !Array.isArray(matchIds)) {
            return res.status(400).json({ error: 'matchIds array is required' });
        }
        
        const results = {
            processed: 0,
            totalFines: 0,
            alreadyCalculated: 0,
            errors: []
        };
        
        for (const matchId of matchIds) {
            try {
                const result = await calculateFinesForMatch(matchId);
                results.processed++;
                
                if (result.alreadyCalculated) {
                    results.alreadyCalculated++;
                } else {
                    results.totalFines += result.finesApplied;
                }
                
            } catch (error) {
                console.error(`Error calculating fines for match ${matchId}:`, error);
                results.errors.push(`Match ${matchId}: ${error.message}`);
            }
        }
        
        res.json({
            success: true,
            message: 'Bulk fine calculation complete',
            results
        });
        
    } catch (error) {
        console.error('Error in bulk fine calculation:', error);
        res.status(500).json({ error: 'Failed to calculate fines' });
    }
});

// Admin endpoint to get fines for a specific match
app.get('/admin/matches/:matchId/fines', checkAdmin, async (req, res) => {
    try {
        const matchId = req.params.matchId;
        
        const result = await pool.query(`
            SELECT 
                f.*,
                u.name as user_name,
                ra.summoner_name
            FROM lol_fines f
            JOIN users u ON f.user_id = u.id
            LEFT JOIN riot_accounts ra ON u.id = ra.user_id
            WHERE f.match_id = $1
            ORDER BY f.date DESC
        `, [matchId]);
        
        res.json({
            success: true,
            fines: result.rows
        });
        
    } catch (error) {
        console.error('Error fetching fines:', error);
        res.status(500).json({ error: 'Failed to fetch fines' });
    }
});

// Admin endpoint to get detailed match information
app.get('/admin/matches/:matchId/details', checkAdmin, async (req, res) => {
    try {
        const matchId = req.params.matchId;
        
        // Get match basic info
        const matchResult = await pool.query(`
            SELECT * FROM lol_matches WHERE match_id = $1
        `, [matchId]);
        
        if (matchResult.rows.length === 0) {
            return res.status(404).json({ error: 'Match not found' });
        }
        
        // Get participants with user info
        const participantsResult = await pool.query(`
            SELECT 
                p.*,
                ra.user_id,
                u.name as user_name
            FROM lol_participants p
            LEFT JOIN riot_accounts ra ON p.puuid = ra.puuid
            LEFT JOIN users u ON ra.user_id = u.id
            WHERE p.match_id = $1
            ORDER BY p.win DESC, p.team_position
        `, [matchId]);
        
        // Get fines for this match
        const finesResult = await pool.query(`
            SELECT 
                f.*,
                u.name as user_name,
                ra.summoner_name
            FROM lol_fines f
            JOIN users u ON f.user_id = u.id
            LEFT JOIN riot_accounts ra ON u.id = ra.user_id
            WHERE f.match_id = $1
            ORDER BY f.date DESC
        `, [matchId]);
        
        res.json({
            success: true,
            match_id: matchId,
            match_info: matchResult.rows[0],
            participants: participantsResult.rows,
            fine_details: finesResult.rows
        });
        
    } catch (error) {
        console.error('Error fetching match details:', error);
        res.status(500).json({ error: 'Failed to fetch match details' });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(port, () => {
    console.log(`LoL Tracking Service running on port ${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    pool.end(() => {
        process.exit(0);
    });
});
