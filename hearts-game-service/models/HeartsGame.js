const { v4: uuidv4 } = require('uuid');

class HeartsGame {
    constructor(id = null) {
        this.id = id || uuidv4();
        this.state = 'lobby'; // lobby, passing, playing, finished, abandoned
        this.players = new Map(); // seat -> player data
        this.spectators = new Set();
        this.lobbyLeader = null;
        
        // Game state
        this.currentRound = 1;
        this.currentTrick = 0;
        this.heartsBreoken = false;
        this.passDirection = this.getPassDirection(1); // left, right, across, none
        
        // Trick state
        this.currentTrickCards = []; // [{seat, card, player}]
        this.trickLeader = null;
        this.tricksWon = new Map(); // seat -> tricks won this round
        this.roundScores = new Map(); // seat -> score this round
        this.totalScores = new Map(); // seat -> total game score
        
        this.createdAt = new Date();
        this.startedAt = null;
        this.finishedAt = null;
    }

    // Seat management
    addPlayer(userId, userName, seat) {
        if (this.state !== 'lobby') {
            throw new Error('Cannot join game in progress');
        }
        
        if (this.players.has(seat)) {
            throw new Error('Seat already taken');
        }
        
        // Check if user is already in another seat
        for (const [existingSeat, player] of this.players) {
            if (player.userId === userId) {
                throw new Error('User already in game');
            }
        }
        
        const player = {
            userId,
            userName,
            seat,
            isReady: false,
            isConnected: true,
            hand: [],
            totalScore: 0,
            roundScore: 0,
            isBot: false
        };
        
        this.players.set(seat, player);
        
        // Set lobby leader if first player
        if (this.lobbyLeader === null) {
            this.lobbyLeader = seat;
        }
        
        return player;
    }

    removePlayer(seat) {
        if (!this.players.has(seat)) {
            throw new Error('Player not found');
        }
        
        // If game is in progress, don't remove - just mark as disconnected
        if (this.state !== 'lobby') {
            this.players.get(seat).isConnected = false;
            return { disconnected: true };
        }
        
        this.players.delete(seat);
        
        // Reassign lobby leader if needed
        if (this.lobbyLeader === seat && this.players.size > 0) {
            this.lobbyLeader = Math.min(...this.players.keys());
        } else if (this.players.size === 0) {
            this.lobbyLeader = null;
        }
        
        return { removed: true };
    }

    toggleReady(seat) {
        if (!this.players.has(seat)) {
            throw new Error('Player not found');
        }
        
        const player = this.players.get(seat);
        player.isReady = !player.isReady;
        
        return player.isReady;
    }

    canStartGame() {
        return this.players.size === 4 && 
               Array.from(this.players.values()).every(p => p.isReady && p.isConnected);
    }

    // Game flow
    startGame() {
        if (!this.canStartGame()) {
            throw new Error('Cannot start game - need 4 ready players');
        }
        
        this.state = 'passing';
        this.startedAt = new Date();
        
        // Deal cards
        const hands = this.dealCards();
        hands.forEach((hand, index) => {
            if (this.players.has(index)) {
                this.players.get(index).hand = hand;
            }
        });
        
        return {
            gameStarted: true,
            hands: this.getPlayerHands()
        };
    }

    dealCards() {
        const deck = this.generateDeck();
        this.shuffleDeck(deck);
        
        const hands = [[], [], [], []];
        for (let i = 0; i < 52; i++) {
            hands[i % 4].push(deck[i]);
        }
        
        return hands.map(hand => this.sortHand(hand));
    }

    generateDeck() {
        const suits = ['C', 'D', 'H', 'S']; // Clubs, Diamonds, Hearts, Spades
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
        return suits.flatMap(suit => ranks.map(rank => rank + suit));
    }

    shuffleDeck(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
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

    getPassDirection(round) {
        const directions = ['left', 'right', 'across', 'none'];
        return directions[(round - 1) % 4];
    }

    // Pass cards: mark player as ready and store their selection, but do not remove cards yet
    passCards(seat, cards) {
        if (this.state !== 'passing') {
            throw new Error('Not in passing phase');
        }
        if (this.passDirection === 'none') {
            throw new Error('No passing this round');
        }
        if (!this.players.has(seat)) {
            throw new Error('Player not found');
        }
        if (cards.length !== 3) {
            throw new Error('Must pass exactly 3 cards');
        }
        const player = this.players.get(seat);
        // Validate cards are in player's hand
        for (const card of cards) {
            if (!player.hand.includes(card)) {
                throw new Error(`Card ${card} not in hand`);
            }
        }
        // Mark as ready and store selection
        player.readyToPass = true;
        player.pendingPassedCards = [...cards];
        return this.checkAllPlayersReadyToPass();
    }

    checkAllPlayersReadyToPass() {
        const allReady = Array.from(this.players.values())
            .every(p => p.readyToPass && p.pendingPassedCards && p.pendingPassedCards.length === 3);
        if (allReady) {
            this.performCardPassing();
            this.state = 'playing';
            this.findTrickLeader();
            return { allCardsPassed: true, trickLeader: this.trickLeader };
        }
        return { allCardsPassed: false };
    }

    // Actually perform the card passing for all players at once
    performCardPassing() {
        if (this.passDirection === 'none') return;
        const passMap = {
            'left': { 0: 1, 1: 2, 2: 3, 3: 0 },
            'right': { 0: 3, 1: 0, 2: 1, 3: 2 },
            'across': { 0: 2, 1: 3, 2: 0, 3: 1 }
        };
        const distribution = passMap[this.passDirection];
        // Remove passed cards from each hand
        for (const [seat, player] of this.players) {
            if (player.pendingPassedCards) {
                for (const card of player.pendingPassedCards) {
                    const idx = player.hand.indexOf(card);
                    if (idx !== -1) player.hand.splice(idx, 1);
                }
            }
        }
        // Distribute passed cards
        for (const [fromSeat, player] of this.players) {
            const toSeat = distribution[fromSeat];
            const receiver = this.players.get(toSeat);
            if (receiver && player.pendingPassedCards) {
                receiver.hand.push(...player.pendingPassedCards);
                receiver.hand = this.sortHand(receiver.hand);
            }
        }
        // Clear passing state
        this.players.forEach(player => {
            delete player.pendingPassedCards;
            delete player.readyToPass;
        });
    }

    distributePassedCards() {
        if (this.passDirection === 'none') return;
        
        const passMap = {
            'left': { 0: 1, 1: 2, 2: 3, 3: 0 },
            'right': { 0: 3, 1: 0, 2: 1, 3: 2 },
            'across': { 0: 2, 1: 3, 2: 0, 3: 1 }
        };
        
        const distribution = passMap[this.passDirection];
        
        for (const [fromSeat, player] of this.players) {
            const toSeat = distribution[fromSeat];
            const receiver = this.players.get(toSeat);
            
            if (receiver && player.passedCards) {
                receiver.hand.push(...player.passedCards);
                receiver.hand = this.sortHand(receiver.hand);
            }
        }
        
        // Clear passed cards
        this.players.forEach(player => {
            delete player.passedCards;
        });
    }

    findTrickLeader() {
        // Find who has the 2 of Clubs
        for (const [seat, player] of this.players) {
            if (player.hand.includes('2C')) {
                this.trickLeader = seat;
                return seat;
            }
        }
        return null;
    }

    // Play cards
    playCard(seat, card) {
        if (this.state !== 'playing') {
            throw new Error('Not in playing phase');
        }
        
        if (!this.players.has(seat)) {
            throw new Error('Player not found');
        }
        
        // Check if it's player's turn
        if (!this.isPlayerTurn(seat)) {
            throw new Error('Not your turn');
        }
        
        const player = this.players.get(seat);
        
        if (!player.hand.includes(card)) {
            throw new Error('Card not in hand');
        }
        
        // Validate play, with detailed error messages
        const isFirstTrick = this.currentTrick === 0;
        const isLeading = this.currentTrickCards.length === 0;
        // First trick: must lead with 2C
        if (isFirstTrick && isLeading && card !== '2C') {
            throw new Error('First trick must start with 2♣ (2C)');
        }
        // First trick: no hearts or QS unless only hearts/QS left
        if (isFirstTrick && (card[1] === 'H' || card === 'QS')) {
            const nonHearts = this.players.get(seat).hand.filter(c => c[1] !== 'H' && c !== 'QS');
            if (nonHearts.length > 0) {
                throw new Error('Cannot play hearts or Queen of Spades on the first trick unless you have only hearts/QS');
            }
        }
        // Leading: cannot lead hearts unless broken (or only hearts left)
        if (isLeading && card[1] === 'H' && !this.heartsBreoken) {
            const nonHearts = this.players.get(seat).hand.filter(c => c[1] !== 'H');
            if (nonHearts.length > 0) {
                throw new Error('Cannot lead hearts until hearts have been broken (unless you only have hearts)');
            }
        }
        // Following suit: must follow if possible
        if (!isLeading) {
            const leadSuit = this.currentTrickCards[0].card[1];
            const cardSuit = card[1];
            if (cardSuit !== leadSuit) {
                const suitCards = this.players.get(seat).hand.filter(c => c[1] === leadSuit);
                if (suitCards.length > 0) {
                    throw new Error(`You must follow suit (${leadSuit}) if possible`);
                }
            }
        }
        // If not valid for any other reason
        if (!this.isValidPlay(seat, card)) {
            throw new Error('Invalid card play');
        }
        
        // Remove card from hand
        const cardIndex = player.hand.indexOf(card);
        player.hand.splice(cardIndex, 1);
        
        // Add to current trick
        this.currentTrickCards.push({
            seat,
            card,
            player: player.userName
        });
        
        // Check if trick is complete
        if (this.currentTrickCards.length === 4) {
            return this.completeTrick();
        }
        
        return {
            trickComplete: false,
            nextPlayer: this.getNextPlayer()
        };
    }

    isPlayerTurn(seat) {
        if (this.currentTrickCards.length === 0) {
            return seat === this.trickLeader;
        }
        
        // Find next player in order
        const lastPlayerSeat = this.currentTrickCards[this.currentTrickCards.length - 1].seat;
        const nextSeat = (lastPlayerSeat + 1) % 4;
        return seat === nextSeat;
    }

    isValidPlay(seat, card) {
        const isFirstTrick = this.currentTrick === 0;
        const isLeading = this.currentTrickCards.length === 0;
        
        // First trick: must lead with 2C
        if (isFirstTrick && isLeading) {
            return card === '2C';
        }
        
        // First trick: no hearts or Queen of Spades
        if (isFirstTrick) {
            if (card[1] === 'H' || card === 'QS') {
                // Unless only hearts in hand
                const player = this.players.get(seat);
                const nonHearts = player.hand.filter(c => c[1] !== 'H' && c !== 'QS');
                return nonHearts.length === 0;
            }
        }
        
        // Leading: cannot lead hearts unless broken (or only hearts left)
        if (isLeading && card[1] === 'H' && !this.heartsBreoken) {
            const player = this.players.get(seat);
            const nonHearts = player.hand.filter(c => c[1] !== 'H');
            return nonHearts.length === 0;
        }
        
        // Following suit
        if (!isLeading) {
            const leadSuit = this.currentTrickCards[0].card[1];
            const cardSuit = card[1];
            
            if (cardSuit !== leadSuit) {
                // Must follow suit if possible
                const player = this.players.get(seat);
                const suitCards = player.hand.filter(c => c[1] === leadSuit);
                return suitCards.length === 0;
            }
        }
        
        return true;
    }

    completeTrick() {
        const winner = this.findTrickWinner();
        const points = this.calculateTrickPoints();
        
        // Update hearts broken status
        if (points > 0) {
            this.heartsBreoken = true;
        }
        
        // Update scores
        const winnerPlayer = this.players.get(winner);
        winnerPlayer.roundScore += points;
        
        // Update tricks won
        if (!this.tricksWon.has(winner)) {
            this.tricksWon.set(winner, 0);
        }
        this.tricksWon.set(winner, this.tricksWon.get(winner) + 1);
        
        // Prepare for next trick
        this.currentTrick++;
        this.trickLeader = winner;
        const completedTrick = [...this.currentTrickCards];
        this.currentTrickCards = [];
        
        // Check if round is complete
        if (this.currentTrick === 13) {
            return this.completeRound(completedTrick, winner, points);
        }
        
        return {
            trickComplete: true,
            winner,
            points,
            trickCards: completedTrick,
            nextLeader: winner,
            roundComplete: false
        };
    }

    findTrickWinner() {
        const leadSuit = this.currentTrickCards[0].card[1];
        const suitCards = this.currentTrickCards.filter(play => play.card[1] === leadSuit);
        
        const rankOrder = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, 
                           '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
        
        let winner = suitCards[0];
        for (const play of suitCards) {
            if (rankOrder[play.card[0]] > rankOrder[winner.card[0]]) {
                winner = play;
            }
        }
        
        return winner.seat;
    }

    calculateTrickPoints() {
        let points = 0;
        for (const play of this.currentTrickCards) {
            if (play.card[1] === 'H') {
                points += 1; // Each heart is 1 point
            } else if (play.card === 'QS') {
                points += 13; // Queen of Spades is 13 points
            }
        }
        return points;
    }

    completeRound(lastTrick, lastWinner, lastPoints) {
        // Check for shooting the moon
        const moonShooter = this.checkShootingMoon();
        
        if (moonShooter !== null) {
            // Shooter gets 0, everyone else gets 26
            this.players.forEach((player, seat) => {
                if (seat === moonShooter) {
                    player.roundScore = 0;
                } else {
                    player.roundScore = 26;
                }
            });
        }
        
        // Update total scores
        this.players.forEach(player => {
            player.totalScore += player.roundScore;
        });
        
        // Check for game end
        const maxScore = Math.max(...Array.from(this.players.values()).map(p => p.totalScore));
        const gameEnded = maxScore >= 100;
        
        if (gameEnded) {
            return this.endGame(lastTrick, lastWinner, lastPoints);
        }
        
        // Prepare for next round
        this.startNextRound();
        
        return {
            trickComplete: true,
            winner: lastWinner,
            points: lastPoints,
            trickCards: lastTrick,
            roundComplete: true,
            roundScores: this.getRoundScores(),
            totalScores: this.getTotalScores(),
            moonShooter,
            gameEnded: false,
            nextRound: this.currentRound
        };
    }

    checkShootingMoon() {
        for (const [seat, player] of this.players) {
            if (player.roundScore === 26) {
                return seat;
            }
        }
        return null;
    }

    startNextRound() {
        this.currentRound++;
        this.currentTrick = 0;
        this.heartsBreoken = false;
        this.passDirection = this.getPassDirection(this.currentRound);
        this.tricksWon.clear();
        
        // Reset round scores
        this.players.forEach(player => {
            player.roundScore = 0;
        });
        
        // Deal new cards
        const hands = this.dealCards();
        hands.forEach((hand, index) => {
            if (this.players.has(index)) {
                this.players.get(index).hand = hand;
            }
        });
        
        // Start passing phase (unless it's a no-pass round)
        if (this.passDirection === 'none') {
            this.state = 'playing';
            this.findTrickLeader();
        } else {
            this.state = 'passing';
        }
    }

    endGame(lastTrick, lastWinner, lastPoints) {
        this.state = 'finished';
        this.finishedAt = new Date();
        
        // Find winner (lowest score)
        let winner = null;
        let lowestScore = Infinity;
        
        this.players.forEach((player, seat) => {
            if (player.totalScore < lowestScore) {
                lowestScore = player.totalScore;
                winner = seat;
            }
        });
        
        return {
            trickComplete: true,
            winner: lastWinner,
            points: lastPoints,
            trickCards: lastTrick,
            roundComplete: true,
            gameEnded: true,
            gameWinner: winner,
            finalScores: this.getTotalScores()
        };
    }

    // Utility methods
    getPlayerHands() {
        const hands = {};
        this.players.forEach((player, seat) => {
            hands[seat] = player.hand;
        });
        return hands;
    }

    getRoundScores() {
        const scores = {};
        this.players.forEach((player, seat) => {
            scores[seat] = player.roundScore;
        });
        return scores;
    }

    getTotalScores() {
        const scores = {};
        this.players.forEach((player, seat) => {
            scores[seat] = player.totalScore;
        });
        return scores;
    }

    getNextPlayer() {
        if (this.currentTrickCards.length === 0) return this.trickLeader;
        const lastSeat = this.currentTrickCards[this.currentTrickCards.length - 1].seat;
        return (lastSeat + 1) % 4;
    }

    // Serialization for database storage
    toJSON() {
        return {
            id: this.id,
            state: this.state,
            players: Array.from(this.players.entries()),
            spectators: Array.from(this.spectators),
            lobbyLeader: this.lobbyLeader,
            currentRound: this.currentRound,
            currentTrick: this.currentTrick,
            heartsBreoken: this.heartsBreoken,
            passDirection: this.passDirection,
            currentTrickCards: this.currentTrickCards,
            trickLeader: this.trickLeader,
            tricksWon: Array.from(this.tricksWon.entries()),
            createdAt: this.createdAt,
            startedAt: this.startedAt,
            finishedAt: this.finishedAt
        };
    }

    static fromJSON(data) {
        const game = new HeartsGame(data.id);
        Object.assign(game, data);
        game.players = new Map(data.players);
        game.spectators = new Set(data.spectators);
        game.tricksWon = new Map(data.tricksWon || []);
        return game;
    }
}

module.exports = HeartsGame;
