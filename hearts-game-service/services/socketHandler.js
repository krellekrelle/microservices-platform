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
            if (!gameManager.lobbyGame) {
                socket.emit('error', { message: 'No game in progress' });
                return;
            }
            // Find the player's seat
            let seat = null;
            for (const [seatNum, player] of gameManager.lobbyGame.players) {
                if (player.userId === userId) {
                    seat = seatNum;
                    break;
                }
            }
            if (seat === null) {
                socket.emit('error', { message: 'You are not seated in the game' });
                return;
            }
            // Validate cards
            const cards = Array.isArray(data.cards) ? data.cards : [];
            if (cards.length !== 3) {
                socket.emit('error', { message: 'You must select exactly 3 cards to pass.' });
                return;
            }
            // Save the seat number and cards
            const player = gameManager.lobbyGame.players.get(seat);
            if (!player) {
                socket.emit('error', { message: 'Player not found in game.' });
                return;
            }
            if (player.readyToPass) {
                socket.emit('error', { message: 'You have already passed cards.' });
                return;
            }
            player.readyToPass = true;
            player.pendingPassedCards = [...cards];

            // Check if all seats have passed
            let allPassed = true;
            for (const p of gameManager.lobbyGame.players.values()) {
                if (!p.readyToPass || !Array.isArray(p.pendingPassedCards) || p.pendingPassedCards.length !== 3) {
                    allPassed = false;
                    break;
                }
            }

            // If not all have passed, just emit updated game state
            const room = this.io.sockets.adapter.rooms.get(`game-${gameManager.lobbyGame.id}`);
            if (room) {
                for (const socketId of room) {
                    const s = this.io.sockets.sockets.get(socketId);
                    if (s && s.user && s.user.id) {
                        const gameState = gameManager.getGameState(gameManager.lobbyGame.id, s.user.id);
                        // s.emit('game-state', gameState);
                    }
                }
            }
            // socket.emit('pass-cards-success', { success: true });

            if (!allPassed) {
                return;
            }

            // All have passed: update hands and start playing round
            // Perform the card passing
            const passMap = {
                'left': { 0: 1, 1: 2, 2: 3, 3: 0 },
                'right': { 0: 3, 1: 0, 2: 1, 3: 2 },
                'across': { 0: 2, 1: 3, 2: 0, 3: 1 }
            };
            const direction = gameManager.lobbyGame.passDirection;
            const distribution = passMap[direction];
            // Remove passed cards from each hand
            for (const [seatNum, p] of gameManager.lobbyGame.players) {
                if (p.pendingPassedCards) {
                    for (const card of p.pendingPassedCards) {
                        const idx = p.hand.indexOf(card);
                        if (idx !== -1) p.hand.splice(idx, 1);
                    }
                }
            }
            // Distribute passed cards
            for (const [fromSeat, p] of gameManager.lobbyGame.players) {
                const toSeat = distribution[fromSeat];
                const receiver = gameManager.lobbyGame.players.get(toSeat);
                if (receiver && p.pendingPassedCards) {
                    receiver.hand.push(...p.pendingPassedCards);
                    // Sort hand by suit and then rank
                    receiver.hand = this.sortHand(receiver.hand);
                }
            }
            // Clear passing state
            for (const p of gameManager.lobbyGame.players.values()) {
                delete p.pendingPassedCards;
                delete p.readyToPass;
            }
            // Set state to playing and find trick leader
            gameManager.lobbyGame.state = 'playing';
            // Find trick leader (2C)
            let trickLeader = null;
            for (const [seatNum, p] of gameManager.lobbyGame.players) {
                if (p.hand.includes('2C')) {
                    trickLeader = seatNum;
                    break;
                }
            }
            gameManager.lobbyGame.trickLeader = trickLeader;

            // Emit updated game state to all
            if (room) {
                for (const socketId of room) {
                    const s = this.io.sockets.sockets.get(socketId);
                    if (s && s.user && s.user.id) {
                        const gameState = gameManager.getGameState(gameManager.lobbyGame.id, s.user.id);
                        s.emit('game-state', gameState);
                    }
                }
            }
            this.io.to(`game-${gameManager.lobbyGame.id}`).emit('all-cards-passed', { trickLeader });
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
            // TODO: Implement card playing logic
            console.log(`Play card from ${userId}:`, data.card);
            socket.emit('error', { message: 'Card playing not yet implemented' });
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
