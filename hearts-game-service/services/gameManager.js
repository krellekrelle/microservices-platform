const HeartsGame = require('../models/HeartsGame');
const db = require('../db/database');

class GameManager {
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
        if (!this.lobbyGame || !this.lobbyGame.canStartGame()) {
            throw new Error('Cannot start game');
        }

        try {
            const gameResult = this.lobbyGame.startGame();
            
            // Update database
            await db.query(
                'UPDATE hearts_games SET game_state = $1, started_at = $2, current_round = $3, pass_direction = $4 WHERE id = $5',
                ['passing', this.lobbyGame.startedAt, this.lobbyGame.currentRound, this.lobbyGame.passDirection, this.lobbyGame.id]
            );

            // Save initial hands
            for (const [seat, player] of this.lobbyGame.players) {
                await db.query(
                    'UPDATE hearts_players SET hand_cards = $1 WHERE game_id = $2 AND seat_position = $3',
                    [JSON.stringify(player.hand), this.lobbyGame.id, seat]
                );
            }

            // Create new lobby for next game
            await this.createLobbyGame();

            return {
                success: true,
                gameStarted: true,
                gameId: this.lobbyGame.id,
                passDirection: this.lobbyGame.passDirection,
                hands: gameResult.hands
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

    getGameState(gameId) {
        const game = this.activeGames.get(gameId);
        if (!game) return null;

        return {
            gameId: game.id,
            state: game.state,
            currentRound: game.currentRound,
            currentTrick: game.currentTrick,
            heartsBreoken: game.heartsBreoken,
            passDirection: game.passDirection,
            trickLeader: game.trickLeader,
            currentTrickCards: game.currentTrickCards,
            players: this.getPlayersState(game),
            scores: {
                round: game.getRoundScores(),
                total: game.getTotalScores()
            }
        };
    }

    getPlayersState(game) {
        const players = {};
        for (const [seat, player] of game.players) {
            players[seat] = {
                userId: player.userId,
                userName: player.userName,
                isConnected: player.isConnected,
                isBot: player.isBot,
                handSize: player.hand.length,
                roundScore: player.roundScore,
                totalScore: player.totalScore
            };
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
