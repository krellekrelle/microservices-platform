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

        // Return a list of games the user participated in, including all players and final scores
        const historyResult = await db.query(`
            SELECT
                hg.id,
                hg.game_state,
                hg.created_at,
                hg.started_at,
                hg.finished_at,
                COALESCE(json_agg(json_build_object(
                    'userId', u.id,
                    'name', COALESCE(u.name, u.email),
                    'seat', hgr.seat_position,
                    'finalScore', hgr.final_score
                ) ORDER BY COALESCE(hgr.seat_position, 0)) FILTER (WHERE hgr.user_id IS NOT NULL), '[]') as players
            FROM hearts_games hg
            LEFT JOIN hearts_game_results hgr ON hg.id = hgr.game_id
            LEFT JOIN users u ON hgr.user_id = u.id
            WHERE hg.id IN (
                SELECT DISTINCT game_id
                FROM hearts_players
                WHERE user_id = $1
            )
            GROUP BY hg.id
            ORDER BY hg.created_at DESC
            LIMIT 50
        `, [userId]);

        const history = historyResult.rows.map(row => ({
            gameId: row.id,
            state: row.game_state,
            createdAt: row.created_at,
            startedAt: row.started_at,
            finishedAt: row.finished_at,
            players: row.players || []
        }));

        res.json(history);
    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Failed to get game history' });
    }
});

// Get details for a specific game (including rounds/tricks)
router.get('/history/:gameId', async (req, res) => {
    try {
        const userId = req.user.id;
        const gameId = req.params.gameId;

        // Ensure the requesting user participated in this game
        const partRes = await db.query(`SELECT 1 FROM hearts_players WHERE game_id = $1 AND user_id = $2 LIMIT 1`, [gameId, userId]);
        if (partRes.rows.length === 0) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const gameRes = await db.query(`
            SELECT id, game_state, created_at, started_at, finished_at
            FROM hearts_games
            WHERE id = $1
            LIMIT 1
        `, [gameId]);
        if (gameRes.rows.length === 0) return res.status(404).json({ error: 'Game not found' });
        const game = gameRes.rows[0];

        // Players and final scores
        const playersRes = await db.query(`
            SELECT hp.seat_position, hp.user_id, COALESCE(u.name, u.email) as name, hgr.final_score,
                   hp.current_score, hp.round_score, hp.is_bot
            FROM hearts_players hp
            LEFT JOIN users u ON hp.user_id = u.id
            LEFT JOIN hearts_game_results hgr ON hgr.game_id = hp.game_id AND hgr.user_id = hp.user_id
            WHERE hp.game_id = $1
            ORDER BY hp.seat_position
        `, [gameId]);

        const players = playersRes.rows.map(r => ({
            seat: r.seat_position,
            userId: r.user_id,
            name: r.name,
            finalScore: r.final_score,
            currentScore: (typeof r.current_score !== 'undefined') ? r.current_score : null,
            roundScore: (typeof r.round_score !== 'undefined') ? r.round_score : null,
            isBot: !!r.is_bot
        }));

        // Tricks grouped by round
        const tricksRes = await db.query(`
            SELECT round_number, trick_number, leader_seat, winner_seat, cards_played, points_in_trick, completed_at
            FROM hearts_tricks
            WHERE game_id = $1
            ORDER BY round_number, trick_number
        `, [gameId]);

        const rounds = {};
        for (const t of tricksRes.rows) {
            const roundNum = t.round_number || 1;
            if (!rounds[roundNum]) rounds[roundNum] = [];
            let cards = t.cards_played;
            try {
                if (typeof cards === 'string') cards = JSON.parse(cards);
            } catch (e) {
                // keep as-is
            }
            rounds[roundNum].push({
                trickNumber: t.trick_number,
                leaderSeat: t.leader_seat,
                winnerSeat: t.winner_seat,
                cardsPlayed: cards,
                points: t.points_in_trick,
                completedAt: t.completed_at
            });
        }

        // Aggregate per-round points per seat (winner_seat receives points_in_trick)
        const pointsRes = await db.query(`
            SELECT round_number, winner_seat, COALESCE(SUM(points_in_trick),0) as points
            FROM hearts_tricks
            WHERE game_id = $1
            GROUP BY round_number, winner_seat
            ORDER BY round_number
        `, [gameId]);

        const roundsPoints = {};
        for (const r of pointsRes.rows) {
            const rn = r.round_number || 1;
            if (!roundsPoints[rn]) roundsPoints[rn] = [0,0,0,0];
            const seatIdx = typeof r.winner_seat === 'number' ? r.winner_seat : null;
            const pts = parseInt(r.points, 10) || 0;
            if (seatIdx !== null && seatIdx >= 0 && seatIdx <= 3) {
                roundsPoints[rn][seatIdx] = (roundsPoints[rn][seatIdx] || 0) + pts;
            }
        }

        // Compute per-round totals and detect shooting-the-moon
        // Note: raw trick points should sum to 26. If a player collects all 26 in tricks,
        // the applied scoring (shoot the moon) may result in applied total of 78 (26*3) across players.
        // We cannot reconstruct applied per-player round scores reliably from tricks alone once
        // the game advanced (unless we persisted per-round results). Here we report both raw trick sum
        // and whether a shoot-the-moon pattern was detected.
        const roundsTotals = {};
        for (const [rn, arr] of Object.entries(roundsPoints)) {
            const seatArr = arr || [0,0,0,0];
            const rawSum = seatArr.reduce((a,b) => a + (b||0), 0);
            // Detect if any single seat collected all 26 trick points
            const shotMoonDetected = seatArr.some(s => s === 26);
            const expectedRaw = 26;
            const expectedApplied = shotMoonDetected ? 26 * 3 : 26;
            roundsTotals[rn] = {
                rawSum,
                rawMissing: expectedRaw - rawSum,
                rawValid: rawSum === expectedRaw,
                shotMoonDetected,
                expectedApplied,
                // We do not have persisted per-round applied scores; set flag for caller
                appliedScoresAvailable: false
            };
        }

        // Final scores (from hearts_game_results)
        const finalScores = {};
        for (const p of players) {
            if (typeof p.seat === 'number') finalScores[p.seat] = p.finalScore;
        }

        res.json({
            gameId: game.id,
            state: game.game_state,
            createdAt: game.created_at,
            startedAt: game.started_at,
            finishedAt: game.finished_at,
            players,
            rounds,
            roundsPoints,
            roundsTotals,
            finalScores
        });
    } catch (error) {
        console.error('Get game details error:', error);
        res.status(500).json({ error: 'Failed to get game details' });
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

// Delete a specific game (admin only)
router.delete('/admin/games/:gameId', async (req, res) => {
    try {
        // Basic admin check
        if (!req.user || !req.user.isAdmin) {
            return res.status(403).json({ error: 'Admin privileges required' });
        }

        const gameId = req.params.gameId;

        // Remove from in-memory game manager if present
        try {
            if (gameManager && typeof gameManager.activeGames !== 'undefined') {
                if (gameManager.activeGames.has(gameId)) {
                    gameManager.activeGames.delete(gameId);
                }
            }
        } catch (e) {
            // ignore in-memory removal errors
            console.warn('Error removing from in-memory games:', e.message || e);
        }

        // Delete from database; ON DELETE CASCADE will remove related rows
        await db.query('DELETE FROM hearts_games WHERE id = $1', [gameId]);

        res.json({ success: true, message: `Deleted game ${gameId}` });
    } catch (error) {
        console.error('Admin delete game error:', error);
        res.status(500).json({ error: 'Failed to delete game' });
    }
});

// Admin debug: raw DB rows for a game (players, tricks, results, passes)
router.get('/admin/games/:gameId/debug', async (req, res) => {
    try {
        if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: 'Admin privileges required' });
        const gameId = req.params.gameId;
        const players = await db.query('SELECT * FROM hearts_players WHERE game_id = $1 ORDER BY seat_position', [gameId]);
        const tricks = await db.query('SELECT * FROM hearts_tricks WHERE game_id = $1 ORDER BY round_number, trick_number', [gameId]);
        const results = await db.query('SELECT * FROM hearts_game_results WHERE game_id = $1 ORDER BY seat_position', [gameId]);
        const passes = await db.query('SELECT * FROM hearts_card_passes WHERE game_id = $1 ORDER BY created_at', [gameId]);
        res.json({ players: players.rows, tricks: tricks.rows, results: results.rows, passes: passes.rows });
    } catch (error) {
        console.error('Admin debug error:', error);
        res.status(500).json({ error: 'Failed to fetch debug data' });
    }
});

// Admin verify: per-round trick counts and sums to help detect mismatches
router.get('/admin/games/:gameId/verify', async (req, res) => {
    try {
        if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: 'Admin privileges required' });
        const gameId = req.params.gameId;
        const tricks = await db.query('SELECT id, round_number, trick_number, leader_seat, winner_seat, cards_played, points_in_trick FROM hearts_tricks WHERE game_id = $1 ORDER BY round_number, trick_number, id', [gameId]);

        const byRound = {};
        for (const t of tricks.rows) {
            const rn = t.round_number || 1;
            if (!byRound[rn]) byRound[rn] = { tricks: [], trickCount: 0, sum: 0 };
            let cards = t.cards_played;
            try { if (typeof cards === 'string') cards = JSON.parse(cards); } catch (e) {}
            const pts = Number.isFinite(Number(t.points_in_trick)) ? parseInt(t.points_in_trick, 10) : null;
            byRound[rn].tricks.push({ id: t.id, trickNumber: t.trick_number, leader: t.leader_seat, winner: t.winner_seat, points: pts, cards: cards });
            byRound[rn].trickCount += 1;
            byRound[rn].sum += (pts || 0);
        }

        // Build summary and find rounds that don't sum to 26
        const summary = {};
        for (const [rn, data] of Object.entries(byRound)) {
            summary[rn] = { trickCount: data.trickCount, sum: data.sum, valid: data.sum === 26, tricks: data.tricks };
        }

        res.json({ gameId, summary });
    } catch (error) {
        console.error('Admin verify error:', error);
        res.status(500).json({ error: 'Failed to verify game data' });
    }
});

module.exports = router;
