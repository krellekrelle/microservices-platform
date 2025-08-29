const HeartsGame = require('../models/HeartsGame');
const db = require('../db/database');

class GameManager {
    // Add a bot to a seat in the lobby
    async addBotToSeat(seat) {
        if (!this.lobbyGame || this.lobbyGame.state !== 'lobby') {
            return { error: 'No lobby available' };
        }
        if (this.lobbyGame.players.has(seat)) {
            return { error: 'Seat already taken' };
        }
        // Add bot player
        const botId = `bot-${seat}`;
        const botName = `Bot ${seat + 1}`;
        const player = this.lobbyGame.addBotPlayer(botId, botName, seat);
        // Mark bot as ready
        player.isReady = true;
        // Track bots in lobbyGame
        if (!this.lobbyGame.bots) this.lobbyGame.bots = [];
        this.lobbyGame.bots.push(seat);
        return {
            success: true,
            seat,
            lobbyState: this.getLobbyState(this.lobbyGame)
        };
    }

    // Remove a bot from a seat in the lobby
    async removeBotFromSeat(seat) {
        if (!this.lobbyGame || this.lobbyGame.state !== 'lobby') {
            return { error: 'No lobby available' };
        }
        const player = this.lobbyGame.players.get(seat);
        if (!player || !player.isBot) {
            return { error: 'No bot at that seat' };
        }
        try {
            const res = this.lobbyGame.removePlayer(seat);
            // Remove seat from bots array if tracked
            if (this.lobbyGame.bots) {
                this.lobbyGame.bots = this.lobbyGame.bots.filter(s => s !== seat);
            }
            return { success: true, seat, lobbyState: this.getLobbyState(this.lobbyGame) };
        } catch (e) {
            return { error: e.message || 'Failed to remove bot' };
        }
    }

    // Server-side bot actions for passing and playing
    async botPassCards(seat) {
        const player = this.lobbyGame.players.get(seat);
        if (!player || !player.hand || player.hand.length < 3) return;
        // Pick 3 random cards
        const shuffled = [...player.hand].sort(() => Math.random() - 0.5);
        const cards = shuffled.slice(0, 3);
        // Use HeartsGame.passCards to perform selection and get result
        const result = this.lobbyGame.passCards(seat, cards);
        return {
            seat,
            cards,
            ...result
        };
    }

    async botPlayCard(seat) {
        const player = this.lobbyGame.players.get(seat);
        if (!player || !player.hand || player.hand.length === 0) return;
        // Determine valid cards
        const validCards = player.hand.filter(card => this.lobbyGame.isValidPlay(seat, card));
        if (validCards.length === 0) return;
        // Try to follow suit
        let cardToPlay = null;
        if (this.lobbyGame.currentTrickCards.length > 0) {
            const leadSuit = this.lobbyGame.currentTrickCards[0].card[1];
            const suitCards = validCards.filter(c => c[1] === leadSuit);
            if (suitCards.length > 0) {
                // Play lowest card in suit
                cardToPlay = suitCards.reduce((min, c) => {
                    const rankOrder = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
                    return rankOrder[c[0]] < rankOrder[min[0]] ? c : min;
                }, suitCards[0]);
            }
        }
        if (!cardToPlay) {
            // Priority: QS, highest heart, highest card
            if (validCards.includes('QS')) {
                cardToPlay = 'QS';
            } else {
                const hearts = validCards.filter(c => c[1] === 'H');
                if (hearts.length > 0) {
                    cardToPlay = hearts.reduce((max, c) => {
                        const rankOrder = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
                        return rankOrder[c[0]] > rankOrder[max[0]] ? c : max;
                    }, hearts[0]);
                } else {
                    // Highest card
                    cardToPlay = validCards.reduce((max, c) => {
                        const rankOrder = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
                        return rankOrder[c[0]] > rankOrder[max[0]] ? c : max;
                    }, validCards[0]);
                }
            }
        }
        if (!cardToPlay) {
            return;
        }
        // Use existing playCard logic and return the result so caller (socketHandler) can emit events
        const playResult = this.lobbyGame.playCard(seat, cardToPlay);
        return {
            seat,
            card: cardToPlay,
            ...playResult
        };
    }
    // Play a card for a player (called by socket handler)
    async playCard(userId, card) {
        // Resolve the game for this user
        let gameId = this.playerToGame.get(userId) || (this.lobbyGame && this.lobbyGame.id);
        let game = (gameId && this.activeGames.get(gameId)) ? this.activeGames.get(gameId) : this.lobbyGame;

        // If not found or not in playing/paused, try to locate the player's game by scanning activeGames
        if (!game || (game.state !== 'playing' && game.state !== 'paused')) {
            for (const [gId, g] of this.activeGames.entries()) {
                if (!g) continue;
                for (const [s, p] of g.players) {
                    if (p && String(p.userId) === String(userId)) {
                        game = g;
                        gameId = gId;
                        this.playerToGame.set(userId, gameId);
                        break;
                    }
                }
                if (game && String(game.id) === String(gameId)) break;
            }
        }

        if (!game || game.state !== 'playing') {
            // If game exists but is in 'paused' state, return explicit paused error
            if (game && game.state === 'paused') return { error: 'Game is paused, waiting for players to reconnect' };
            return { error: 'No game in playing phase' };
        }
        // Find the player's seat
        let seat = null;
        for (const [seatNum, player] of game.players) {
            if (player.userId === userId) {
                seat = seatNum;
                break;
            }
        }
        if (seat === null) {
            return { error: 'You are not seated in the game' };
        }
        const player = game.players.get(seat);
        if (!player) {
            return { error: 'Player not found in game.' };
        }
        // Validate card (HeartsGame will also validate, but we check here for socket errors)
        if (!player.hand.includes(card)) {
            return { error: 'Card not in your hand.' };
        }
        // Call HeartsGame.playCard on the resolved game, which returns trick/round info
        let playResult;
        try {
            playResult = game.playCard(seat, card);
        } catch (err) {
            return { error: err.message };
        }
        // Always include gameId for socket handler
        return {
            ...playResult,
            gameId: game.id
        };
    }
    constructor() {
        this.activeGames = new Map(); // gameId -> HeartsGame instance
        this.playerToGame = new Map(); // userId -> gameId
        this.lobbyGame = null; // Single lobby game instance
        this.disconnectionTimers = new Map(); // userId -> timeout info
        
        // Disconnect timeout configuration (in minutes)
        this.DISCONNECT_TIMEOUT_MINUTES = Number(process.env.HEARTS_DISCONNECT_TIMEOUT_MINUTES) || 1;
        
        this.init();
    }

    async init() {
        try {
            // Create a fresh lobby game in memory only
            // Lobby games are now ephemeral and only saved to database when they start
            await this.createLobbyGame();

            console.log('GameManager initialized with fresh lobby game:', this.lobbyGame?.id);
        } catch (error) {
            console.error('Failed to initialize GameManager:', error.message);
            // If creation fails, create a basic lobby in memory only
            try {
                this.lobbyGame = new HeartsGame();
                console.log('Created fallback in-memory lobby game:', this.lobbyGame.id);
            } catch (fallbackError) {
                console.error('Failed to create fallback lobby:', fallbackError);
            }
        }
    }

    // Pass cards for a player (atomic passing phase, refactored for socketHandler)
    async passCards(userId, cards) {
        // Find the game the user belongs to (prefer mapping), fall back to lobbyGame
        let gameId = this.playerToGame.get(userId) || (this.lobbyGame && this.lobbyGame.id);
        let game = (gameId && this.activeGames.get(gameId)) ? this.activeGames.get(gameId) : this.lobbyGame;
        // If not in passing, try to find the correct game by scanning activeGames
        if (!game || game.state !== 'passing') {
            for (const [gId, g] of this.activeGames.entries()) {
                if (!g) continue;
                for (const [s, p] of g.players) {
                    if (p && String(p.userId) === String(userId)) {
                        game = g;
                        gameId = gId;
                        this.playerToGame.set(userId, gameId);
                        break;
                    }
                }
                if (game && String(game.id) === String(gameId)) break;
            }
        }

        if (!game || game.state !== 'passing') {
            return { error: 'No game in passing phase' };
        }
        // Find the player's seat in that game
        let seat = null;
        for (const [seatNum, player] of game.players) {
            if (player.userId === userId) {
                seat = seatNum;
                break;
            }
        }
        if (seat === null) {
            return { error: 'You are not seated in the game' };
        }
        const player = game.players.get(seat);
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
            passResult = game.passCards(seat, cards);
        } catch (err) {
            return { error: err.message };
        }
        // If allCardsPassed, update state and return info for socketHandler
        if (passResult.allCardsPassed) {
            return {
                allPassed: true,
                trickLeader: passResult.trickLeader,
                gameId: game.id,
                emitGameState: true
            };
        } else {
            // Not all passed yet
            return {
                allPassed: false,
                gameId: game.id,
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
            // lobby_leader_id in DB stores a user_id; map it to a seat index in memory
            // We'll set lobbyLeader to the seat number of the stored user_id if present and human.
            // Default to null for safety; we'll compute after loading players.
            this.lobbyGame.lobbyLeader = null;

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

            // Determine lobby leader seat from the DB-stored user id, if any.
            if (lobbyData.lobby_leader_id) {
                let leaderSeat = null;
                for (const [seat, player] of this.lobbyGame.players) {
                    if (player.userId && String(player.userId) === String(lobbyData.lobby_leader_id)) {
                        // Only set leader if the player is not a bot
                        if (!player.isBot) {
                            leaderSeat = seat;
                        }
                        break;
                    }
                }
                if (leaderSeat !== null) {
                    this.lobbyGame.lobbyLeader = leaderSeat;
                } else {
                    // Fallback: prefer the lowest-numbered human seat
                    const humanSeats = Array.from(this.lobbyGame.players.entries())
                        .filter(([s, p]) => !p.isBot)
                        .map(([s]) => s)
                        .sort((a,b) => a - b);
                    if (humanSeats.length > 0) this.lobbyGame.lobbyLeader = humanSeats[0];
                    else this.lobbyGame.lobbyLeader = null;
                }
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
            
            // Keep lobby games in memory only - they will be saved to database when the game starts
            console.log('Created in-memory lobby game:', this.lobbyGame.id);

            this.activeGames.set(this.lobbyGame.id, this.lobbyGame);
        } catch (error) {
            console.error('Failed to create lobby game:', error);
            throw error;
        }
    }

    // Player management
    async joinLobby(userId, userName, profilePicture = null) {
        // Clean up any finished games first
        this.removeFinishedGames();
        
        if (!this.lobbyGame || this.lobbyGame.state !== 'lobby') {
            await this.createLobbyGame();
        }

        // Check if user is already in a game
        if (this.playerToGame.has(userId)) {
            const existingGameId = this.playerToGame.get(userId);
            const existingGame = this.activeGames.get(existingGameId);
            
            if (existingGame) {
                // Find seat if present
                for (const [seat, player] of existingGame.players) {
                    if (player.userId === userId) {
                        // Mark connected and update profile picture if provided
                        player.isConnected = true;
                        if (profilePicture) player.profilePicture = profilePicture;
                        // If the existing game is still a lobby, return lobby state
                        if (existingGame.state === 'lobby') {
                            return {
                                gameId: existingGameId,
                                seat: seat,
                                lobbyState: this.getLobbyState(existingGame)
                            };
                        }
                        // If player is part of an active game (passing/playing), return game state so client can rejoin
                        return {
                            gameId: existingGameId,
                            seat: seat,
                            lobbyState: this.getLobbyState(existingGame),
                            inGame: true,
                            gameState: this.getGameState(existingGameId, userId)
                        };
                    }
                }
            }
        }

        // If mapping was lost (e.g., process restart) try to locate the player in any active game
        for (const [existingGameId, existingGame] of this.activeGames.entries()) {
            if (!existingGame) continue;
            for (const [seat, player] of existingGame.players) {
                if (player && String(player.userId) === String(userId)) {
                    // Rebuild mapping and mark connected
                    this.playerToGame.set(userId, existingGameId);
                    player.isConnected = true;
                    // Persist connected flag for DB-backed players if possible
                    try {
                        await db.query('UPDATE hearts_players SET is_connected = $1 WHERE game_id = $2 AND user_id = $3', [true, existingGameId, userId]);
                    } catch (e) {
                        console.warn('Failed to persist reconnect is_connected in joinLobby:', e && e.message ? e.message : e);
                    }
                    // Return lobby or game state appropriately
                    if (existingGame.state === 'lobby') {
                        return {
                            gameId: existingGameId,
                            seat: seat,
                            lobbyState: this.getLobbyState(existingGame)
                        };
                    }
                    return {
                        gameId: existingGameId,
                        seat: seat,
                        lobbyState: this.getLobbyState(existingGame),
                        inGame: true,
                        gameState: this.getGameState(existingGameId, userId)
                    };
                }
            }
        }

        return {
            gameId: this.lobbyGame.id,
            seat: null,
            lobbyState: this.getLobbyState(this.lobbyGame)
        };
    }

    async takeSeat(userId, userName, seat, profilePicture = null) {
        if (!this.lobbyGame || this.lobbyGame.state !== 'lobby') {
            throw new Error('No lobby available');
        }

        try {
            const player = this.lobbyGame.addPlayer(userId, userName, seat);
            if (profilePicture) player.profilePicture = profilePicture;
            
            // Players are only saved to database when the game starts, not during lobby phase
            // This keeps lobby games ephemeral and only persists actual games

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

            // If the game is still in lobby state, players are not in database yet.
            // If the game is in-progress, just mark disconnected and update database.
            if (this.lobbyGame.state === 'lobby') {
                // Lobby players are not in database, just update memory mapping
                this.playerToGame.delete(userId);
            } else {
                // In-progress game: persist disconnected flag but keep playerToGame mapping
                try {
                    await db.query(
                        'UPDATE hearts_players SET is_connected = $1 WHERE game_id = $2 AND user_id = $3',
                        [false, this.lobbyGame.id, userId]
                    );
                } catch (e) {
                    console.warn('Failed to persist is_connected on leaveSeat for in-progress game:', e && e.message ? e.message : e);
                }
            }

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
            
            // Ready states are only persisted when the game starts, not during lobby phase
            
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
        // Now check if game can start
        if (!this.lobbyGame || !this.lobbyGame.canStartGame()) {
            throw new Error('Cannot start game');
        }

        try {
            // 1. Deal cards to all players
            const gameResult = this.lobbyGame.startGame(); // Should deal and assign hands

            // 2. Save the game to database for the first time (transition from ephemeral lobby to persistent game)
            // Skip database saving for bot games - they remain ephemeral
            if (!this.hasBotsInGame(this.lobbyGame)) {
                await db.query(
                    'INSERT INTO hearts_games (id, game_state, created_at, started_at, current_round, pass_direction, lobby_leader_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [
                        this.lobbyGame.id, 
                        'passing', 
                        this.lobbyGame.createdAt, 
                        this.lobbyGame.startedAt, 
                        this.lobbyGame.currentRound, 
                        this.lobbyGame.passDirection,
                        this.lobbyGame.lobbyLeader !== null ? this.getPlayerUserId(this.lobbyGame, this.lobbyGame.lobbyLeader) : null
                    ]
                );

                // 3. Save all players to the database for the first time
                for (const [seat, player] of this.lobbyGame.players) {
                    // For bots, user_id should be NULL since they don't have real user accounts
                    const userIdForDb = player.isBot ? null : player.userId;
                    
                    await db.query(
                        'INSERT INTO hearts_players (game_id, user_id, seat_position, is_ready, is_connected, is_bot, hand_cards) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                        [this.lobbyGame.id, userIdForDb, seat, player.isReady, player.isConnected, player.isBot, JSON.stringify(player.hand)]
                    );
                }
            } else {
                console.log(`🤖 Bot game ${this.lobbyGame.id} started - skipping database persistence`);
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

    // Check if a game has any bot players
    hasBotsInGame(game) {
        if (!game || !game.players) return false;
        
        // Check if any player is a bot
        for (const [seat, player] of game.players) {
            if (player && player.isBot) {
                return true;
            }
        }
        return false;
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

    getLobbyLeader() {
        if (!this.lobbyGame || this.lobbyGame.lobbyLeader === null) return null;
        
        // lobbyLeader is stored as a seat number, get the player at that seat
        const leaderSeat = this.lobbyGame.lobbyLeader;
        const leader = this.lobbyGame.players.get(leaderSeat);
        
        if (leader && !leader.isBot) {
            return leader;
        }
        
        return null;
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
            tricksWon: Object.fromEntries(game.tricksWon), // Convert Map to object for frontend
            lobbyLeader: game.lobbyLeader, // Include lobby leader info for crown and controls
            players: this.getPlayersState(game, forUserId),
            scores: {
                round: game.getRoundScores(),
                total: game.getTotalScores(),
                historical: game.getHistoricalRounds()
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

    // Stop and save current game (lobby leader only)
    async stopGame(userId, reason = 'Lobby leader stopped the game') {
        // Find the game this user is in
        const gameId = this.playerToGame.get(userId);
        if (!gameId) {
            return { error: 'You are not in any game' };
        }

        const game = this.activeGames.get(gameId);
        if (!game) {
            return { error: 'Game not found' };
        }

        // Check if user is lobby leader
        let userSeat = null;
        for (const [seat, player] of game.players) {
            if (player && String(player.userId) === String(userId)) {
                userSeat = seat;
                break;
            }
        }

        if (userSeat === null || game.lobbyLeader !== userSeat) {
            return { error: 'Only the lobby leader can stop the game' };
        }

        if (game.state === 'lobby' || game.state === 'finished') {
            return { error: 'Cannot stop lobby or finished games' };
        }

        try {
            // Save the game as 'saved' state
            const saveResult = game.saveGame(reason);
            
            // Update database with saved state
            await this.saveGameToDatabase(game);
            
            // Remove the game from active games
            this.activeGames.delete(gameId);
            
            return {
                success: true,
                gameId: game.id,
                ...saveResult
            };
        } catch (error) {
            return { error: `Failed to stop game: ${error.message}` };
        }
    }

    // Save complete game state to database
    async saveGameToDatabase(game) {
        // Skip database saving for bot games - they remain ephemeral
        if (this.hasBotsInGame(game)) {
            console.log(`🤖 Bot game ${game.id} - skipping database persistence`);
            return;
        }
        
        try {
            // Update main game record
            await db.query(`
                UPDATE hearts_games SET 
                    game_state = $1,
                    current_round = $2,
                    current_trick = $3,
                    hearts_broken = $4,
                    pass_direction = $5,
                    current_trick_cards = $6,
                    trick_leader_seat = $7,
                    tricks_won = $8,
                    round_scores = $9,
                    total_scores = $10,
                    historical_rounds = $11,
                    saved_at = $12,
                    last_activity = $13,
                    abandoned_reason = $14,
                    lobby_leader_id = $15
                WHERE id = $16
            `, [
                game.state,
                game.currentRound,
                game.currentTrick,
                game.heartsBroken,
                game.passDirection,
                JSON.stringify(game.currentTrickCards),
                game.trickLeader,
                JSON.stringify(Object.fromEntries(game.tricksWon)),
                JSON.stringify(Object.fromEntries(game.roundScores)),
                JSON.stringify(Object.fromEntries(game.totalScores)),
                JSON.stringify(game.historicalRounds),
                game.savedAt,
                game.lastActivity,
                game.abandonedReason,
                game.lobbyLeader !== null ? this.getPlayerUserId(game, game.lobbyLeader) : null,
                game.id
            ]);

            // Update player states
            for (const [seat, player] of game.players) {
                await db.query(`
                    UPDATE hearts_players SET
                        is_connected = $1,
                        current_score = $2,
                        round_score = $3,
                        hand_cards = $4
                    WHERE game_id = $5 AND seat_position = $6
                `, [
                    player.isConnected,
                    player.totalScore,
                    player.roundScore,
                    JSON.stringify(player.hand || []),
                    game.id,
                    seat
                ]);
            }

            console.log(`Game ${game.id} saved to database with state: ${game.state}`);
        } catch (error) {
            console.error('Failed to save game to database:', error);
            throw error;
        }
    }

    // Get player's user ID by seat
    getPlayerUserId(game, seat) {
        const player = game.players.get(seat);
        if (!player) return null;
        // For bots, return null since they don't have real user accounts
        return player.isBot ? null : player.userId;
    }

    // Handle player disconnection with timeout
    handlePlayerDisconnection(userId, userName, socketHandler) {
        const gameId = this.playerToGame.get(userId);
        if (!gameId) return;

        const game = this.activeGames.get(gameId);
        if (!game || game.state === 'lobby' || game.state === 'finished') return;

        // Notify other players that someone disconnected
        if (socketHandler) {
            socketHandler.sendToGame(gameId, 'playerDisconnected', {
                playerId: userName,
                userId: userId,
                timeLeft: this.DISCONNECT_TIMEOUT_MINUTES * 60 * 1000
            });
        }

        // Clear any existing timer for this user
        if (this.disconnectionTimers.has(userId)) {
            clearTimeout(this.disconnectionTimers.get(userId).timer);
        }

        // Set configurable timeout for auto-abandonment
        const DISCONNECTION_TIMEOUT_MS = this.DISCONNECT_TIMEOUT_MINUTES * 60 * 1000;
        
        const timer = setTimeout(async () => {
            console.log(`Player ${userName} (${userId}) has been disconnected for ${this.DISCONNECT_TIMEOUT_MINUTES} minutes, checking game state...`);
            
            // Recheck game state and player connection
            const currentGame = this.activeGames.get(gameId);
            if (!currentGame || currentGame.state === 'finished' || currentGame.state === 'abandoned') {
                this.disconnectionTimers.delete(userId);
                return;
            }

            // Check if player is still disconnected
            let playerSeat = null;
            for (const [seat, player] of currentGame.players) {
                if (player && String(player.userId) === String(userId)) {
                    playerSeat = seat;
                    break;
                }
            }

            if (playerSeat !== null && !currentGame.players.get(playerSeat).isConnected) {
                // Player is still disconnected after the timeout
                if (!currentGame.hasConnectedHumanPlayers()) {
                    // No human players connected, abandon the game
                    try {
                        const abandonResult = currentGame.abandonGame(`All human players disconnected for more than ${this.DISCONNECT_TIMEOUT_MINUTES} minutes`);
                        await this.saveGameToDatabase(currentGame);
                        
                        console.log(`Game ${gameId} abandoned due to prolonged disconnection`);
                        
                        // Remove all players from the game and return them to lobby
                        const playersToNotify = [];
                        for (const [seat, player] of currentGame.players) {
                            if (player && !player.isBot) {
                                playersToNotify.push({
                                    userId: player.userId,
                                    userName: player.userName
                                });
                                this.playerToGame.delete(player.userId);
                            }
                        }
                        
                        // Remove the game from active games
                        this.activeGames.delete(gameId);
                        
                        // Notify all players about game abandonment
                        if (socketHandler) {
                            socketHandler.sendToGame(gameId, 'game-abandoned', {
                                reason: abandonResult.reason,
                                abandonedAt: abandonResult.abandonedAt
                            });
                            
                            // Also send return-to-lobby to make sure UI switches
                            socketHandler.sendToGame(gameId, 'return-to-lobby', {
                                message: 'Game was abandoned due to player disconnections'
                            });
                        }
                    } catch (error) {
                        console.error('Error abandoning game:', error);
                    }
                }
            }

            this.disconnectionTimers.delete(userId);
        }, DISCONNECTION_TIMEOUT_MS);

        // Notify other players about the disconnection
        if (socketHandler) {
            socketHandler.sendToGame(gameId, 'playerDisconnected', {
                playerId: userName,
                userId: userId,
                timeoutMinutes: this.DISCONNECT_TIMEOUT_MINUTES
            });
        }

        this.disconnectionTimers.set(userId, {
            timer,
            gameId: gameId,
            userName: userName,
            startTime: Date.now()
        });

        console.log(`Started ${this.DISCONNECT_TIMEOUT_MINUTES}-minute disconnection timer for ${userName} in game ${gameId}`);
    }

    // Handle player reconnection
    handlePlayerReconnection(userId, socketHandler) {
        // Clear disconnection timer if exists
        if (this.disconnectionTimers.has(userId)) {
            const timerInfo = this.disconnectionTimers.get(userId);
            clearTimeout(timerInfo.timer);
            this.disconnectionTimers.delete(userId);
            
            const disconnectedTime = Math.round((new Date() - timerInfo.startTime) / 1000);
            console.log(`Player ${userId} reconnected after ${disconnectedTime} seconds, timer cleared`);
            
            // Notify other players that someone reconnected
            if (socketHandler && timerInfo.gameId) {
                const game = this.activeGames.get(timerInfo.gameId);
                if (game) {
                    // Find the player's name
                    let playerName = 'Unknown';
                    for (const [seat, player] of game.players) {
                        if (player && String(player.userId) === String(userId)) {
                            playerName = player.userName || `Player ${seat + 1}`;
                            break;
                        }
                    }
                    
                    socketHandler.sendToGame(timerInfo.gameId, 'playerReconnected', {
                        playerId: playerName,
                        userId: userId,
                        disconnectedSeconds: disconnectedTime
                    });
                }
            }
            
            return { 
                hadTimer: true, 
                disconnectedSeconds: disconnectedTime,
                gameId: timerInfo.gameId
            };
        }
        
        return { hadTimer: false };
    }

    // Create a new lobby game
    async createNewLobbyGame() {
        const newGame = new HeartsGame();
        return newGame;
    }

    // Resume a saved/abandoned game
    async resumeSavedGame(gameId, requestingUserId, savedHumanPlayers) {
        // Check if requesting user is lobby leader
        if (!this.lobbyGame || this.lobbyGame.state !== 'lobby') {
            return { error: 'No lobby available' };
        }

        const lobbyLeader = this.getLobbyLeader();
        console.log("lobbyleader: ", lobbyLeader);
        console.log("requested user id: ", requestingUserId);
        if (!lobbyLeader || String(lobbyLeader.userId) !== String(requestingUserId)) {
            return { error: 'Only the lobby leader can resume games' };
        }

        // Get current lobby players (human only)
        const currentHumanPlayers = [];
        for (const [seat, player] of this.lobbyGame.players) {
            if (player && !player.isBot) {
                currentHumanPlayers.push({
                    userId: player.userId,
                    seat: seat,
                    name: player.userName
                });
            }
        }

        // Check if all required human players are present
        const missingPlayers = [];
        const extraPlayers = [];

        // Check for missing players
        for (const savedPlayer of savedHumanPlayers) {
            const isPresent = currentHumanPlayers.some(current => String(current.userId) === String(savedPlayer.user_id));
            if (!isPresent) {
                missingPlayers.push(savedPlayer.name);
            }
        }

        // Check for extra players (players in lobby that weren't in saved game)
        for (const currentPlayer of currentHumanPlayers) {
            const wasInSavedGame = savedHumanPlayers.some(saved => String(saved.user_id) === String(currentPlayer.userId));
            if (!wasInSavedGame) {
                extraPlayers.push(currentPlayer.name);
            }
        }

        // Return errors if there are missing or extra players
        if (missingPlayers.length > 0) {
            return { 
                error: 'Cannot resume game', 
                details: `Missing players: ${missingPlayers.join(', ')}` 
            };
        }

        if (extraPlayers.length > 0) {
            return { 
                error: 'Cannot resume game', 
                details: `Players not from original game: ${extraPlayers.join(', ')}` 
            };
        }

        try {
            // Load the saved game from database
            const loadedGame = await this.loadSavedGameFromDb(gameId);
            
            // Store original lobby game in case we need to restore it
            const originalLobbyGame = this.lobbyGame;
            
            try {
                // Clear current lobby seating and reseat players to match saved game
                this.lobbyGame.players.clear();
                this.lobbyGame.lobbyLeader = null;
                
                // Reseat human players to their original positions
                for (const savedPlayer of savedHumanPlayers) {
                    // Find the current player in the lobby
                    let currentPlayer = null;
                    for (const [seat, player] of originalLobbyGame.players) {
                        if (player && !player.isBot && String(player.userId) === String(savedPlayer.user_id)) {
                            currentPlayer = player;
                            break;
                        }
                    }
                    
                    if (currentPlayer) {
                        // Add player to their original seat
                        this.lobbyGame.players.set(savedPlayer.seat_position, {
                            ...currentPlayer,
                            seat: savedPlayer.seat_position,
                            isReady: true // Mark as ready for resumed game
                        });
                        
                        // Set lobby leader if first player (or maintain original leader)
                        if (this.lobbyGame.lobbyLeader === null) {
                            this.lobbyGame.lobbyLeader = savedPlayer.seat_position;
                        }
                    }
                }
                // Add the resumed game to activeGames instead of replacing lobbyGame
                this.activeGames.set(gameId, loadedGame);
                
                // Update player mappings for the resumed game
                for (const [seat, player] of loadedGame.players) {
                    if (player && !player.isBot) {
                        this.playerToGame.set(player.userId, gameId);
                    }
                }
                
                // Create a fresh lobby game for new players
                await this.createLobbyGame();
                
                // Try to resume the game state
                const resumeResult = loadedGame.resumeGame();
                
                // Validate that the resume was successful
                if (!resumeResult || !resumeResult.gameResumed) {
                    throw new Error('Resume operation failed to complete properly');
                }
                
                // Only now update the database since the resume was successful
                await db.query(`
                    UPDATE hearts_games SET 
                        game_state = $1, 
                        saved_at = NULL, 
                        abandoned_reason = NULL,
                        last_activity = NOW()
                    WHERE id = $2
                `, [loadedGame.state, gameId]);

                return {
                    success: true,
                    gameId: gameId,
                    gameState: this.getGameState(gameId, requestingUserId),
                    message: 'Game resumed successfully - players have been reseated'
                };
                
            } catch (resumeError) {
                // Resume failed - restore original lobby game
                this.lobbyGame = originalLobbyGame;
                console.error('Game resume failed, restored original lobby:', resumeError);
                throw new Error(`Game resume failed: ${resumeError.message}`);
            }

        } catch (error) {
            console.error('Error resuming game:', error);
            return { 
                error: 'Failed to resume game', 
                details: error.message 
            };
        }
    }

    // Load a saved game from database and reconstruct HeartsGame instance
    async loadSavedGameFromDb(gameId) {
        // Get game data
        const gameRes = await db.query('SELECT * FROM hearts_games WHERE id = $1', [gameId]);
        if (gameRes.rows.length === 0) {
            throw new Error('Game not found');
        }
        const gameData = gameRes.rows[0];

        // Get players with user information
        const playersRes = await db.query(`
            SELECT hp.*, u.name as user_name, u.profile_picture_url
            FROM hearts_players hp
            LEFT JOIN users u ON hp.user_id = u.id
            WHERE hp.game_id = $1
            ORDER BY hp.seat_position
        `, [gameId]);

        // Create new HeartsGame instance
        const game = new HeartsGame();
        game.id = gameData.id;
        game.state = gameData.game_state;
        game.createdAt = gameData.created_at;
        game.startedAt = gameData.started_at;
        game.finishedAt = gameData.finished_at;
        game.savedAt = gameData.saved_at;
        game.lastActivity = gameData.last_activity;
        game.abandonedReason = gameData.abandoned_reason;

        // Restore additional game state fields
        game.heartsBroken = gameData.hearts_broken || false;
        
        // currentTurnSeat needs to be derived since it's not stored
        // For now, set to null and let game logic determine it
        game.currentTurnSeat = null;
        
        // Handle lobby leader - convert from user_id to seat number
        game.lobbyLeader = null;
        if (gameData.lobby_leader_id) {
            // Find which seat has this user_id
            for (const playerRow of playersRes.rows) {
                if (playerRow.user_id && String(playerRow.user_id) === String(gameData.lobby_leader_id)) {
                    game.lobbyLeader = playerRow.seat_position;
                    break;
                }
            }
        }

        // Restore game state data
        if (gameData.current_trick_cards) {
            try {
                game.currentTrickCards = JSON.parse(gameData.current_trick_cards);
            } catch (e) {
                game.currentTrickCards = [];
            }
        }

        game.trickLeader = gameData.trick_leader_seat;
        game.currentTrick = gameData.current_trick || 0;
        game.currentRound = gameData.current_round || 1;

        if (gameData.tricks_won) {
            try {
                const tricksWonData = JSON.parse(gameData.tricks_won);
                game.tricksWon = new Map(tricksWonData || []);
            } catch (e) {
                game.tricksWon = new Map();
            }
        } else {
            game.tricksWon = new Map();
        }

        if (gameData.round_scores) {
            try {
                const roundScoresData = JSON.parse(gameData.round_scores);
                game.roundScores = new Map(roundScoresData || []);
            } catch (e) {
                game.roundScores = new Map();
            }
        } else {
            game.roundScores = new Map();
        }

        if (gameData.total_scores) {
            try {
                const totalScoresData = JSON.parse(gameData.total_scores);
                game.totalScores = new Map(totalScoresData || []);
            } catch (e) {
                game.totalScores = new Map();
            }
        } else {
            game.totalScores = new Map();
        }

        if (gameData.historical_rounds) {
            try {
                game.historicalRounds = JSON.parse(gameData.historical_rounds);
            } catch (e) {
                game.historicalRounds = [];
            }
        }

        // Determine pass direction based on round
        const passDirections = ['left', 'right', 'across', 'none'];
        game.passDirection = passDirections[(game.currentRound - 1) % 4];

        // Restore players
        for (const playerRow of playersRes.rows) {
            const player = {
                userId: playerRow.user_id,
                userName: playerRow.user_name || `Player ${playerRow.seat_position + 1}`,
                seat: playerRow.seat_position,
                isBot: playerRow.is_bot,
                isReady: true, // All players ready for resumed game
                isConnected: true, // Mark as connected for resumed game
                roundScore: playerRow.round_score || 0,
                totalScore: playerRow.current_score || 0,
                hand: [],
                passedCards: [],
                hasPassedCards: false,
                profilePicture: playerRow.profile_picture_url || null
            };

            // Parse hand if available
            if (playerRow.hand_cards) {
                try {
                    player.hand = JSON.parse(playerRow.hand_cards);
                } catch (e) {
                    player.hand = [];
                }
            }

            // Parse passed cards if available
            if (playerRow.passed_cards) {
                try {
                    player.passedCards = JSON.parse(playerRow.passed_cards);
                    player.hasPassedCards = player.passedCards.length > 0;
                } catch (e) {
                    player.passedCards = [];
                    player.hasPassedCards = false;
                }
            }

            game.players.set(playerRow.seat_position, player);
        }

        // Derive currentTurnSeat from game state
        if (game.state === 'playing' && game.currentTrickCards) {
            if (game.currentTrickCards.length === 0) {
                // No cards played yet, use trick leader
                game.currentTurnSeat = game.trickLeader;
            } else if (game.currentTrickCards.length < 4) {
                // Determine next player in turn order
                const leadSeat = game.currentTrickCards[0].seat;
                const nextSeat = (leadSeat + game.currentTrickCards.length) % 4;
                game.currentTurnSeat = nextSeat;
            } else {
                // Trick is complete, next turn depends on trick winner
                game.currentTurnSeat = null; // Will be set when trick is resolved
            }
        }

        return game;
    }
}

// Singleton instance
const gameManager = new GameManager();

module.exports = gameManager;
