const { socketAuth } = require('../middleware/auth');
const gameManager = require('./gameManager');
const db = require('../db/database');

// Timing configuration (milliseconds). Can be overridden with environment variables.
// TRICK_DISPLAY_MS: how long clients should be able to see a completed trick
// before the server broadcasts the updated game-state that clears it.
// INTER_BOT_PAUSE_MS: delay between bot plays to make pacing readable.
const TRICK_DISPLAY_MS = Number(process.env.TRICK_DISPLAY_MS) || 1500;
const INTER_BOT_PAUSE_MS = Number(process.env.INTER_BOT_PAUSE_MS) || 700;

class SocketHandler {
    constructor() {
        this.io = null;
        this.connectedUsers = new Map(); // socketId -> userId
        this.userSockets = new Map(); // userId -> Set of socketIds
        // Do not assign this.gameManager; use imported gameManager directly
    }

    initialize(io) {
        this.io = io;

        // Apply authentication middleware
        io.use(socketAuth);

        io.on('connection', (socket) => {
            this.handleConnection(socket);
        });

        console.log('Socket.IO handler initialized');
    }

    // Persist a completed trick and update player scores/hand snapshot
    async persistTrickAndScores(gameId, payload) {
        try {
            const game = gameManager.activeGames.get(gameId);
            if (!game) return;

            // Determine correct round and trick numbers.
            // Note: HeartsGame increments currentTrick and may advance currentRound when completing the last trick.
            // If payload.roundComplete is true, the completed trick belongs to the previous round and is trick 13.
            let roundNumber = game.currentRound || 1;
            let trickNumber = game.currentTrick || 0; // default (may be adjusted below)
            if (payload && payload.roundComplete) {
                // The game.currentRound has already been advanced to next round in the model.
                roundNumber = (game.currentRound && game.currentRound > 1) ? (game.currentRound - 1) : 1;
                trickNumber = 13;
            } else {
                // For non-final tricks, currentTrick was incremented after completion, we want 1-based trick number
                trickNumber = game.currentTrick || 1;
            }

            const trickCards = payload.trickCards || [];
            const leaderSeat = (trickCards.length > 0 && typeof trickCards[0].seat !== 'undefined') ? parseInt(trickCards[0].seat) : null;
            const winnerSeat = (typeof payload.winner !== 'undefined' && payload.winner !== null) ? parseInt(payload.winner) : null;

            // Compute points: prefer payload.points but fall back to computing from trickCards
            let points = (typeof payload.points === 'number') ? payload.points : null;
            if (points === null) {
                try {
                    points = 0;
                    for (const t of trickCards) {
                        const card = (typeof t === 'string') ? t : (t.card || null);
                        if (!card) continue;
                        if (card === 'QS') points += 13;
                        else if (card[1] === 'H') points += 1;
                    }
                } catch (e) {
                    points = 0;
                }
            }

            // Insert trick row if not already present (avoid duplicates)
            try {
                const existsRes = await db.query(
                    'SELECT 1 FROM hearts_tricks WHERE game_id = $1 AND round_number = $2 AND trick_number = $3 LIMIT 1',
                    [gameId, roundNumber, trickNumber]
                );
                if (existsRes.rows.length === 0) {
                    await db.query(
                        `INSERT INTO hearts_tricks (game_id, round_number, trick_number, leader_seat, winner_seat, cards_played, points_in_trick, completed_at)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
                        [gameId, roundNumber, trickNumber, leaderSeat, winnerSeat, JSON.stringify(trickCards), points]
                    );
                } else {
                    console.log(`Trick row already exists for game=${gameId} r=${roundNumber} t=${trickNumber}, skipping insert`);
                }
            } catch (e) {
                console.error('Failed to insert trick row:', e.message || e);
            }

            // Update player round_score and current_score from in-memory game
            try {
                const roundScores = game.getRoundScores(); // object seat->score
                const totalScores = game.getTotalScores();
                for (const [seat, player] of game.players) {
                    const r = roundScores[seat] || 0;
                    const t = totalScores[seat] || 0;
                    await db.query(
                        'UPDATE hearts_players SET round_score = $1, current_score = $2, hand_cards = $3 WHERE game_id = $4 AND seat_position = $5',
                        [r, t, JSON.stringify(player.hand || []), gameId, seat]
                    );
                }
            } catch (e) {
                console.error('Failed to update player scores/hand snapshot:', e.message || e);
            }

            // If the game ended with this trick, persist final results and mark game finished
            if (payload && payload.gameEnded) {
                try {
                    // Build array of players with seat, userId, and final score
                    const totalScores = game.getTotalScores();
                    const playersArr = [];
                    for (const [seat, player] of game.players) {
                        playersArr.push({ seat, userId: player.userId || null, score: totalScores[seat] || 0 });
                    }
                    // Sort ascending (lowest score = winner)
                    playersArr.sort((a, b) => a.score - b.score);

                    // Remove any previous results for this game and insert fresh results
                    await db.query('DELETE FROM hearts_game_results WHERE game_id = $1', [gameId]);

                    for (let i = 0; i < playersArr.length; i++) {
                        const p = playersArr[i];
                        const place = i + 1;
                        const tricksWon = game.tricksWon.get(p.seat) || 0;
                        // Ensure we only insert a numeric user_id; bots or non-numeric ids become NULL
                        let userIdForInsert = null;
                        if (typeof p.userId !== 'undefined' && p.userId !== null) {
                            const parsed = parseInt(p.userId, 10);
                            if (!isNaN(parsed)) userIdForInsert = parsed;
                        }
                        await db.query(
                            `INSERT INTO hearts_game_results (game_id, user_id, seat_position, final_score, place_finished, hearts_taken, queen_taken, shot_moon, tricks_won, created_at)
                             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
                            [gameId, userIdForInsert, p.seat, p.score, place, 0, false, 0, tricksWon]
                        );
                    }

                    // Update hearts_games to finished and set winner_id
                    const winnerUserId = playersArr.length > 0 ? playersArr[0].userId : null;
                    console.log(`Game ${gameId} finished, winner: ${winnerUserId}`);
                    console.log(`Persisting final results for game ${gameId}...`);
                    await db.query(
                        'UPDATE hearts_games SET game_state = $1, finished_at = NOW(), winner_id = $2, current_round = $3, current_trick = $4 WHERE id = $5',
                        ['finished', winnerUserId, game.currentRound, game.currentTrick, gameId]
                    );
                } catch (e) {
                    console.error('Failed to persist final game results:', e.message || e);
                }
            }

        } catch (error) {
            console.error('persistTrickAndScores error:', error.message || error);
        }
    }

    handleConnection(socket) {
        const userId = socket.user.id;
        const userName = socket.user.name || socket.user.email;

        console.log(`User connected: ${userName} (${userId})`);

        // Track connected user
        this.connectedUsers.set(socket.id, userId);
        if (!this.userSockets.has(userId)) {
            this.userSockets.set(userId, new Set());
        }
        this.userSockets.get(userId).add(socket.id);

        // Join lobby automatically
        this.handleJoinLobby(socket);

        // Set up event handlers
        this.setupEventHandlers(socket);

        socket.on('disconnect', () => {
            this.handleDisconnection(socket);
        });
    }

    setupEventHandlers(socket) {
        const userId = socket.user.id;
        const userName = socket.user.name || socket.user.email;

        // Lobby events
        socket.on('join-lobby', () => this.handleJoinLobby(socket));
        socket.on('take-seat', (data) => this.handleTakeSeat(socket, data));
        socket.on('leave-seat', () => this.handleLeaveSeat(socket));
        socket.on('ready-for-game', () => this.handleToggleReady(socket));
        socket.on('start-game', () => this.handleStartGame(socket));
        // Add bot event (lobby leader only)
        socket.on('add-bot', (data) => this.handleAddBot(socket, data));
        socket.on('remove-bot', (data) => this.handleRemoveBot(socket, data));


        // Game events
        socket.on('pass-cards', (data) => this.handlePassCards(socket, data));
        socket.on('play-card', (data) => this.handlePlayCard(socket, data));

        // Admin events (lobby leader only)
        socket.on('kick-player', (data) => this.handleKickPlayer(socket, data));


        // Request current state
        socket.on('get-lobby-state', () => this.handleGetLobbyState(socket));
        socket.on('get-game-state', (data) => this.handleGetGameState(socket, data));
    }

    async handleJoinLobby(socket) {
        try {
            const userId = socket.user.id;
            const userName = socket.user.name || socket.user.email;

            const result = await gameManager.joinLobby(userId, userName);
            // ...existing code...
            socket.join(`lobby-${result.gameId}`);
            socket.emit('lobby-updated', result.lobbyState);
            socket.to(`lobby-${result.gameId}`).emit('lobby-updated', result.lobbyState);
            console.log(`${userName} joined lobby ${result.gameId}`);
        } catch (error) {
            console.error('Join lobby error:', error);
            socket.emit('error', { message: error.message });
        }
    }

    async handleTakeSeat(socket, data) {
        try {
            const userId = socket.user.id;
            const userName = socket.user.name || socket.user.email;
            const seat = parseInt(data.seat);

            if (isNaN(seat) || seat < 0 || seat > 3) {
                throw new Error('Invalid seat number');
            }

            const result = await gameManager.takeSeat(userId, userName, seat);
            socket.join(`lobby-${result.lobbyState.gameId}`);
            this.io.to(`lobby-${result.lobbyState.gameId}`).emit('lobby-updated', result.lobbyState);
            // Prevent taking bot seat
            if (gameManager.lobbyGame && gameManager.lobbyGame.bots && gameManager.lobbyGame.bots.includes(seat)) {
                throw new Error('This seat is taken by a bot.');
            }
            console.log(`${userName} took seat ${seat}`);
        } catch (error) {
            console.error('Take seat error:', error);
            socket.emit('error', { message: error.message });
        }
    }

    async handleAddBot(socket, data) {
        console.log('handleAddBot called with dataaaa:', data);
        try {
            const userId = socket.user.id;
            const seat = parseInt(data.seat);
            console.log('handleAddBot called with seat:', seat, 'userId:', userId);
            // Only lobby leader can add bots
            if (!gameManager.lobbyGame) {
                socket.emit('error', { message: 'No lobby available.' });
                return;
            }
            // gameManager.lobbyGame.lobbyLeader stores a seat index (or null). Determine leader's userId.
            const leaderSeat = gameManager.lobbyGame.lobbyLeader;
            const leaderUserId = (leaderSeat !== null && gameManager.lobbyGame.players.get(leaderSeat)) ? gameManager.lobbyGame.players.get(leaderSeat).userId : null;
            if (leaderUserId !== socket.user.id) {
                console.log('Only lobby leader can add bots.');
                socket.emit('error', { message: 'Only lobby leader can add bots.' });
                return;
            }
            if (isNaN(seat) || seat < 0 || seat > 3) {
                console.log('Invalid seat number:', seat);
                socket.emit('error', { message: 'Invalid seat number.' });
                return;
            }
            console.log('add bottttt');
            // Delegate to gameManager
            const result = await gameManager.addBotToSeat(seat);
            console.log('Add bot result:', result);
            if (result.error) {
                socket.emit('error', { message: result.error });
                return;
            }
            this.io.to(`lobby-${result.lobbyState.gameId}`).emit('lobby-updated', result.lobbyState);
        } catch (error) {
            console.error('Add bot error:', error);
            socket.emit('error', { message: error.message });
        }
    }

    async handleRemoveBot(socket, data) {
        try {
            const userId = socket.user.id;
            const seat = parseInt(data.seat);
            if (!gameManager.lobbyGame) {
                socket.emit('error', { message: 'No lobby available.' });
                return;
            }
            const leaderSeat2 = gameManager.lobbyGame.lobbyLeader;
            const leaderUserId2 = (leaderSeat2 !== null && gameManager.lobbyGame.players.get(leaderSeat2)) ? gameManager.lobbyGame.players.get(leaderSeat2).userId : null;
            if (leaderUserId2 !== socket.user.id) {
                socket.emit('error', { message: 'Only lobby leader can remove bots.' });
                return;
            }
            if (isNaN(seat) || seat < 0 || seat > 3) {
                socket.emit('error', { message: 'Invalid seat number.' });
                return;
            }
            const result = await gameManager.removeBotFromSeat(seat);
            if (result.error) {
                socket.emit('error', { message: result.error });
                return;
            }
            this.io.to(`lobby-${result.lobbyState.gameId}`).emit('lobby-updated', result.lobbyState);
        } catch (error) {
            console.error('Remove bot error:', error);
            socket.emit('error', { message: error.message });
        }
    }

    async handleLeaveSeat(socket) {
        try {
            const userId = socket.user.id;
            const userName = socket.user.name || socket.user.email;

            const result = await gameManager.leaveSeat(userId);
            if (result.lobbyState) {
                this.io.to(`lobby-${result.lobbyState.gameId}`).emit('lobby-updated', result.lobbyState);
            }
            console.log(`${userName} left their seat`);
        } catch (error) {
            console.error('Leave seat error:', error);
            socket.emit('error', { message: error.message });
        }
    }

    async handleToggleReady(socket) {
        try {
            const userId = socket.user.id;
            const userName = socket.user.name || socket.user.email;

            const result = await gameManager.toggleReady(userId);
            this.io.to(`lobby-${result.lobbyState.gameId}`).emit('lobby-updated', result.lobbyState);
            if (result.canStartGame) {
                this.io.to(`lobby-${result.lobbyState.gameId}`).emit('ready-to-start', {
                    message: 'All players ready! Game can start now.'
                });
            }
            console.log(`${userName} toggled ready status: ${result.isReady}`);
        } catch (error) {
            console.error('Toggle ready error:', error);
            socket.emit('error', { message: error.message });
        }
    }

    async handleStartGame(socket) {
        try {
            const userId = socket.user.id;
            const userName = socket.user.name || socket.user.email;

            const result = await gameManager.startGame();
            console.log("Trying to start game...");
            if (result.success) {
                console.log("Game started succesful");
                this.io.to(`lobby-${result.gameId}`).emit('game-started', {
                    gameId: result.gameId,
                    passDirection: result.passDirection
                });
                for (const [seat, hand] of Object.entries(result.hands)) {
                    const player = gameManager.lobbyGame?.players.get(parseInt(seat));
                    if (player) {
                        // console.log('sending cards dealt')
                        // this.sendToUser(player.userId, 'cards-dealt', {
                        //     hand: hand,
                        //     seat: parseInt(seat),
                        //     passDirection: result.passDirection
                        // });
                        // console.log('sending new game state.')
                        // Also send game state
                        const gameState = gameManager.getGameState(result.gameId, player.userId);
                        // console.log('game-state: ', gameState)

                        this.sendToUser(player.userId, 'game-state', gameState);

                        // this.io.to(`game-${result.gameId}`).emit('game-state', gameState);
                    }
                }
                console.log(`Lobby name: lobby-${result.gameId}`);
                console.log(`Game name: game-${result.gameId}`);
                // Joining the lobby with the game socket.
                this.io.to(`lobby-${result.gameId}`).socketsJoin(`game-${result.gameId}`);
                // const gameState = gameManager.getGameState(result.gameId);
                // this.io.to(`game-${result.gameId}`).emit('game-state', gameState);
                console.log(`${userName} started game ${result.gameId}`);
            }
        } catch (error) {
            console.error('Start game error:', error);
            socket.emit('error', { message: error.message });
        }
    }

    async handlePassCards(socket, data) {
        try {
            console.log('[DEBUG] handlePassCards called. data:', data, 'user:', socket.user && socket.user.id);
            const userId = socket.user.id;
            const cards = Array.isArray(data.cards) ? data.cards : [];
            // Only basic input validation here
            if (cards.length !== 3) {
                console.log('[DEBUG] handlePassCards: Invalid number of cards:', cards);
                socket.emit('error', { message: 'You must select exactly 3 cards to pass.' });
                return;
            }
            // Delegate all game logic to gameManager
            const result = await gameManager.passCards(userId, cards);
            console.log('[DEBUG] handlePassCards: gameManager.passCards result:', result);
            if (result.error) {
                socket.emit('error', { message: result.error });
                return;
            }
            // Notify the user of success
            socket.emit('pass-cards-success', { success: true });
            // Emit updated game state to all players (if provided)
            if (result.emitGameState) {
                this.broadcastGameStateToRoom(result.gameId, 0);
            }
            // If not all players have passed yet, and there are bots, have bots pass immediately
            try {
                if (!result.allPassed && gameManager.lobbyGame && Array.isArray(gameManager.lobbyGame.bots) && gameManager.lobbyGame.bots.length > 0) {
                    for (const botSeat of gameManager.lobbyGame.bots) {
                        const botPlayer = gameManager.lobbyGame.players.get(botSeat);
                        if (!botPlayer) continue;
                        // If bot already selected pendingPassedCards or readyToPass, skip
                        if (botPlayer.readyToPass || botPlayer.pendingPassedCards) continue;
                        try {
                            const passResult = await gameManager.botPassCards(botSeat);
                            console.log('[DEBUG] botPassCards result:', passResult);
                            // Emit updated game state after each bot pass
                            const room = this.io.sockets.adapter.rooms.get(`game-${result.gameId}`);
                            if (room) {
                            }
                            // If bots finishing triggers all passed, emit event
                            if (passResult && passResult.allCardsPassed) {
                                console.log("All cards passed!")
                                this.io.to(`game-${result.gameId}`).emit('all-cards-passed', { trickLeader: passResult.trickLeader });
                                // Broadcast the updated game-state immediately so human players see the playing state and turn
                                this.broadcastGameStateToRoom(result.gameId, 0);
                                // Start bot auto-play loop now that passing completed
                                try {
                                    const gameId = result.gameId;
                                    const playLoop = async () => {
                                        let safety = 0;
                                        while (safety < 200 && gameManager.lobbyGame && gameManager.lobbyGame.state === 'playing') {
                                            safety++;
                                            const currentTurn = gameManager.lobbyGame.getNextPlayer();
                                            const player = gameManager.lobbyGame.players.get(currentTurn);
                                            if (!player) break;
                                            if (player.isBot) {
                                                try {
                                                    const playResult = await gameManager.botPlayCard(currentTurn);
                                                    // If this play completed a trick, emit trick-completed immediately,
                                                    // wait for the trick display interval, then broadcast the new game state
                                                    // before continuing with the next bot.
                                                    if (playResult && playResult.trickComplete) {
                                                        const trickCompletedPayload = {
                                                            winner: playResult.winner,
                                                            points: playResult.points,
                                                            trickCards: playResult.trickCards,
                                                            nextLeader: playResult.nextLeader,
                                                            roundComplete: playResult.roundComplete || false
                                                        };
                                                        if (playResult.roundComplete) {
                                                            trickCompletedPayload.roundScores = playResult.roundScores;
                                                            trickCompletedPayload.totalScores = playResult.totalScores;
                                                            trickCompletedPayload.moonShooter = playResult.moonShooter;
                                                            trickCompletedPayload.gameEnded = playResult.gameEnded;
                                                            trickCompletedPayload.nextRound = playResult.nextRound;
                                                        }
                                                        // Persist trick and scores before emitting so DB reflects client-visible state
                                                        try {
                                                            await this.persistTrickAndScores(gameId, trickCompletedPayload);
                                                        } catch (e) {
                                                            console.error('Error persisting trick before emit (bot after pass):', e);
                                                        }
                                                        this.io.to(`game-${gameId}`).emit('trick-completed', trickCompletedPayload);
                                                        // Wait for clients to display trick
                                                        await new Promise(r => setTimeout(r, TRICK_DISPLAY_MS));
                                                        // Now broadcast updated game-state (which will clear the trick)
                                                        this.broadcastGameStateToRoom(gameId, 0);
                                                    } else {
                                                        // No trick completed - broadcast immediately
                                                        this.broadcastGameStateToRoom(gameId, 0);
                                                    }
                                                    // Inter-bot pacing
                                                    await new Promise(r => setTimeout(r, INTER_BOT_PAUSE_MS));
                                                    continue;
                                                } catch (e) {
                                                    console.error('Bot play error in inner pass handler loop:', e);
                                                    break;
                                                }
                                            }
                                            break;
                                        }
                                    };
                                    playLoop();
                                } catch (e) {
                                    console.error('Error starting bot play loop after bots finished passing:', e);
                                }
                                break;
                            }
                        } catch (e) {
                            console.error('Error during botPassCards:', e);
                        }
                    }
                }
            } catch (e) {
                console.error('Error triggering bots after human pass:', e);
            }
            // If all have passed, emit all-cards-passed event
            if (result.allPassed && result.trickLeader !== undefined) {
                this.io.to(`game-${result.gameId}`).emit('all-cards-passed', { trickLeader: result.trickLeader });
                // Ensure clients receive the updated game state immediately
                this.broadcastGameStateToRoom(result.gameId, 0);
                // Start auto-play loop for bots now that game is in playing state
                try {
                    if (gameManager.lobbyGame && Array.isArray(gameManager.lobbyGame.bots) && gameManager.lobbyGame.bots.length > 0) {
                        const gameId = result.gameId;
                        const playLoop = async () => {
                            let safety = 0;
                            while (safety < 200 && gameManager.lobbyGame && gameManager.lobbyGame.state === 'playing') {
                                safety++;
                                const currentTurn = gameManager.lobbyGame.getNextPlayer();
                                const player = gameManager.lobbyGame.players.get(currentTurn);
                                if (!player) break;
                                if (player.isBot) {
                                    try {
                                        const playResult = await gameManager.botPlayCard(currentTurn);
                                            if (playResult && playResult.trickComplete) {
                                            const trickCompletedPayload = {
                                                winner: playResult.winner,
                                                points: playResult.points,
                                                trickCards: playResult.trickCards,
                                                nextLeader: playResult.nextLeader,
                                                roundComplete: playResult.roundComplete || false
                                            };
                                            if (playResult.roundComplete) {
                                                trickCompletedPayload.roundScores = playResult.roundScores;
                                                trickCompletedPayload.totalScores = playResult.totalScores;
                                                trickCompletedPayload.moonShooter = playResult.moonShooter;
                                                trickCompletedPayload.gameEnded = playResult.gameEnded;
                                                trickCompletedPayload.nextRound = playResult.nextRound;
                                            }
                                            // Persist trick and scores
                                            await this.persistTrickAndScores(gameId, trickCompletedPayload);
                                            this.io.to(`game-${gameId}`).emit('trick-completed', trickCompletedPayload);
                                            // Wait for clients to display trick
                                            await new Promise(r => setTimeout(r, TRICK_DISPLAY_MS));
                                            this.broadcastGameStateToRoom(gameId, 0);
                                        } else {
                                            this.broadcastGameStateToRoom(gameId, 0);
                                        }
                                        // Inter-bot pacing
                                        await new Promise(r => setTimeout(r, INTER_BOT_PAUSE_MS));
                                        continue;
                                    } catch (e) {
                                        console.error('Bot play error in pass handler loop:', e);
                                        break;
                                    }
                                }
                                break;
                            }
                        };
                        playLoop();
                    }
                } catch (e) {
                    console.error('Error starting bot play loop after all-cards-passed:', e);
                }
            }
        } catch (error) {
            console.error('Pass cards error:', error);
            socket.emit('error', { message: error.message });
        }
    }

    sortHand(hand) {
        // const suitOrder = { 'C': 0, 'D': 1, 'H': 2, 'S': 3 };
        const suitOrder = { 'H': 0, 'S': 1, 'D': 2, 'C': 3 };
        const rankOrder = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, 
                           '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
        
        return hand.sort((a, b) => {
            const suitA = suitOrder[a[1]];
            const suitB = suitOrder[b[1]];
            if (suitA !== suitB) return suitA - suitB;
            return rankOrder[a[0]] - rankOrder[b[0]];
        });
    }

    async handlePlayCard(socket, data) {
        try {
            const userId = socket.user.id;
            const card = data.card;
            if (!card) {
                socket.emit('error', { message: 'No card provided' });
                return;
            }
            const result = await gameManager.playCard(userId, card);
            if (result.error) {
                socket.emit('error', { message: result.error });
                return;
            }

            // If this play completed a trick, emit trick-completed immediately, wait, then broadcast game-state.
            if (result.trickComplete) {
                const trickCompletedPayload = {
                    winner: result.winner,
                    points: result.points,
                    trickCards: result.trickCards,
                    nextLeader: result.nextLeader,
                    roundComplete: result.roundComplete || false
                };
                if (result.roundComplete) {
                    trickCompletedPayload.roundScores = result.roundScores;
                    trickCompletedPayload.totalScores = result.totalScores;
                    trickCompletedPayload.moonShooter = result.moonShooter;
                    trickCompletedPayload.gameEnded = result.gameEnded;
                    trickCompletedPayload.nextRound = result.nextRound;
                }
                                        // Persist trick and scores before emitting so DB reflects client-visible state
                                        try {
                                            await this.persistTrickAndScores(result.gameId, trickCompletedPayload);
                                        } catch (e) {
                                            console.error('Error persisting trick before emit (human play):', e);
                                        }
                                        this.io.to(`game-${result.gameId}`).emit('trick-completed', trickCompletedPayload);
                await new Promise(r => setTimeout(r, TRICK_DISPLAY_MS));
                this.broadcastGameStateToRoom(result.gameId, 0);
            } else {
                // No trick completed, broadcast immediately
                this.broadcastGameStateToRoom(result.gameId, 0);
            }

            // Start auto-play loop for bots (if any)
            try {
                if (gameManager.lobbyGame && Array.isArray(gameManager.lobbyGame.bots) && gameManager.lobbyGame.bots.length > 0) {
                    const gameId = result.gameId;
                    const playLoop = async () => {
                        let safety = 0;
                        while (safety < 200 && gameManager.lobbyGame && gameManager.lobbyGame.state === 'playing') {
                            safety++;
                            const currentTurn = gameManager.lobbyGame.getNextPlayer();
                            const player = gameManager.lobbyGame.players.get(currentTurn);
                            if (!player) break;
                            if (player.isBot) {
                                try {
                                    const playResult = await gameManager.botPlayCard(currentTurn);
                                    if (playResult && playResult.trickComplete) {
                                        const trickCompletedPayload = {
                                            winner: playResult.winner,
                                            points: playResult.points,
                                            trickCards: playResult.trickCards,
                                            nextLeader: playResult.nextLeader,
                                            roundComplete: playResult.roundComplete || false
                                        };
                                        if (playResult.roundComplete) {
                                            trickCompletedPayload.roundScores = playResult.roundScores;
                                            trickCompletedPayload.totalScores = playResult.totalScores;
                                            trickCompletedPayload.moonShooter = playResult.moonShooter;
                                            trickCompletedPayload.gameEnded = playResult.gameEnded;
                                            trickCompletedPayload.nextRound = playResult.nextRound;
                                        }
                                            // Persist trick and scores before emitting so DB reflects client-visible state
                                            try {
                                                await this.persistTrickAndScores(gameId, trickCompletedPayload);
                                            } catch (e) {
                                                console.error('Error persisting trick before emit (bot loop):', e);
                                            }
                                            this.io.to(`game-${gameId}`).emit('trick-completed', trickCompletedPayload);
                                        // Wait for clients to display trick before broadcasting state
                                        await new Promise(r => setTimeout(r, TRICK_DISPLAY_MS));
                                        this.broadcastGameStateToRoom(gameId, 0);
                                    } else {
                                        this.broadcastGameStateToRoom(gameId, 0);
                                    }
                                    // Inter-bot pacing
                                    await new Promise(r => setTimeout(r, INTER_BOT_PAUSE_MS));
                                    continue;
                                } catch (e) {
                                    console.error('Bot play error in post-play loop:', e);
                                    break;
                                }
                            }
                            break; // next is human - stop auto-loop
                        }
                    };
                    playLoop();
                }
            } catch (e) {
                console.error('Error starting bot play loop after human play:', e);
            }

            // For a human play we already emitted trick-completed above if applicable. Nothing more here.
        } catch (error) {
            console.error('Play card error:', error);
            socket.emit('error', { message: error.message });
        }
    }

    async handleKickPlayer(socket, data) {
        try {
            const userId = socket.user.id;
            // TODO: Implement kick player logic (lobby leader only)
            console.log(`Kick player request from ${userId}:`, data.targetUserId);
            socket.emit('error', { message: 'Kick player not yet implemented' });
        } catch (error) {
            console.error('Kick player error:', error);
            socket.emit('error', { message: error.message });
        }
    }



    handleGetLobbyState(socket) {
        try {
            if (gameManager.lobbyGame) {
                const lobbyState = gameManager.getLobbyState(gameManager.lobbyGame);
                socket.emit('lobby-updated', lobbyState);
            }
        } catch (error) {
            console.error('Get lobby state error:', error);
            socket.emit('error', { message: error.message });
        }
    }

    handleGetGameState(socket, data) {
        try {
            const gameState = gameManager.getGameState(data.gameId);
            if (gameState) {
                socket.emit('game-state-updated', gameState);
            } else {
                socket.emit('error', { message: 'Game not found' });
            }
        } catch (error) {
            console.error('Get game state error:', error);
            socket.emit('error', { message: error.message });
        }
    }

    handleDisconnection(socket) {
        const userId = this.connectedUsers.get(socket.id);
        if (userId) {
            const userName = socket.user?.name || socket.user?.email || 'Unknown';
            console.log(`User disconnected: ${userName} (${userId})`);

            // Remove from tracking
            this.connectedUsers.delete(socket.id);
            if (this.userSockets.has(userId)) {
                this.userSockets.get(userId).delete(socket.id);
                if (this.userSockets.get(userId).size === 0) {
                    this.userSockets.delete(userId);
                    
                    // TODO: Mark player as disconnected in game state
                    // This will be important for game-in-progress disconnection handling
                }
            }
        }
    }

    // Utility method to send message to specific user
    sendToUser(userId, event, data) {
        if (this.userSockets.has(userId)) {
            const socketIds = this.userSockets.get(userId);
            for (const socketId of socketIds) {
                this.io.to(socketId).emit(event, data);
            }
        }
    }

    // Utility method to send message to all players in a game
    sendToGame(gameId, event, data) {
        this.io.to(`game-${gameId}`).emit(event, data);
    }

    // Broadcast current game-state to all connected sockets in a game room.
    // If delayMs > 0, wait before broadcasting (used to keep a completed trick visible).
    broadcastGameStateToRoom(gameId, delayMs = 0) {
        const doBroadcast = () => {
            try {
                const room = this.io.sockets.adapter.rooms.get(`game-${gameId}`);
                if (room) {
                    for (const socketId of room) {
                        const s = this.io.sockets.sockets.get(socketId);
                        if (s && s.user && s.user.id) {
                            const gameState = gameManager.getGameState(gameId, s.user.id);
                            s.emit('game-state', gameState);
                        }
                    }
                }
            } catch (e) {
                console.error('Error broadcasting game-state to room', gameId, e);
            }
        };
        if (delayMs && delayMs > 0) {
            console.log("[DEBUG] Broadcasting game-state with delay:", delayMs);
            setTimeout(doBroadcast, delayMs);
        } else {
            console.log('[DEBUG] Broadcasting game-state immediately');
            doBroadcast();
        }
    }

    // Utility method to send message to lobby
    sendToLobby(gameId, event, data) {
        this.io.to(`lobby-${gameId}`).emit(event, data);
    }
}

// Singleton instance
const socketHandler = new SocketHandler();

module.exports = socketHandler;
