const express = require('express');
const router = express.Router();
const gameManager = require('../services/gameManager');
const db = require('../db/database');

// Get current user info
router.get('/user', (req, res) => {
    res.json({
        authenticated: true,
        user: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
            status: req.user.status
        }
    });
});

// Get lobby status
router.get('/lobby', async (req, res) => {
    try {
        if (gameManager.lobbyGame) {
            const lobbyState = gameManager.getLobbyState(gameManager.lobbyGame);
            res.json(lobbyState);
        } else {
            res.json({ error: 'No lobby available' });
        }
    } catch (error) {
        console.error('Get lobby error:', error);
        res.status(500).json({ error: 'Failed to get lobby state' });
    }
});

// Get game statistics
router.get('/stats', async (req, res) => {
    try {
        const stats = {
            activeGames: gameManager.getActiveGameCount(),
            activePlayers: gameManager.getActivePlayerCount()
        };

        // Get database statistics
        const gamesResult = await db.query(
            'SELECT game_state, COUNT(*) as count FROM hearts_games GROUP BY game_state'
        );

        const totalGamesResult = await db.query(
            'SELECT COUNT(*) as total FROM hearts_games'
        );

        const completedGamesResult = await db.query(
            'SELECT COUNT(*) as completed FROM hearts_games WHERE game_state = $1',
            ['finished']
        );

        stats.database = {
            totalGames: parseInt(totalGamesResult.rows[0].total),
            completedGames: parseInt(completedGamesResult.rows[0].completed),
            gamesByState: gamesResult.rows.reduce((acc, row) => {
                acc[row.game_state] = parseInt(row.count);
                return acc;
            }, {})
        };

        res.json(stats);
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

// Get user's game history
router.get('/history', async (req, res) => {
    try {
        const userId = req.user.id;

        const historyResult = await db.query(`
            SELECT 
                hg.id,
                hg.game_state,
                hg.created_at,
                hg.started_at,
                hg.finished_at,
                hgr.final_score,
                hgr.place_finished,
                hgr.hearts_taken,
                hgr.queen_taken,
                hgr.shot_moon,
                hgr.tricks_won
            FROM hearts_games hg
            LEFT JOIN hearts_game_results hgr ON hg.id = hgr.game_id AND hgr.user_id = $1
            WHERE hg.id IN (
                SELECT DISTINCT game_id 
                FROM hearts_players 
                WHERE user_id = $1
            )
            ORDER BY hg.created_at DESC
            LIMIT 50
        `, [userId]);

        const history = historyResult.rows.map(row => ({
            gameId: row.id,
            state: row.game_state,
            createdAt: row.created_at,
            startedAt: row.started_at,
            finishedAt: row.finished_at,
            result: row.final_score !== null ? {
                finalScore: row.final_score,
                placeFinished: row.place_finished,
                heartsTaken: row.hearts_taken,
                queenTaken: row.queen_taken,
                shotMoon: row.shot_moon,
                tricksWon: row.tricks_won
            } : null
        }));

        res.json(history);
    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Failed to get game history' });
    }
});

// Get leaderboard
router.get('/leaderboard', async (req, res) => {
    try {
        const leaderboardResult = await db.query(`
            SELECT 
                u.name,
                u.email,
                COUNT(hgr.id) as games_played,
                AVG(hgr.final_score) as avg_score,
                SUM(CASE WHEN hgr.place_finished = 1 THEN 1 ELSE 0 END) as wins,
                SUM(hgr.shot_moon) as moons_shot,
                SUM(hgr.hearts_taken) as total_hearts,
                SUM(CASE WHEN hgr.queen_taken THEN 1 ELSE 0 END) as queens_taken
            FROM users u
            JOIN hearts_game_results hgr ON u.id = hgr.user_id
            JOIN hearts_games hg ON hgr.game_id = hg.id
            WHERE hg.game_state = 'finished'
            GROUP BY u.id, u.name, u.email
            HAVING COUNT(hgr.id) >= 1
            ORDER BY AVG(hgr.final_score) ASC, COUNT(hgr.id) DESC
            LIMIT 20
        `);

        const leaderboard = leaderboardResult.rows.map((row, index) => ({
            rank: index + 1,
            playerName: row.name || row.email,
            gamesPlayed: parseInt(row.games_played),
            averageScore: parseFloat(row.avg_score).toFixed(1),
            wins: parseInt(row.wins),
            moonsShot: parseInt(row.moons_shot),
            totalHearts: parseInt(row.total_hearts),
            queensTaken: parseInt(row.queens_taken),
            winRate: (parseInt(row.wins) / parseInt(row.games_played) * 100).toFixed(1)
        }));

        res.json(leaderboard);
    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({ error: 'Failed to get leaderboard' });
    }
});

// Admin routes (you might want to add admin check middleware)
router.get('/admin/games', async (req, res) => {
    try {
        // TODO: Add admin permission check
        const gamesResult = await db.query(`
            SELECT 
                hg.*,
                COUNT(hp.id) as player_count,
                COUNT(CASE WHEN hp.is_connected THEN 1 END) as connected_players
            FROM hearts_games hg
            LEFT JOIN hearts_players hp ON hg.id = hp.game_id
            GROUP BY hg.id
            ORDER BY hg.created_at DESC
            LIMIT 50
        `);

        const games = gamesResult.rows.map(row => ({
            ...row,
            player_count: parseInt(row.player_count),
            connected_players: parseInt(row.connected_players)
        }));

        res.json(games);
    } catch (error) {
        console.error('Get admin games error:', error);
        res.status(500).json({ error: 'Failed to get games list' });
    }
});

// Cleanup finished games (admin endpoint)
router.post('/admin/cleanup', async (req, res) => {
    try {
        // TODO: Add admin permission check
        const removedCount = gameManager.removeFinishedGames();
        
        res.json({ 
            message: `Cleaned up ${removedCount} finished games from memory`,
            removedCount 
        });
    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({ error: 'Failed to cleanup games' });
    }
});

module.exports = router;
