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
app.use(express.static(path.join(__dirname, 'public')));

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
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        // Check user status - the auth service returns user.status, not userStatus
        if (!authData.user || authData.user.status !== 'approved') {
            return res.status(401).json({ error: 'User not approved' });
        }
        
        req.user = authData.user;
        next();
    } catch (error) {
        console.error('Auth check failed:', error);
        res.status(500).json({ error: 'Authentication service unavailable' });
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
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        if (!authData.user || authData.user.status !== 'approved') {
            return res.status(401).json({ error: 'User not approved' });
        }
        
        if (!authData.user.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        req.user = authData.user;
        next();
    } catch (error) {
        console.error('Admin auth check failed:', error);
        res.status(500).json({ error: 'Authentication service unavailable' });
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
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin route - serve the admin interface
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

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
            'SELECT id, puuid, summoner_name, summoner_tag, region, created_at FROM riot_accounts WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
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
            WHERE ra.is_active = true
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
            WHERE is_active = true
            GROUP BY region
            ORDER BY accounts_per_region DESC
        `);
        
        const userStatsResult = await pool.query(`
            SELECT 
                u.name,
                u.email,
                COUNT(ra.id) as account_count
            FROM users u
            LEFT JOIN riot_accounts ra ON u.id = ra.user_id AND ra.is_active = true
            WHERE u.status = 'approved'
            GROUP BY u.id, u.name, u.email
            ORDER BY account_count DESC
        `);
        
        const totalResult = await pool.query(`
            SELECT 
                COUNT(*) as total_accounts,
                COUNT(DISTINCT user_id) as total_users_with_accounts
            FROM riot_accounts 
            WHERE is_active = true
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
            'SELECT id, user_id FROM riot_accounts WHERE puuid = $1 AND is_active = true',
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
        
        if (error.message.includes('Riot API error: 404')) {
            return res.status(404).json({ 
                error: 'Summoner not found. Please check the summoner name and tag.' 
            });
        }
        
        if (error.message.includes('Riot API error: 401')) {
            return res.status(500).json({ 
                error: 'Riot API authentication failed. Please contact administrator.' 
            });
        }
        
        if (error.message.includes('Riot API error: 403')) {
            return res.status(500).json({ 
                error: 'Riot API rate limit exceeded. Please try again in a few minutes.' 
            });
        }
        
        if (error.message.includes('Riot API error:')) {
            return res.status(500).json({ 
                error: `Riot API error: ${error.message}. Please try again later.` 
            });
        }
        
        // Database or other errors
        res.status(500).json({ 
            error: 'Failed to add riot account. Please try again.' 
        });
    }
});

// Remove Riot account
app.delete('/riot-accounts/:id', checkAuth, async (req, res) => {
    const accountId = req.params.id;
    
    try {
        // Verify the account belongs to the user
        const result = await pool.query(
            'UPDATE riot_accounts SET is_active = false WHERE id = $1 AND user_id = $2 RETURNING id',
            [accountId, req.user.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                error: 'Riot account not found or does not belong to you' 
            });
        }
        
        res.json({
            success: true,
            message: 'Riot account removed successfully'
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
             WHERE ra.id = $1 AND ra.user_id = $2 AND ra.is_active = true`,
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
