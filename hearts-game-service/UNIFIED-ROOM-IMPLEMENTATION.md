# Unified Room Implementation - Hearts Game Service

**Branch:** `feature/unified-hearts-room`  
**Date:** November 15, 2025

## Overview

This feature simplifies the Hearts game by implementing a **unified persistent room** concept. Players no longer transition between separate "lobby" and "game" rooms. Instead, they remain in one room throughout the entire session, which cycles through different states.

## Key Changes

### Concept
- **One Room, Multiple States**: The same room transitions through `lobby` → `passing` → `playing` → `finished` → `lobby` (repeat)
- **Persistent Seats**: Players keep their seats between games until they manually leave
- **Controlled Return**: After a game ends, players must click "Return to Lobby" to reset
- **Empty Seat Policy**: New players can join empty seats between games

## Implementation Details

### Backend Changes

#### 1. HeartsGame Model (`models/HeartsGame.js`)
- **Added `markPlayerReadyToReturn(seat)`**: Marks a player as ready to return to lobby after game ends
- **Added `checkAllPlayersReadyToReturn()`**: Checks if all human players are ready (bots are auto-ready)
- **Updated `resetToLobby()`**: Clears game state while preserving players, seats, and lobby leader
- **Updated `endGame()`**: Automatically marks bots as ready to return

#### 2. GameManager (`services/gameManager.js`)
- **Modified `removeFinishedGames()`**: Preserves the `lobbyGame` even when finished
- **Added `returnToLobby(userId)`**: Handles player return logic, triggers reset when all ready
- **Updated `getLobbyState(game)`**: Includes `readyToReturn` and `profilePicture` fields

#### 3. SocketHandler (`services/socketHandler.js`)
- **Added `handleReturnToLobby(socket)`**: Handles the `return-to-lobby` socket event
- **Broadcasts `lobby-updated`**: When all players return, broadcasts new lobby state
- **Broadcasts `game-ended-reset`**: Signals clients to clear end game view

### Frontend Changes

#### 1. useSocket Composable (`src/composables/useSocket.js`)
- **Added `emitReturnToLobby()`**: Emits the `return-to-lobby` event
- **Added listener for `game-ended-reset`**: Clears end game view when all players return
- **Added listener for `waiting-for-players`**: Shows toast when waiting for others

#### 2. GameEndedView (`src/components/GameEndedView.vue`)
- **Updated `returnToLobby()`**: Now calls `emitReturnToLobby()` instead of `emitJoinLobby()`

## User Experience Flow

### 1. Joining and Playing
```
1. Player joins lobby and takes a seat
2. Players ready up (or lobby leader adds bots)
3. Lobby leader starts game
4. Game transitions: lobby → passing → playing
5. Game completes and transitions to 'finished' state
```

### 2. Returning to Lobby
```
1. Game ends, players see results screen
2. Each player clicks "Return to Lobby" button
   - Bots are automatically marked as ready
   - Human players must explicitly click
3. When all players have clicked:
   - Game resets to 'lobby' state
   - All players remain in their seats
   - Players are marked as NOT ready (must ready up again)
4. Cycle can repeat
```

### 3. Between Games
```
- Players keep their seats (secured for next game)
- Players can leave their seat if desired
- New players can join empty seats
- Existing players can switch seats if they leave and retake
```

## Technical Highlights

### State Management
- Game states: `lobby` | `passing` | `playing` | `finished`
- Player states: `isReady` (for game start), `readyToReturn` (after game ends)
- Same `gameId` persists throughout the session

### Bot Handling
- Bots automatically marked `readyToReturn: true` when game ends
- `checkAllPlayersReadyToReturn()` only checks human players
- Prevents waiting indefinitely for bots

### Room Persistence
- Players stay in `lobby-${gameId}` socket room throughout
- No need to rejoin rooms between states
- Video chat streams naturally persist

### Database Efficiency
- Lobby games remain in-memory until game starts
- Finished games are NOT removed if they're the active `lobbyGame`
- Prevents unnecessary game creation/deletion cycles

## Benefits

1. **Simpler Mental Model**: One room, multiple states
2. **Seat Persistence**: Players don't lose seats between games
3. **Video Chat Continuity**: No room transitions to break video streams
4. **Better UX**: Clear "Return to Lobby" action vs automatic transitions
5. **Less Code Complexity**: No multiple lobby management

## Testing Checklist

- [x] Game completes and transitions to finished state
- [x] Players can click "Return to Lobby"
- [x] Waiting message shows when not all players ready
- [x] Game resets to lobby when all players return
- [x] Players keep their seats after reset
- [x] Players marked as not ready after reset
- [x] Bots automatically marked as ready to return
- [x] Empty seats can be filled by new players
- [ ] Video chat persists through transitions (requires live testing)
- [ ] Multiple game cycles work correctly (requires live testing)

## Future Enhancements

1. **Auto-return Timer**: Option to auto-return players after X seconds
2. **Spectator Mode**: Allow spectators for full lobbies
3. **Rematch Button**: Quick rematch with same players
4. **Session Stats**: Track multiple games in same session
5. **Persistent Scores**: Optional cumulative scoring across multiple games

## Migration Notes

### For Existing Code
- Old `emitJoinLobby()` calls after game end should be changed to `emitReturnToLobby()`
- Components relying on room transitions may need adjustment
- Game history/results should account for multiple games with same `gameId`

### Backward Compatibility
- Existing game states are compatible
- Database schema unchanged
- WebSocket events added (not modified)

## Files Modified

1. `hearts-game-service/models/HeartsGame.js`
2. `hearts-game-service/services/gameManager.js`
3. `hearts-game-service/services/socketHandler.js`
4. `hearts-game-service/src/composables/useSocket.js`
5. `hearts-game-service/src/components/GameEndedView.vue`

## Deployment

To deploy this feature:

```bash
# Checkout feature branch
git checkout feature/unified-hearts-room

# Build and start service
docker compose up hearts-game-service --build -d

# Verify logs
docker compose logs hearts-game-service --tail=50
```

To revert:
```bash
git checkout main
docker compose up hearts-game-service --build -d
```

## Notes

- This is a breaking change in user experience (by design)
- Players must now explicitly choose to return to lobby
- Prevents accidental quick-rematch scenarios
- Gives players time to review results before next game
