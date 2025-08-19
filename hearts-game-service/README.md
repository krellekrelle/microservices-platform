# Hearts Game Service

This service runs the real-time Hearts game used by the platform. It exposes Socket.IO endpoints for lobby management and gameplay, plus a small HTTP API surface for some admin or non-realtime calls.

## ✅ Current Status: FULLY OPERATIONAL

**Complete Hearts card game implementation** with modern UI enhancements:

### 🎮 Core Features
- **Full Hearts Rules**: Standard 4-player Hearts with all traditional rules
- **Real-time Multiplayer**: Socket.IO-based live synchronization
- **AI Bot Integration**: Server-side bots with strategic gameplay
- **Lobby System**: 4-seat lobby with ready states and leader controls
- **Score Tracking**: Historical round-by-round scoring with persistence
- **Reconnection Support**: Players can disconnect and rejoin seamlessly

### 🎨 Modern UI Features (Recently Added)
- **Player Avatars**: Google OAuth profile pictures with fallback initials
- **Opponent Visualization**: Card back displays showing hand sizes
- **Smooth Animations**: Card play animations from all player positions
- **Tricks Display**: Visual trick collection with horizontal stacking
- **Enhanced Scoreboard**: Grid-based historical scoring (positioned left, high z-index)
- **Responsive Design**: Mobile-friendly layouts and interactions

### 🤖 AI Bot System
- **Smart Strategy**: Bots follow Hearts strategy (avoid points, strategic passing)
- **Seamless Integration**: Bots added/removed by lobby leader
- **Paced Gameplay**: 700ms delays for readable bot actions
- **Full Participation**: Bots handle passing, playing, and all game phases

## Quick start (development)

- Ensure platform `auth-service` and PostgreSQL are available and configured.
- Copy `.env.example` to `.env` and set DB and JWT values.
- From the repository root you can bring the service up with Docker Compose (platform dev stack):

```bash
# from repo root
docker compose up hearts-game-service --build -d
```

- Open the frontend (platform UI) and create/join a lobby to play.
- **New**: Experience enhanced UI with avatars, animations, and detailed scoring!

## Key Features Added Recently

### 🎨 UI Enhancements (August 2025)
- **Player avatars** with Google photos and colored fallback initials
- **Card play animations** that smoothly move from player positions to center
- **Opponent hand visualization** with card back displays
- **Tricks won display** with horizontal card stacking
- **Enhanced scoreboard** showing historical round-by-round scores in grid format
- **Improved positioning**: Scoreboard on left, title centered, higher z-index

### 🤖 Server-side AI Bots
- Lobby leader can add a bot to an empty seat
- Bots are auto-ready and handle both card passing and playing phases automatically
- **Bot strategy**: Pass 3 random cards, play lowest when following suit, strategic void plays
- **Paced gameplay**: 700ms delays between bot actions for readable flow

### 🎯 Game Flow Improvements
- **Trick display timing**: Server shows completed tricks briefly before clearing
- **Animation system**: CardAnimationManager handles coordinated visual effects
- **Historical scoring**: Backend tracks and frontend displays all round results
- **Position-aware animations**: Cards animate from correct opponent positions

## Developer notes

- Game logic and bots are implemented server-side in `services/gameManager.js` and
  orchestrated by `services/socketHandler.js`.
- Personalized `game-state` broadcasts are sent so each player receives their
  own hand. The helper `broadcastGameStateToRoom(gameId, delayMs)` centralizes
  this logic.
- Frontend safety: the client listens for `trick-completed` and shows the trick
  transiently as a visual aid; server is authoritative.

## Files of interest
- `server.js` – Express + Socket.IO entrypoint
- `services/gameManager.js` – core game rules and bot logic
- `services/socketHandler.js` – socket event handling, bot orchestration and broadcast helper
- `models/HeartsGame.js` – game state model with historical round tracking
- `public/hearts-game.js` – frontend with animation system and enhanced UI
- `public/hearts-game.css` – responsive styling with avatar and animation support
- `public/` – static frontend used for quick local testing

## 🚀 Future Development Roadmap

### High Priority
- **Save Game Feature**: Lobby leader ability to save/pause active games
- **Auto-Pause Protection**: Auto-stop games paused >15 minutes (disconnected players)
- **Continue Saved Games**: Resume functionality for unfinished games

### Enhancement Backlog
- **Complete Mobile Optimization**: Touch interactions and responsive layouts
- **Advanced Bot AI**: Difficulty levels and improved strategy
- **Spectator Mode**: Watch games in progress
- **Tournament System**: Multi-game competitions with brackets

See `DEVELOPMENT.md` for detailed implementation notes and `UI-UPGRADE-PLAN.md` for UI enhancement specifications.
