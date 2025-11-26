/**
 * Hearts Fines Calculator
 * Handles fine calculations for hearts games with fine club membership logic
 */

const db = require('../db/database');

class HeartsFinesCalculator {
    /**
     * Calculate and assign fines for a completed hearts game
     * @param {string} gameId - The game ID
     * @returns {Promise<Object>} - Summary of fines assigned
     */
    async calculateFinesForGame(gameId) {
        console.log(`💰 Starting fine calculation for game ${gameId}`);
        
        try {
            // Check if fines already calculated
            const gameCheck = await db.query(
                'SELECT fines_calculated, finished_at FROM hearts_games WHERE id = $1',
                [gameId]
            );
            
            if (!gameCheck.rows.length) {
                throw new Error(`Game ${gameId} not found`);
            }
            
            if (gameCheck.rows[0].fines_calculated) {
                console.log(`⚠️ Fines already calculated for game ${gameId}`);
                return { alreadyCalculated: true };
            }
            
            const gameEndDate = gameCheck.rows[0].finished_at;
            
            // Get all players in the game with their scores
            const playersResult = await db.query(
                `SELECT 
                    hp.user_id,
                    hp.seat_position,
                    hp.is_bot,
                    hgr.final_score,
                    u.name
                FROM hearts_players hp
                LEFT JOIN hearts_game_results hgr ON hp.game_id = hgr.game_id AND hp.user_id = hgr.user_id
                LEFT JOIN users u ON hp.user_id = u.id
                WHERE hp.game_id = $1 AND hp.is_bot = FALSE
                ORDER BY hp.seat_position`,
                [gameId]
            );
            
            const players = playersResult.rows;
            
            // Check if exactly 4 non-bot players
            if (players.length !== 4) {
                console.log(`⚠️ Game ${gameId} has ${players.length} non-bot players, not 4. Skipping fines.`);
                // Mark as calculated even though we skip it
                await db.query(
                    'UPDATE hearts_games SET fines_calculated = TRUE WHERE id = $1',
                    [gameId]
                );
                return { skipped: true, reason: 'Not exactly 4 non-bot players', playerCount: players.length };
            }
            
            console.log(`✅ Game ${gameId} has 4 non-bot players, calculating fines...`);
            
            // Calculate fines for each player (points / 4, rounded up)
            const playerFines = players.map(p => ({
                userId: p.user_id,
                userName: p.name,
                score: p.final_score || 0,
                fine: Math.ceil((p.final_score || 0) / 4)
            }));
            
            // Sort by fine amount descending to find second highest
            const sortedFines = [...playerFines].sort((a, b) => b.fine - a.fine);
            const secondHighestFine = sortedFines.length >= 2 ? sortedFines[1].fine : 0;
            
            console.log(`📊 Player fines:`, playerFines);
            console.log(`🥈 Second highest fine: ${secondHighestFine}`);
            
            // Insert fines for players who participated
            const finesInserted = [];
            for (const pf of playerFines) {
                await db.query(
                    `INSERT INTO hearts_fines (fine_size, date, game_id, user_id, is_participant)
                     VALUES ($1, $2, $3, $4, TRUE)`,
                    [pf.fine, gameEndDate, gameId, pf.userId]
                );
                finesInserted.push({ userId: pf.userId, userName: pf.userName, fine: pf.fine, type: 'participant' });
            }
            
            // Get all fine club members who did NOT play in this game
            const playerUserIds = players.map(p => p.user_id);
            const fineClubResult = await db.query(
                `SELECT id, name, email 
                 FROM users 
                 WHERE member_of_fineclub = TRUE 
                 AND id NOT IN (${playerUserIds.map((_, i) => `$${i + 1}`).join(',')})`,
                playerUserIds
            );
            
            const nonParticipants = fineClubResult.rows;
            console.log(`👥 Fine club non-participants: ${nonParticipants.length}`);
            
            // Assign second highest fine to all non-participants
            for (const member of nonParticipants) {
                await db.query(
                    `INSERT INTO hearts_fines (fine_size, date, game_id, user_id, is_participant)
                     VALUES ($1, $2, $3, $4, FALSE)`,
                    [secondHighestFine, gameEndDate, gameId, member.id]
                );
                finesInserted.push({ userId: member.id, userName: member.name, fine: secondHighestFine, type: 'non-participant' });
            }
            
            // Mark game as fines calculated
            await db.query(
                'UPDATE hearts_games SET fines_calculated = TRUE WHERE id = $1',
                [gameId]
            );
            
            console.log(`✅ Fines calculated for game ${gameId}:`, finesInserted);
            
            return {
                success: true,
                gameId,
                playerCount: players.length,
                secondHighestFine,
                finesInserted,
                participantFines: finesInserted.filter(f => f.type === 'participant').length,
                nonParticipantFines: finesInserted.filter(f => f.type === 'non-participant').length
            };
            
        } catch (error) {
            console.error(`❌ Error calculating fines for game ${gameId}:`, error);
            throw error;
        }
    }
    
    /**
     * Get all fines for a specific user
     * @param {number} userId - The user ID
     * @returns {Promise<Array>} - Array of fines
     */
    async getUserFines(userId) {
        const result = await db.query(
            `SELECT 
                hf.id,
                hf.fine_size,
                hf.date,
                hf.game_id,
                hf.is_participant,
                hg.current_round as rounds_played
            FROM hearts_fines hf
            LEFT JOIN hearts_games hg ON hf.game_id = hg.id
            WHERE hf.user_id = $1
            ORDER BY hf.date DESC`,
            [userId]
        );
        
        return result.rows;
    }
    
    /**
     * Get fines for a specific game
     * @param {string} gameId - The game ID
     * @returns {Promise<Array>} - Array of fines for this game
     */
    async getGameFines(gameId) {
        const result = await db.query(
            `SELECT 
                hf.id,
                hf.fine_size,
                hf.user_id,
                hf.is_participant,
                u.name as user_name,
                u.email
            FROM hearts_fines hf
            LEFT JOIN users u ON hf.user_id = u.id
            WHERE hf.game_id = $1
            ORDER BY hf.fine_size DESC, hf.is_participant DESC`,
            [gameId]
        );
        
        return result.rows;
    }
}

module.exports = new HeartsFinesCalculator();
