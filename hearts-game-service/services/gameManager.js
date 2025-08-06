const HeartsGame = require('../models/HeartsGame');
const db = require('../db/database');

class GameManager {
    // Play a card for a player (called by socket handler)
    async playCard(userId, card) {
        if (!this.lobbyGame || this.lobbyGame.state !== 'playing') {
            return { error: 'No game in playing phase' };
        }
        // Find the player's seat
        let seat = null;
        for (const [seatNum, player] of this.lobbyGame.players) {
            if (player.userId === userId) {
                seat = seatNum;
                break;
            }
        }
        if (seat === null) {
            return { error: 'You are not seated in the game' };
        }
        const player = this.lobbyGame.players.get(seat);
        if (!player) {
            return { error: 'Player not found in game.' };
        }
        // Validate card (HeartsGame will also validate, but we check here for socket errors)
        if (!player.hand.includes(card)) {
            return { error: 'Card not in your hand.' };
        }
        // Call HeartsGame.playCard, which returns trick/round info
        let playResult;
        try {
            playResult = this.lobbyGame.playCard(seat, card);
        } catch (err) {
            return { error: err.message };
        }
        // Always include gameId for socket handler
        return {
            ...playResult,
            gameId: this.lobbyGame.id
        };
    }
    constructor() {
        this.activeGames = new Map(); // gameId -> HeartsGame instance
        this.playerToGame = new Map(); // userId -> gameId
        this.lobbyGame = null; // Single lobby game instance
        this.init();
    }

    async init() {
        try {
            // Check if there's an existing lobby game in database
            const result = await db.query(
                'SELECT * FROM hearts_games WHERE game_state = $1 ORDER BY created_at DESC LIMIT 1',
                ['lobby']
            );

            if (result.rows.length > 0) {
                await this.loadExistingLobby(result.rows[0]);
            } else {
                await this.createLobbyGame();
            }

            console.log('GameManager initialized with lobby game:', this.lobbyGame?.id);
        } catch (error) {
            console.error('Failed to initialize GameManager:', error.message);
            // If tables don't exist, create a basic lobby in memory only
            try {
                this.lobbyGame = new HeartsGame();
                console.log('Created in-memory lobby game (database tables not ready):', this.lobbyGame.id);
            } catch (fallbackError) {
                console.error('Failed to create fallback lobby:', fallbackError);
            }
        }
    }

    // Pass cards for a player (atomic passing phase, refactored for socketHandler)
    async passCards(userId, cards) {
        // Only support lobbyGame for now
        if (!this.lobbyGame || this.lobbyGame.state !== 'passing') {
            return { error: 'No game in passing phase' };
        }
        // Find the player's seat
        let seat = null;
        for (const [seatNum, player] of this.lobbyGame.players) {
            if (player.userId === userId) {
                seat = seatNum;
                break;
            }
        }
        if (seat === null) {
            return { error: 'You are not seated in the game' };
        }
        const player = this.lobbyGame.players.get(seat);
        if (!player) {
            return { error: 'Player not found in game.' };
        }
        if (player.readyToPass) {
            return { error: 'You have already passed cards.' };
        }
        // Validate cards (HeartsGame will also validate, but we check here for socket errors)
        if (!Array.isArray(cards) || cards.length !== 3) {
            return { error: 'You must select exactly 3 cards to pass.' };
        }
        // Call HeartsGame.passCards, which returns { allCardsPassed, trickLeader }
        let passResult;
        try {
            passResult = this.lobbyGame.passCards(seat, cards);
        } catch (err) {
            return { error: err.message };
        }
        // If allCardsPassed, update state and return info for socketHandler
        if (passResult.allCardsPassed) {
            return {
                allPassed: true,
                trickLeader: passResult.trickLeader,
                gameId: this.lobbyGame.id,
                emitGameState: true
            };
        } else {
            // Not all passed yet
            return {
                allPassed: false,
                gameId: this.lobbyGame.id,
                emitGameState: false
            };
        }
    }

    async loadExistingLobby(lobbyData) {
        try {
            // Load players for this lobby
            const playersResult = await db.query(
                'SELECT hp.*, u.email, u.name FROM hearts_players hp JOIN users u ON hp.user_id = u.id WHERE hp.game_id = $1',
                [lobbyData.id]
            );

            this.lobbyGame = new HeartsGame(lobbyData.id);
            this.lobbyGame.state = lobbyData.game_state;
            this.lobbyGame.lobbyLeader = lobbyData.lobby_leader_id;

            // Restore players
            for (const playerData of playersResult.rows) {
                this.lobbyGame.players.set(playerData.seat_position, {
                    userId: playerData.user_id,
                    userName: playerData.name || playerData.email,
                    seat: playerData.seat_position,
                    isReady: playerData.is_ready,
                    isConnected: false, // Will be set to true when they connect via Socket.IO
                    hand: [],
                    totalScore: 0,
                    roundScore: 0,
                    isBot: playerData.is_bot
                });

                this.playerToGame.set(playerData.user_id, lobbyData.id);
            }

            this.activeGames.set(lobbyData.id, this.lobbyGame);

            console.log(`Loaded existing lobby with ${playersResult.rows.length} players`);
        } catch (error) {
            console.error('Failed to load existing lobby:', error);
            await this.createLobbyGame();
        }
    }

    async createLobbyGame() {
        try {
            this.lobbyGame = new HeartsGame();
            
            // Try to save to database, but don't fail if tables don't exist
            try {
                const result = await db.query(
                    'INSERT INTO hearts_games (id, game_state, created_at) VALUES ($1, $2, $3) RETURNING *',
                    [this.lobbyGame.id, 'lobby', this.lobbyGame.createdAt]
                );
                console.log('Created new lobby game in database:', this.lobbyGame.id);
            } catch (dbError) {
                console.warn('Could not save lobby to database (tables may not exist yet):', dbError.message);
                console.log('Created in-memory lobby game:', this.lobbyGame.id);
            }

            this.activeGames.set(this.lobbyGame.id, this.lobbyGame);
        } catch (error) {
            console.error('Failed to create lobby game:', error);
            throw error;
        }
    }

    // Player management
    async joinLobby(userId, userName) {
        if (!this.lobbyGame || this.lobbyGame.state !== 'lobby') {
            await this.createLobbyGame();
        }

        // Check if user is already in a game
        if (this.playerToGame.has(userId)) {
            const existingGameId = this.playerToGame.get(userId);
            const existingGame = this.activeGames.get(existingGameId);
            
            if (existingGame && existingGame.state === 'lobby') {
                // Player is already in lobby, just mark as connected
                for (const [seat, player] of existingGame.players) {
                    if (player.userId === userId) {
                        player.isConnected = true;
                        return {
                            gameId: existingGameId,
                            seat: seat,
                            lobbyState: this.getLobbyState(existingGame)
                        };
                    }
                }
            }
        }

        return {
            gameId: this.lobbyGame.id,
            seat: null,
            lobbyState: this.getLobbyState(this.lobbyGame)
        };
    }

    async takeSeat(userId, userName, seat) {
        if (!this.lobbyGame || this.lobbyGame.state !== 'lobby') {
            throw new Error('No lobby available');
        }

        try {
            const player = this.lobbyGame.addPlayer(userId, userName, seat);
            
            // Save to database
            await db.query(
                'INSERT INTO hearts_players (game_id, user_id, seat_position, is_ready, is_connected) VALUES ($1, $2, $3, $4, $5)',
                [this.lobbyGame.id, userId, seat, false, true]
            );

            // Update lobby leader in database if this is the first player
            if (this.lobbyGame.lobbyLeader === seat) {
                await db.query(
                    'UPDATE hearts_games SET lobby_leader_id = $1 WHERE id = $2',
                    [userId, this.lobbyGame.id]
                );
            }

            this.playerToGame.set(userId, this.lobbyGame.id);

            return {
                success: true,
                seat: seat,
                lobbyState: this.getLobbyState(this.lobbyGame)
            };
        } catch (error) {
            throw new Error(`Failed to take seat: ${error.message}`);
        }
    }

    async leaveSeat(userId) {
        if (!this.lobbyGame) {
            throw new Error('No lobby available');
        }

        let seat = null;
        for (const [seatNum, player] of this.lobbyGame.players) {
            if (player.userId === userId) {
                seat = seatNum;
                break;
            }
        }

        if (seat === null) {
            throw new Error('Player not found in lobby');
        }

        try {
            const result = this.lobbyGame.removePlayer(seat);
            
            // Remove from database
            await db.query(
                'DELETE FROM hearts_players WHERE game_id = $1 AND user_id = $2',
                [this.lobbyGame.id, userId]
            );

            // Update lobby leader in database if needed
            if (this.lobbyGame.lobbyLeader !== null) {
                const newLeader = this.lobbyGame.players.get(this.lobbyGame.lobbyLeader);
                await db.query(
                    'UPDATE hearts_games SET lobby_leader_id = $1 WHERE id = $2',
                    [newLeader?.userId || null, this.lobbyGame.id]
                );
            }

            this.playerToGame.delete(userId);

            return {
                success: true,
                lobbyState: this.getLobbyState(this.lobbyGame)
            };
        } catch (error) {
            throw new Error(`Failed to leave seat: ${error.message}`);
        }
    }

    async toggleReady(userId) {
        if (!this.lobbyGame) {
            throw new Error('No lobby available');
        }

        let seat = null;
        for (const [seatNum, player] of this.lobbyGame.players) {
            if (player.userId === userId) {
                seat = seatNum;
                break;
            }
        }

        if (seat === null) {
            throw new Error('Player not found in lobby');
        }

        try {
            const isReady = this.lobbyGame.toggleReady(seat);
            
            // Update database
            await db.query(
                'UPDATE hearts_players SET is_ready = $1 WHERE game_id = $2 AND user_id = $3',
                [isReady, this.lobbyGame.id, userId]
            );

            // Check if game can start
            const canStart = this.lobbyGame.canStartGame();
            
            return {
                success: true,
                isReady: isReady,
                canStartGame: canStart,
                lobbyState: this.getLobbyState(this.lobbyGame)
            };
        } catch (error) {
            throw new Error(`Failed to toggle ready: ${error.message}`);
        }
    }

    async startGame() {

        // Fill empty seats with bots before checking canStartGame
        for (let seat = 0; seat < 4; seat++) {
            if (!this.lobbyGame.players.has(seat)) {
                // Add a bot to this seat
                const botName = seat === 2 ? 'TestBot A' : seat === 3 ? 'TestBot B' : `Bot${seat+1}`;
                this.lobbyGame.addPlayer(`bot${seat}`, botName, seat);
                // Mark bot as ready
                this.lobbyGame.players.get(seat).isReady = true;
                this.lobbyGame.players.get(seat).isBot = true;
            }
        }

        // Now check if game can start
        if (!this.lobbyGame || !this.lobbyGame.canStartGame()) {
            throw new Error('Cannot start game');
        }

        try {
            // 1. Deal cards to all players
            const gameResult = this.lobbyGame.startGame(); // Should deal and assign hands


            // 2. Let bots pass cards immediately if in passing phase
            if (this.lobbyGame.state === 'passing') {
                for (const [seat, player] of this.lobbyGame.players) {
                    if (player.isBot && (!player.readyToPass || !player.pendingPassedCards || player.pendingPassedCards.length !== 3)) {
                        // Pick 3 random cards from hand
                        const handCopy = [...player.hand];
                        const botPass = [];
                        for (let i = 0; i < 3; i++) {
                            const idx = Math.floor(Math.random() * handCopy.length);
                            botPass.push(handCopy.splice(idx, 1)[0]);
                        }
                        this.passCards(this.lobbyGame.id, seat, botPass);
                    }
                }
            }

            // 3. Update database with new game state
            await db.query(
                'UPDATE hearts_games SET game_state = $1, started_at = $2, current_round = $3, pass_direction = $4 WHERE id = $5',
                ['passing', this.lobbyGame.startedAt, this.lobbyGame.currentRound, this.lobbyGame.passDirection, this.lobbyGame.id]
            );

            // 4. Save each player's hand to the database
            for (const [seat, player] of this.lobbyGame.players) {
                await db.query(
                    'UPDATE hearts_players SET hand_cards = $1 WHERE game_id = $2 AND seat_position = $3',
                    [JSON.stringify(player.hand), this.lobbyGame.id, seat]
                );
            }

            // 4. Emit 'cards-dealt' event to each player (to be handled in socketHandler)
            // (This requires access to the Socket.IO server, so actual emission should be handled in the socket handler after calling startGame)

            return {
                success: true,
                gameStarted: true,
                gameId: this.lobbyGame.id,
                passDirection: this.lobbyGame.passDirection,
                hands: gameResult.hands // hands: { seat: [cards] }
            };
        } catch (error) {
            throw new Error(`Failed to start game: ${error.message}`);
        }
    }

    // Game state helpers
    getLobbyState(game) {
        const players = {};
        const spectators = Array.from(game.spectators);

        for (let seat = 0; seat < 4; seat++) {
            if (game.players.has(seat)) {
                const player = game.players.get(seat);
                players[seat] = {
                    userId: player.userId,
                    userName: player.userName,
                    isReady: player.isReady,
                    isConnected: player.isConnected,
                    isBot: player.isBot
                };
            } else {
                players[seat] = null;
            }
        }

        return {
            gameId: game.id,
            state: game.state,
            players: players,
            spectators: spectators,
            lobbyLeader: game.lobbyLeader,
            canStartGame: game.canStartGame()
        };
    }

    getGameState(gameId, forUserId = null) {
        const game = this.activeGames.get(gameId);
        if (!game) return null;

        // Determine whose turn it is (seat number)
        let currentTurnSeat = null;
        if (game.state === 'playing') {
            if (game.currentTrickCards.length === 0) {
                currentTurnSeat = game.trickLeader;
            } else {
                // Next seat in order
                const lastSeat = game.currentTrickCards[game.currentTrickCards.length - 1].seat;
                currentTurnSeat = (lastSeat + 1) % 4;
            }
        }

        return {
            gameId: game.id,
            state: game.state,
            currentRound: game.currentRound,
            currentTrick: game.currentTrick,
            heartsBroken: game.heartsBroken,
            passDirection: game.passDirection,
            trickLeader: game.trickLeader,
            currentTrickCards: game.currentTrickCards,
            currentTurnSeat,
            players: this.getPlayersState(game, forUserId),
            scores: {
                round: game.getRoundScores(),
                total: game.getTotalScores()
            }
        };
    }

    getPlayersState(game, forUserId = null) {
        const players = {};
        for (const [seat, player] of game.players) {
            players[seat] = {
                userId: player.userId,
                userName: player.userName,
                isConnected: player.isConnected,
                isBot: player.isBot,
                handSize: player.hand.length,
                roundScore: player.roundScore,
                totalScore: player.totalScore,
                // Expose passing state for frontend
                readyToPass: !!player.readyToPass,
                pendingPassedCards: Array.isArray(player.pendingPassedCards) ? player.pendingPassedCards.slice() : undefined
            };
            // Only include the hand for the requesting user
            if (forUserId && player.userId === forUserId) {
                players[seat].hand = [...player.hand];
            }
        }
        return players;
    }

    // Statistics
    getActiveGameCount() {
        return this.activeGames.size;
    }

    getActivePlayerCount() {
        let count = 0;
        for (const game of this.activeGames.values()) {
            count += game.players.size;
        }
        return count;
    }

    // Cleanup
    removeFinishedGames() {
        const toRemove = [];
        for (const [gameId, game] of this.activeGames) {
            if (game.state === 'finished' || game.state === 'abandoned') {
                toRemove.push(gameId);
            }
        }

        for (const gameId of toRemove) {
            this.activeGames.delete(gameId);
            // Remove players from lookup
            for (const [userId, userGameId] of this.playerToGame) {
                if (userGameId === gameId) {
                    this.playerToGame.delete(userId);
                }
            }
        }

        return toRemove.length;
    }
}

// Singleton instance
const gameManager = new GameManager();

module.exports = gameManager;
