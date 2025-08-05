const { socketAuth } = require('../middleware/auth');
const gameManager = require('./gameManager');

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

        // Game events
        socket.on('pass-cards', (data) => this.handlePassCards(socket, data));
        socket.on('play-card', (data) => this.handlePlayCard(socket, data));

        // Admin events (lobby leader only)
        socket.on('kick-player', (data) => this.handleKickPlayer(socket, data));
        socket.on('replace-with-bot', (data) => this.handleReplaceWithBot(socket, data));

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
            console.log(`${userName} took seat ${seat}`);
        } catch (error) {
            console.error('Take seat error:', error);
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
                        this.sendToUser(player.userId, 'cards-dealt', {
                            hand: hand,
                            seat: parseInt(seat),
                            passDirection: result.passDirection
                        });
                    }
                }
                console.log(`Lobby name: lobby-${result.gameId}`);
                console.log(`Game name: game-${result.gameId}`);
                this.io.to(`lobby-${result.gameId}`).socketsJoin(`game-${result.gameId}`);
                const gameState = gameManager.getGameState(result.gameId);
                this.io.to(`game-${result.gameId}`).emit('game-state', gameState);
                console.log(`${userName} started game ${result.gameId}`);
            }
        } catch (error) {
            console.error('Start game error:', error);
            socket.emit('error', { message: error.message });
        }
    }

    async handlePassCards(socket, data) {
        try {
            const userId = socket.user.id;
            const cards = Array.isArray(data.cards) ? data.cards : [];
            // Only basic input validation here
            if (cards.length !== 3) {
                socket.emit('error', { message: 'You must select exactly 3 cards to pass.' });
                return;
            }
            // Delegate all game logic to gameManager
            const result = await gameManager.passCards(userId, cards);
            if (result.error) {
                socket.emit('error', { message: result.error });
                return;
            }
            // Notify the user of success
            socket.emit('pass-cards-success', { success: true });
            // Emit updated game state to all players (if provided)
            if (result.emitGameState) {
                const room = this.io.sockets.adapter.rooms.get(`game-${result.gameId}`);
                if (room) {
                    for (const socketId of room) {
                        const s = this.io.sockets.sockets.get(socketId);
                        if (s && s.user && s.user.id) {
                            const gameState = gameManager.getGameState(result.gameId, s.user.id);
                            s.emit('game-state', gameState);
                        }
                    }
                }
            }
            // If all have passed, emit all-cards-passed event
            if (result.allPassed && result.trickLeader !== undefined) {
                this.io.to(`game-${result.gameId}`).emit('all-cards-passed', { trickLeader: result.trickLeader });
            }
        } catch (error) {
            console.error('Pass cards error:', error);
            socket.emit('error', { message: error.message });
        }
    }

    sortHand(hand) {
        const suitOrder = { 'C': 0, 'D': 1, 'H': 2, 'S': 3 };
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
            // Always emit updated game state to all players
            const room = this.io.sockets.adapter.rooms.get(`game-${result.gameId}`);
            if (room) {
                for (const socketId of room) {
                    const s = this.io.sockets.sockets.get(socketId);
                    if (s && s.user && s.user.id) {
                        const gameState = gameManager.getGameState(result.gameId, s.user.id);
                        s.emit('game-state', gameState);
                    }
                }
            }
            // If trick is complete, emit trick-completed event
            if (result.trickComplete) {
                // If roundComplete, include scores and moonShooter
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
                this.io.to(`game-${result.gameId}`).emit('trick-completed', trickCompletedPayload);
            }
            // If round is complete, you may want to emit a round-completed event (not implemented here)
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

    async handleReplaceWithBot(socket, data) {
        try {
            const userId = socket.user.id;
            // TODO: Implement replace with bot logic (lobby leader only)
            console.log(`Replace with bot request from ${userId}:`, data.targetUserId);
            socket.emit('error', { message: 'Replace with bot not yet implemented' });
        } catch (error) {
            console.error('Replace with bot error:', error);
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

    // Utility method to send message to lobby
    sendToLobby(gameId, event, data) {
        this.io.to(`lobby-${gameId}`).emit(event, data);
    }
}

// Singleton instance
const socketHandler = new SocketHandler();

module.exports = socketHandler;
