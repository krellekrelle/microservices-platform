# Hearts Game Service

This service runs the real-time Hearts game used by the platform. It exposes Socket.IO endpoints for lobby management and gameplay, plus a small HTTP API surface for some admin or non-realtime calls.

## Quick start (development)

- Ensure platform `auth-service` and PostgreSQL are available and configured.
- Copy `.env.example` to `.env` and set DB and JWT values.
- From the repository root you can bring the service up with Docker Compose (platform dev stack):

```bash
# from repo root
docker compose up hearts-game-service --build -d
```

- Open the frontend (platform UI) and create/join a lobby to play.

## Key behaviors added recently

- Server-side AI bots: the lobby leader can add a bot to an empty seat. Bots are
  auto-ready and will handle both the card passing and playing phases automatically.
- Bot strategy (simple): bots pass 3 random cards, when following suit they play
  the lowest valid card; if void in suit they try Queen of Spades, then highest
  heart, then highest card.
- Trick display timing: when a trick completes the server emits `trick-completed`
  immediately, waits a short display interval (default 1500ms), then broadcasts
  the updated `game-state` which clears the trick. Bots are paced with a 700ms
  delay between plays to make the flow readable.

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
- `services/socketHandler.js` – socket event handling, bot orchestration and
  broadcast helper
- `public/` – static frontend used for quick local testing

If you want me to add documentation for changing the display interval or to
extract the delays into config/constants, I can make that change next.
