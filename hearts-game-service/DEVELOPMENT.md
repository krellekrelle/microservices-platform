# Hearts Game Service - Development Guide

## 🎯 Service Overview

**Purpose**: Real-time multiplayer Hearts card game with lobby system and persistent game tracking  
**Port**: 3004  
**Role**: WebSocket-based card game with real-time synchronization and comprehensive game state management  
**Dependencies**: auth-service, PostgreSQL database, Socket.IO  
**Security**: JWT authentication required (approved users only)  
**Frontend**: HTML with Socket.IO client for real-time updates and lobby management

## 🃏 Game Rules Implementation

### Standard Hearts Rules
- **Players**: Exactly 4 players required
- **Objective**: Lowest score wins (hearts = -1 point, Queen of Spades = -13 points)
- **Shooting the Moon**: Taking all hearts + Queen of Spades = +26 points to all other players
- **Game End**: First player to reach 100 points (or more) triggers game end
- **Winner**: Player with lowest score when game ends

### Card Passing System
- **Round 1**: Pass 3 cards to left neighbor
- **Round 2**: Pass 3 cards to right neighbor  
- **Round 3**: Pass 3 cards to across neighbor
- **Round 4**: No passing
- **Repeat**: Cycle continues (left, right, across, none)

### Trick Playing
- **Leading**: Player with 2 of Clubs leads first trick
- **Following**: Must follow suit if possible
- **Hearts Breaking**: Hearts cannot be led until hearts have been "broken" (played on a trick). Hearts cannot be played on first trick unless only hearts in hand.
- **Queen of Spades**: Cannot be played on first trick.

## 🏗️ Architecture Overview

### Technology Stack
```javascript
// Backend
- Node.js + Express.js (consistent with platform)
- Socket.IO (real-time WebSocket communication)
- PostgreSQL (extended with Hearts-specific tables)
- JWT Authentication (platform integration)

// Frontend
- HTML + CSS + Vanilla JavaScript (Phase 1)
- Socket.IO Client for real-time communication
- Future: Vue.js 3 (Composition API) for Phase 2+
- CSS3 Animations (card movements, dealing, etc.)
- Responsive design (mobile support)
```

### Real-time Communication Pattern
```javascript
// Socket.IO Event Architecture
Server Events (emit to clients):
- 'lobby-updated'         // Seat changes, ready status
- 'game-started'          // Game initialization
- 'cards-dealt'           // Initial hand distribution  
- 'passing-phase'         // Show passing interface
- 'cards-passed'          // Cards received from passing
- 'trick-started'         // New trick begins
- 'card-played'           // Player played a card
- 'trick-completed'       // Trick winner determined
- 'round-ended'           // All tricks played, show scores
- 'game-ended'            // Final game results
- 'player-disconnected'   // Handle disconnections
- 'player-reconnected'    // Handle reconnections

Client Events (emit to server):
- 'join-lobby'            // Enter the game lobby
- 'take-seat'             // Claim a seat (position 0-3)
- 'leave-seat'            // Release current seat
- 'ready-for-game'        // Toggle ready status
- 'pass-cards'            // Submit 3 cards for passing
- 'play-card'             // Play card in current trick
- 'kick-player'           // Lobby leader kicks disconnected player
- 'replace-with-bot'      // Lobby leader replaces player with AI
```

## 📊 Database Schema

### New Tables for Hearts Game

```sql
-- Lobby and Game Sessions
CREATE TABLE hearts_games (
    id SERIAL PRIMARY KEY,
    lobby_leader_id INTEGER REFERENCES users(id),
    game_state VARCHAR(20) DEFAULT 'lobby', -- lobby, passing, playing, finished, abandoned
    current_round INTEGER DEFAULT 1,
    current_trick INTEGER DEFAULT 0,
    hearts_broken BOOLEAN DEFAULT FALSE,
    pass_direction VARCHAR(10), -- left, right, across, none
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    winner_id INTEGER REFERENCES users(id),
    abandoned_reason TEXT -- disconnections, timeout, etc.
);

-- Player Seats and Game Participation
CREATE TABLE hearts_players (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES hearts_games(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    seat_position INTEGER CHECK (seat_position >= 0 AND seat_position <= 3),
    is_ready BOOLEAN DEFAULT FALSE,
    is_connected BOOLEAN DEFAULT TRUE,
    current_score INTEGER DEFAULT 0,
    round_score INTEGER DEFAULT 0,
    hand_cards TEXT, -- JSON array of card objects
    is_bot BOOLEAN DEFAULT FALSE,
    bot_difficulty VARCHAR(10) DEFAULT 'medium', -- easy, medium, hard
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, seat_position),
    UNIQUE(game_id, user_id)
);

-- Individual Tricks (for detailed game tracking)
CREATE TABLE hearts_tricks (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES hearts_games(id) ON DELETE CASCADE,
    round_number INTEGER,
    trick_number INTEGER,
    leader_seat INTEGER, -- who led the trick
    winner_seat INTEGER, -- who won the trick
    cards_played TEXT, -- JSON: [{seat: 0, card: "2C"}, {seat: 1, card: "3D"}, ...]
    points_in_trick INTEGER, -- hearts + queen of spades points
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Card Passing Tracking (for future analytics)
CREATE TABLE hearts_card_passes (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES hearts_games(id) ON DELETE CASCADE,
    round_number INTEGER,
    from_seat INTEGER,
    to_seat INTEGER,
    cards_passed TEXT, -- JSON array: ["AH", "KS", "QD"]
    pass_direction VARCHAR(10), -- left, right, across
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Game Results and Statistics
CREATE TABLE hearts_game_results (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES hearts_games(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    seat_position INTEGER,
    final_score INTEGER,
    place_finished INTEGER, -- 1st, 2nd, 3rd, 4th
    hearts_taken INTEGER,
    queen_taken BOOLEAN DEFAULT FALSE,
    shot_moon INTEGER DEFAULT 0, -- number of times shot the moon
    tricks_won INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Spectators (users watching but not playing)
CREATE TABLE hearts_spectators (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES hearts_games(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, user_id)
);
```

### Database Indexes for Performance
```sql
CREATE INDEX idx_hearts_games_state ON hearts_games(game_state);
CREATE INDEX idx_hearts_games_created ON hearts_games(created_at);
CREATE INDEX idx_hearts_players_game_seat ON hearts_players(game_id, seat_position);
CREATE INDEX idx_hearts_players_user ON hearts_players(user_id);
CREATE INDEX idx_hearts_tricks_game_round ON hearts_tricks(game_id, round_number, trick_number);
CREATE INDEX idx_hearts_results_user ON hearts_game_results(user_id);
```

## 🎮 Core Game Logic

### Game State Machine
```javascript
class HeartsGameState {
    constructor() {
        this.state = 'lobby'; // lobby -> passing -> playing -> finished
        this.players = new Map(); // seat -> player data
        this.spectators = new Set();
        this.currentTrick = [];
        this.tricksWon = new Map(); // seat -> tricks won this round
        this.roundScores = new Map(); // seat -> score this round
        this.totalScores = new Map(); // seat -> total game score
    }
    
    // State transitions
    startGame() { /* Validate 4 ready players, deal cards */ }
    startPassing() { /* Begin card passing phase */ }
    startPlaying() { /* All cards passed, begin trick play */ }
    playCard(seat, card) { /* Validate and play card */ }
    completeTrick() { /* Determine winner, start next trick */ }
    endRound() { /* Calculate scores, check game end */ }
    endGame() { /* Save final results to database */ }
}
```

### Card Dealing Algorithm
```javascript
class CardDealer {
    static dealCards() {
        const deck = this.generateDeck();
        this.shuffleDeck(deck);
        
        const hands = [[], [], [], []];
        for (let i = 0; i < 52; i++) {
            hands[i % 4].push(deck[i]);
        }
        
        return hands.map(hand => this.sortHand(hand));
    }
    
    static generateDeck() {
        const suits = ['C', 'D', 'H', 'S']; // Clubs, Diamonds, Hearts, Spades
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
        return suits.flatMap(suit => ranks.map(rank => rank + suit));
    }
}
```

### AI Bot Implementation (Future Enhancement)
```javascript
class HeartsBot {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.strategy = this.getStrategy(difficulty);
    }
    
    selectCardsToPass(hand, direction) {
        // AI logic for card passing
        switch(this.difficulty) {
            case 'easy': return this.passHighCards(hand);
            case 'medium': return this.passStrategically(hand, direction);
            case 'hard': return this.passAdvanced(hand, direction);
        }
    }
    
    playCard(hand, currentTrick, gameState) {
        // AI logic for card playing
        // Consider: valid moves, avoid points, card counting
    }
}
```

## 🖥️ Frontend Architecture (Vue.js)

### Component Structure
```
src/
├── components/
│   ├── Lobby/
│   │   ├── LobbySeats.vue          # 4 seat management
│   │   ├── ReadyButton.vue         # Ready for game toggle
│   │   └── SpectatorList.vue       # List of spectators
│   ├── Game/
│   │   ├── GameTable.vue           # Main game area
│   │   ├── PlayerHand.vue          # Current player's cards
│   │   ├── PlayedCards.vue         # Cards on table
│   │   ├── ScoreBoard.vue          # Current scores
│   │   └── PassingInterface.vue    # Card passing phase
│   ├── Admin/
│   │   ├── GameManagement.vue      # Admin controls
│   │   └── GameHistory.vue         # Historical games
│   └── Common/
│       ├── Card.vue                # Individual card component
│       ├── PlayerInfo.vue          # Player name/status
│       └── ConnectionStatus.vue    # WebSocket status
├── stores/
│   ├── gameStore.js                # Pinia store for game state
│   ├── lobbyStore.js               # Lobby state management
│   └── authStore.js                # Authentication state
├── services/
│   ├── socket.js                   # Socket.IO client setup
│   ├── api.js                      # HTTP API calls
│   └── gameLogic.js                # Client-side validation
└── utils/
    ├── cardUtils.js                # Card sorting, validation
    ├── animations.js               # Card movement animations
    └── constants.js                # Game constants
```

### Vue.js State Management (Pinia)
```javascript
// stores/gameStore.js
export const useGameStore = defineStore('game', {
    state: () => ({
        gameId: null,
        gameState: 'lobby', // lobby, passing, playing, finished
        players: [],
        spectators: [],
        myHand: [],
        currentTrick: [],
        scores: {},
        myPosition: null,
        lobbyLeader: null,
        currentPlayer: null,
        heartsBreoken: false,
        passDirection: null
    }),
    
    actions: {
        // Socket event handlers
        handleLobbyUpdated(data) { /* Update lobby state */ },
        handleCardDealt(cards) { /* Receive initial hand */ },
        handleCardPlayed(data) { /* Update table state */ },
        handleGameEnded(results) { /* Show final scores */ },
        
        // Player actions
        takeSeat(position) { /* Emit take-seat event */ },
        leaveSeat() { /* Emit leave-seat event */ },
        toggleReady() { /* Emit ready-for-game event */ },
        passCards(cards) { /* Emit pass-cards event */ },
        playCard(card) { /* Emit play-card event */ }
    }
});
```

## 🎨 Animation & UI Features

### Card Animations
```css
/* Card dealing animation */
.card-deal {
    animation: dealCard 0.5s ease-out forwards;
}

@keyframes dealCard {
    from {
        transform: translateX(-100px) translateY(-50px) scale(0.5);
        opacity: 0;
    }
    to {
        transform: translateX(0) translateY(0) scale(1);
        opacity: 1;
    }
}

/* Card playing animation */
.card-play {
    animation: playCard 0.8s ease-in-out forwards;
}

@keyframes playCard {
    0% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-20px) scale(1.1); }
    100% { transform: translateY(-100px) scale(0.9); opacity: 0.8; }
}

/* Card passing animation */
.card-pass {
    animation: passCard 1s ease-in-out forwards;
}

@keyframes passCard {
    from {
        transform: translateX(0) rotate(0deg);
        opacity: 1;
    }
    to {
        transform: translateX(var(--pass-direction-x)) translateY(var(--pass-direction-y)) rotate(var(--pass-rotation));
        opacity: 0;
    }
}
```

### Responsive Mobile Design
```css
/* Mobile-first responsive design */
.game-table {
    display: grid;
    grid-template-areas: 
        "player-north"
        "cards-area"
        "player-west player-east"
        "player-south";
    gap: 1rem;
    padding: 1rem;
}

@media (min-width: 768px) {
    .game-table {
        grid-template-areas: 
            ". player-north ."
            "player-west cards-area player-east"
            ". player-south .";
        max-width: 800px;
        margin: 0 auto;
    }
}

/* Touch-friendly card sizes on mobile */
.card {
    width: clamp(40px, 8vw, 60px);
    height: clamp(56px, 11.2vw, 84px);
    touch-action: manipulation;
}

.card:hover, .card:focus {
    transform: translateY(-10px);
    transition: transform 0.2s ease;
}
```

## 🔧 Development Commands

### Docker Setup
```yaml
# Add to docker-compose.yml
hearts-game-service:
  build: ./hearts-game-service
  environment:
    - PORT=3004
    - JWT_SECRET=${JWT_SECRET}
    - AUTH_SERVICE_URL=http://auth-service:3001
    - FRONTEND_URL=${FRONTEND_URL}
    - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@database:5432/${POSTGRES_DB}
  networks:
    - app-network
  depends_on:
    - database
    - auth-service
```

### Local Development
```bash
# Install dependencies
cd hearts-game-service
npm install

# Development with auto-reload
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Database migrations
npm run migrate

# Seed test data
npm run seed
```

### Frontend Build Process
```bash
# Vue.js development server
npm run serve

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

## 🎯 Development Phases

### Phase 1: Core Infrastructure ✅ COMPLETED
- ✅ Basic Express.js + Socket.IO server setup
- ✅ JWT authentication integration with 'auth-token' cookies  
- ✅ Database schema creation and migrations (6 tables + indexes)
- ✅ HTML frontend with Socket.IO client integration
- ✅ Complete lobby with 4-seat management and ready states
- ✅ Docker containerization with proper npm install
- ✅ Caddy reverse proxy configuration with WebSocket support
- ✅ Custom Socket.IO path (/hearts/socket.io/) for proxy compatibility
- ✅ Real-time lobby updates with user detection and seat management
- ✅ Leave seat functionality (inline and button options)
- ✅ User authentication API endpoint for proper user identification

### Phase 2: Game Logic Implementation (PLANNED)
- ⏳ Card dealing and hand management
- ⏳ Card passing system (left, right, across, none)
- ⏳ Trick playing with rule validation
- ⏳ Scoring system and round management
- ⏳ Game state persistence to database

### Phase 3: Real-time Features (PLANNED)
- ⏳ WebSocket event handling for all game actions
- ⏳ Disconnection/reconnection management
- ⏳ Lobby leader controls (kick, replace with bot)
- ⏳ Spectator mode implementation
- ⏳ Real-time score updates and game progression

### Phase 4: UI/UX Polish (PLANNED)
- ⏳ Card animations (dealing, playing, passing)
- ⏳ Responsive mobile design improvements
- ⏳ Sound effects and visual feedback
- ⏳ Enhanced error handling and user feedback
- ⏳ Game history and statistics display

### Phase 5: Advanced Features (FUTURE)
- ⏳ AI bot implementation (basic difficulty levels)
- ⏳ Admin panel for game management
- ⏳ Performance optimization
- ⏳ Comprehensive testing suite
- ⏳ Production deployment and monitoring

## 📋 Current Implementation Status (Phase 1 Complete)

### ✅ Completed Components

#### Server Infrastructure
- **server.js**: Express + Socket.IO server with custom path configuration
  - Port 3004 with WebSocket support through Caddy proxy
  - JWT authentication middleware integration
  - Comprehensive debugging and request logging
  - Socket.IO path: `/hearts/socket.io/` for proxy compatibility
  
- **Package.json**: Complete dependencies for Hearts service
  - Express.js, Socket.IO, PostgreSQL client, JWT handling
  - Proper npm scripts for development and production
  
- **Dockerfile**: Secure containerization with user permissions
  - Node.js Alpine base image with npm install
  - Non-root user execution for security
  - Port 3004 exposure with proper environment handling

#### Database Integration
- **Database Schema**: 6 Hearts-specific tables created and indexed
  - `hearts_games`: Game sessions and state management
  - `hearts_players`: Player seats, ready states, and scoring
  - `hearts_tricks`: Individual trick tracking for gameplay
  - `hearts_card_passes`: Card passing history and analytics
  - `hearts_game_results`: Final game results and statistics
  - `hearts_spectators`: Spectator management for watching games
  
- **Migration Applied**: All tables, indexes, and views successfully created
  - Performance indexes on common query patterns
  - Foreign key relationships for data integrity
  - Statistics view for game analytics

#### Authentication & Security
- **JWT Integration**: Proper platform authentication using 'auth-token' cookies
  - Fixed cookie naming from 'access_token' to 'auth-token'
  - Corrected JWT field usage from 'userId' to 'id'
  - Middleware for both HTTP and Socket.IO authentication
  
- **User API Endpoint**: `/api/user` for authenticated user data
  - Returns current user information (id, name, email, status)
  - Enables proper user identification for seat management

#### Frontend Interface
- **Lobby System**: Complete HTML interface with Socket.IO integration
  - 4-seat grid layout with visual seat states
  - Real-time updates for seat occupancy and ready status
  - Leave seat functionality (both inline and button options)
  - Connection status monitoring with visual indicators
  
- **Socket.IO Client**: Real-time WebSocket communication
  - CDN-based Socket.IO client library
  - Custom path configuration matching server setup
  - Comprehensive event handling for lobby management
  - Debug logging with emoji indicators for troubleshooting

#### Proxy & Routing
- **Caddy Configuration**: WebSocket-enabled reverse proxy
  - Added WebSocket upgrade headers for Hearts service
  - Proper routing to port 3004 with `/hearts/` path prefix
  - Compatible with existing platform proxy setup

### 🔧 Technical Fixes Applied

#### Docker Build Issues
- **Solution**: Changed from `npm ci` to `npm install` for broader compatibility
- **Result**: Hearts service builds successfully without dependency conflicts

#### Database Initialization
- **Issue**: Migration wouldn't run on existing database volumes
- **Solution**: Manual migration execution with proper schema application
- **Result**: All 6 Hearts tables created with proper indexes and relationships

#### Authentication Integration
- **Issue**: Cookie name mismatch ('access_token' vs 'auth-token')
- **Issue**: JWT field mismatch ('userId' vs 'id')
- **Solution**: Updated authentication middleware to match platform standards
- **Result**: Proper user authentication and identification working

#### WebSocket Connectivity
- **Issue**: Socket.IO connections failing through Caddy proxy
- **Solution**: Custom Socket.IO path configuration and WebSocket headers
- **Result**: Real-time communication working reliably

#### User Detection
- **Issue**: Leave seat buttons not appearing due to user ID mismatch
- **Solution**: Added user API endpoint with async user loading on client
- **Result**: Proper seat ownership detection and leave functionality

### 🎮 Functional Features

#### Lobby Management
- **Seat Taking**: Click empty seats to claim them
- **Seat Leaving**: Multiple options to leave seat (inline link + button)
- **Ready Toggle**: Ready/Not Ready status with visual indicators  
- **Leader Controls**: Lobby leader can start games when all ready
- **Player Count**: Live player count display (X/4)
- **Connection Status**: Real-time connection monitoring

#### Real-time Updates
- **Seat Changes**: Immediate updates when players join/leave
- **Ready States**: Live ready status changes across all clients
- **User Recognition**: Proper user identification from authentication
- **Error Handling**: User-friendly error messages with auto-clearing
- **Success Feedback**: Confirmation messages for successful actions

### 🚧 Ready for Phase 2

The Hearts service foundation is complete and fully functional:
- ✅ Authentication integrated with platform standards
- ✅ Database schema created and ready for game data
- ✅ WebSocket communication working through Caddy proxy
- ✅ Lobby system with seat management fully operational
- ✅ Docker containerization working in platform environment
- ✅ User interface responsive and real-time

**Next Development Steps**:
1. Implement card dealing and hand management
2. Add card passing mechanics (left/right/across/none)
3. Build trick playing with Hearts rule validation
4. Create scoring system and round progression
5. Add game state persistence to database tables

## 🚀 Future Enhancements (Not in MVP)

### Lobby Enhancements
- **Avatar Creation**: Custom player avatars in seats
  - SVG-based avatar editor with customizable features
  - Avatar persistence in user profile
  - Animated avatar reactions during gameplay

- **Camera Live Feed**: WebRTC video chat integration
  - Optional webcam viewing during games
  - Picture-in-picture video overlay
  - Mute/unmute controls and privacy settings

- **Sound Library**: Interactive sound effects system
  - Custom sound boards for player interactions
  - Card playing sounds, celebration sounds
  - Volume controls and sound preferences

### Analytics & AI Training
- **Comprehensive Game Tracking**: Enhanced data collection
  - Decision timing analysis (how long to choose cards)
  - Passing strategy patterns per player
  - Trick-by-trick decision trees
  - Advanced statistics (shooting moon success rate, etc.)

- **AI Training Data**: Machine learning dataset preparation
  - Export game data for neural network training
  - Player behavior pattern analysis
  - Optimal play suggestion engine
  - Advanced bot personalities based on real player styles

### Theming & Customization
- **Lobby Themes**: Visual customization options
  - Seasonal themes (Christmas, Halloween, etc.)
  - Color scheme variants (dark mode, high contrast)
  - Table felt patterns and background options

- **Card Deck Themes**: Multiple card designs
  - Classic playing card designs
  - Custom artistic card sets
  - Animated card faces
  - Regional card style preferences

### Advanced Game Modes
- **Tournament Mode**: Multi-game competitions
  - Bracket-style tournaments with multiple tables
  - League play with seasonal rankings
  - Private tournament creation for groups

- **Variants**: Alternative Hearts rules
  - No Queen of Spades variant
  - Different point values
  - Team Hearts (partners across table)
  - Custom house rules per lobby

## 🔍 Testing Strategy

### Unit Tests
```javascript
// Game logic testing
describe('Hearts Game Logic', () => {
    test('should deal 13 cards to each player', () => {
        const hands = CardDealer.dealCards();
        expect(hands).toHaveLength(4);
        hands.forEach(hand => expect(hand).toHaveLength(13));
    });
    
    test('should validate card plays correctly', () => {
        const game = new HeartsGame();
        // Test valid/invalid card plays
    });
    
    test('should calculate scores correctly', () => {
        // Test scoring logic including shooting the moon
    });
});
```

### Integration Tests
```javascript
// Socket.IO event testing
describe('Real-time Game Events', () => {
    test('should handle player joining lobby', async () => {
        const client = new SocketClient();
        await client.emit('join-lobby');
        expect(client.received('lobby-updated')).toBeTruthy();
    });
    
    test('should start game when 4 players ready', async () => {
        // Test game start conditions
    });
});
```

### End-to-End Tests
```javascript
// Cypress testing for full game flow
describe('Complete Hearts Game', () => {
    it('should play a full game from lobby to finish', () => {
        cy.visit('/hearts');
        cy.get('[data-cy=seat-0]').click();
        cy.get('[data-cy=ready-button]').click();
        // ... complete game simulation
    });
});
```

## 📊 Performance Considerations

### WebSocket Optimization
- **Event Batching**: Group related events to reduce message frequency
- **Compression**: Enable Socket.IO compression for large payloads
- **Room Management**: Efficient Socket.IO room usage for game isolation
- **Memory Management**: Proper cleanup of completed games

### Database Optimization
- **Connection Pooling**: Efficient PostgreSQL connection management
- **Query Optimization**: Indexed queries for game history and statistics
- **Data Archival**: Move old games to archive tables for performance
- **Caching**: Redis caching for active game states (future enhancement)

### Frontend Performance
- **Component Lazy Loading**: Load game components only when needed
- **Virtual Scrolling**: For large game history lists
- **Animation Performance**: CSS transforms over layout changes
- **Bundle Optimization**: Code splitting for Vue.js components

## 🛡️ Security Considerations

### Game Integrity
- **Server-side Validation**: All game moves validated on server
- **Anti-cheating**: Hand visibility restricted to individual players
- **Timeout Protection**: Automatic timeout for inactive players
- **State Verification**: Regular game state consistency checks

### Authentication & Authorization
- **JWT Validation**: Every Socket.IO connection authenticated
- **User Approval**: Only approved platform users can play
- **Admin Controls**: Proper permission checks for admin actions
- **Rate Limiting**: Prevent spam and abuse of game actions

### Data Protection
- **Input Sanitization**: All user inputs validated and sanitized
- **SQL Injection Prevention**: Parameterized database queries
- **XSS Protection**: Proper output encoding in Vue.js templates
- **CORS Configuration**: Appropriate cross-origin settings

## 📈 Monitoring & Analytics

### Game Metrics
- **Game Duration**: Average time per game and round
- **Player Retention**: Session length and return rate
- **Error Rates**: Failed game actions and disconnections

### Performance Monitoring
- **WebSocket Latency**: Real-time communication performance
- **Database Query Performance**: Slow query identification
- **Memory Usage**: Game state memory consumption
- **CPU Utilization**: Server performance under load

### Business Intelligence
- **Player Engagement**: Most active players and peak hours
- **Game Completion Rates**: Percentage of games finished vs abandoned
- **Feature Usage**: Which features are most/least used
- **Mobile vs Desktop**: Platform usage statistics

---

## 🎮 Ready to Start Development!

This Hearts game service will integrate seamlessly with your existing microservices platform while providing a rich, real-time gaming experience. The Vue.js frontend will offer smooth animations and mobile support, while the Socket.IO backend ensures responsive multiplayer gameplay.

The phased development approach allows for iterative testing and refinement, with the future enhancement roadmap providing clear direction for advanced features like avatars, video chat, and AI training data collection.

**Next Steps**: 
1. Create the service directory structure
2. Set up package.json with dependencies  
3. Implement basic server with authentication
4. Create database migrations
5. Build Vue.js frontend boilerplate
6. Begin Phase 1 development!
