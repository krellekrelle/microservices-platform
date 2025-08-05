const db = require('../db/database');

async function seedTestData() {
    try {
        console.log('Seeding Hearts test data...');

        // Check if we have users to work with
        const usersResult = await db.query('SELECT id, email, name FROM users LIMIT 5');
        
        if (usersResult.rows.length === 0) {
            console.log('No users found in database. Please add some users first.');
            return;
        }

        console.log(`Found ${usersResult.rows.length} users in database`);

        // Create a test game
        const gameResult = await db.query(`
            INSERT INTO hearts_games (
                id, lobby_leader_id, game_state, created_at
            ) VALUES (
                $1, $2, $3, $4
            ) RETURNING *
        `, [
            'test-game-' + Date.now(),
            usersResult.rows[0].id,
            'finished',
            new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
        ]);

        const gameId = gameResult.rows[0].id;
        console.log('Created test game:', gameId);

        // Add players to the game
        const players = usersResult.rows.slice(0, 4); // Take first 4 users
        const finalScores = [85, 92, 78, 105]; // Example scores
        
        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            
            // Add to hearts_players
            await db.query(`
                INSERT INTO hearts_players (
                    game_id, user_id, seat_position, is_ready, is_connected, 
                    current_score, round_score, is_bot
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                gameId, player.id, i, true, false, 
                finalScores[i], 0, false
            ]);

            // Add to hearts_game_results
            await db.query(`
                INSERT INTO hearts_game_results (
                    game_id, user_id, seat_position, final_score, place_finished,
                    hearts_taken, queen_taken, shot_moon, tricks_won
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                gameId, player.id, i, finalScores[i], 
                // Calculate place (lowest score wins)
                finalScores.filter(score => score < finalScores[i]).length + 1,
                Math.floor(Math.random() * 10) + 5, // Random hearts taken
                Math.random() > 0.7, // 30% chance of taking queen
                0, // No moon shots in this example
                Math.floor(Math.random() * 5) + 2 // Random tricks won
            ]);
        }

        // Create some sample tricks
        for (let round = 1; round <= 2; round++) {
            for (let trick = 1; trick <= 5; trick++) {
                await db.query(`
                    INSERT INTO hearts_tricks (
                        game_id, round_number, trick_number, leader_seat, winner_seat,
                        cards_played, points_in_trick
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [
                    gameId, round, trick, 
                    Math.floor(Math.random() * 4), // Random leader
                    Math.floor(Math.random() * 4), // Random winner
                    JSON.stringify([
                        { seat: 0, card: '2C' },
                        { seat: 1, card: '3D' },
                        { seat: 2, card: '4H' },
                        { seat: 3, card: '5S' }
                    ]),
                    Math.random() > 0.5 ? 1 : 0 // Some tricks have points
                ]);
            }
        }

        console.log('✅ Hearts test data seeded successfully');
        console.log('Test data includes:');
        console.log(`- 1 completed game with ${players.length} players`);
        console.log('- Game results and statistics');
        console.log('- Sample tricks for analysis');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    }
}

seedTestData();
