const HeartsGame = require('../models/HeartsGame');
const db = require('../db/database');

class GameManager {
    // Add a bot to a seat in the lobby
    async addBotToSeat(seat) {
        console.log(`Adding bot to seat ${seat} in lobby game ${this.lobbyGame?.id}`);
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
        console.log(`Removing bot from seat ${seat} in lobby game ${this.lobbyGame?.id}`);
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
    console.log('[DEBUG] botPassCards chosen for seat', seat, ':', cards, 'hand size:', player.hand.length);
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
    console.log('[DEBUG] botPlayCard invoked for seat', seat, 'hand:', player.hand.slice());
        // Determine valid cards
        const validCards = player.hand.filter(card => this.lobbyGame.isValidPlay(seat, card));
    console.log('[DEBUG] botPlayCard validCards for seat', seat, ':', validCards);
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
            console.log('[DEBUG] botPlayCard could not determine card to play for seat', seat);
            return;
        }
        console.log('[DEBUG] botPlayCard seat', seat, 'plays', cardToPlay);
        // Use existing playCard logic and return the result so caller (socketHandler) can emit events
        const playResult = this.lobbyGame.playCard(seat, cardToPlay);
        console.log('[DEBUG] botPlayCard playResult for seat', seat, ':', playResult);
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
    async joinLobby(userId, userName, profilePicture = null) {
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
            
            // Save to database (DEBUG: players are ready by default)
            await db.query(
                'INSERT INTO hearts_players (game_id, user_id, seat_position, is_ready, is_connected) VALUES ($1, $2, $3, $4, $5)',
                [this.lobbyGame.id, userId, seat, true, true]
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

            // If the game is still in lobby state, remove player from DB and mapping.
            // If the game is in-progress, just mark disconnected (HeartsGame.removePlayer already does that).
            if (this.lobbyGame.state === 'lobby') {
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



        // Now check if game can start
        if (!this.lobbyGame || !this.lobbyGame.canStartGame()) {
            throw new Error('Cannot start game');
        }

        try {
            // 1. Deal cards to all players
            const gameResult = this.lobbyGame.startGame(); // Should deal and assign hands




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
            tricksWon: Object.fromEntries(game.tricksWon), // Convert Map to object for frontend
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
