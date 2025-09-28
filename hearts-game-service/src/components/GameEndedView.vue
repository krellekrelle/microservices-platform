<template>
  <div class="game-ended-view">
    <div class="game-ended-header">
      <h1>🏁 Game Finished!</h1>
    </div>

    <div class="final-results" v-if="gameStore.lobbyState?.scores">
      <h2>Final Scores</h2>
      <div class="results-table">
        <div 
          v-for="(player, index) in sortedPlayers"
          :key="index"
          class="result-row"
          :class="{ winner: index === 0, loser: index === sortedPlayers.length - 1 }"
        >
          <div class="position">{{ index + 1 }}</div>
          <div class="player-info">
            <img 
              v-if="player.profilePicture"
              :src="player.profilePicture" 
              :alt="player.name"
              class="player-avatar"
            >
            <div v-else class="player-avatar-placeholder">
              {{ getPlayerInitials(player.name) }}
            </div>
            <div class="player-name">{{ getPlayerFirstName(player.name) }}</div>
          </div>
          <div class="final-score">{{ player.totalScore }}</div>
          <div class="result-badge">
            <span v-if="index === 0" class="winner-badge">🏆 Winner!</span>
            <span v-else-if="index === sortedPlayers.length - 1" class="loser-badge">💔 Last Place</span>
          </div>
        </div>
      </div>
    </div>

    <div class="game-statistics" v-if="gameStore.lobbyState">
      <h3>Game Statistics</h3>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">{{ gameStore.lobbyState.currentRound || 0 }}</div>
          <div class="stat-label">Rounds Played</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ totalTricks }}</div>
          <div class="stat-label">Total Tricks</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ gameDuration }}</div>
          <div class="stat-label">Game Duration</div>
        </div>
      </div>
    </div>

    <div class="return-controls">
      <button class="return-lobby-btn" @click="returnToLobby">
        🏠 Return to Lobby
      </button>
      
      <button class="new-game-btn" @click="startNewGame" v-if="gameStore.isLobbyLeader">
        🎮 Start New Game
      </button>
    </div>

    <div class="celebration-animation" ref="celebration"></div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { useSocket } from '../composables/useSocket'

const gameStore = useGameStore()
const { emitJoinLobby, emitStartGame } = useSocket()

const sortedPlayers = computed(() => {
  if (!gameStore.lobbyState?.players || !gameStore.lobbyState?.scores?.totals) {
    return []
  }

  return gameStore.lobbyState.players
    .map((player, index) => ({
      ...player,
      seatIndex: index,
      totalScore: gameStore.lobbyState.scores.totals[index] || 0
    }))
    .filter(player => player.name)
    .sort((a, b) => a.totalScore - b.totalScore) // Lower score wins in Hearts
})

const totalTricks = computed(() => {
  if (!gameStore.lobbyState?.tricksWon) return 0
  return Object.values(gameStore.lobbyState.tricksWon).reduce((sum, tricks) => sum + tricks, 0)
})

const gameDuration = computed(() => {
  // This would need to be calculated based on game start/end times
  return "15:30" // Placeholder
})

function getPlayerFirstName(fullName) {
  if (!fullName) return 'Unknown'
  return fullName.split(' ')[0]
}

function getPlayerInitials(fullName) {
  if (!fullName) return '?'
  return fullName.split(' ')
    .map(name => name[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function returnToLobby() {
  emitJoinLobby()
}

function startNewGame() {
  if (gameStore.isLobbyLeader) {
    emitStartGame()
  }
}

onMounted(() => {
  // Mark that we've shown the end game screen
  gameStore.setEndGameShown(true)
  
  // Play celebration animation for winner
  if (sortedPlayers.value.length > 0) {
    const winner = sortedPlayers.value[0]
    if (winner.seatIndex === gameStore.mySeat) {
      // Player won! Show celebration
      console.log('🎉 Congratulations! You won!')
    }
  }
})
</script>

<style scoped>
.game-ended-view {
  padding: 2rem;
  color: white;
  background: linear-gradient(135deg, #1e3c72, #2a5298);
  min-height: 100vh;
  text-align: center;
}

.game-ended-header h1 {
  font-size: 3rem;
  margin-bottom: 2rem;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
  animation: fadeInScale 1s ease-out;
}

@keyframes fadeInScale {
  0% { opacity: 0; transform: scale(0.5); }
  100% { opacity: 1; transform: scale(1); }
}

.final-results {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 2rem;
  margin-bottom: 2rem;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.final-results h2 {
  color: #ffeb3b;
  margin-bottom: 1.5rem;
}

.results-table {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.result-row {
  display: grid;
  grid-template-columns: 50px 1fr auto auto;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 1rem;
  transition: all 0.3s ease;
}

.result-row.winner {
  background: linear-gradient(45deg, rgba(255, 215, 0, 0.2), rgba(255, 235, 59, 0.2));
  border: 2px solid #ffd700;
}

.result-row.loser {
  background: rgba(244, 67, 54, 0.1);
  border: 1px solid rgba(244, 67, 54, 0.3);
}

.position {
  font-size: 1.5rem;
  font-weight: bold;
  color: #ffeb3b;
}

.player-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.player-avatar, .player-avatar-placeholder {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.player-avatar-placeholder {
  background: linear-gradient(45deg, #666, #888);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  color: white;
}

.player-name {
  font-size: 1.1rem;
  font-weight: bold;
}

.final-score {
  font-size: 1.3rem;
  font-weight: bold;
  color: #ffeb3b;
}

.winner-badge {
  background: linear-gradient(45deg, #ffd700, #ffed4e);
  color: #333;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-weight: bold;
  font-size: 0.9rem;
}

.loser-badge {
  background: rgba(244, 67, 54, 0.3);
  color: #f44336;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-weight: bold;
  font-size: 0.9rem;
}

.game-statistics {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 2rem;
  max-width: 500px;
  margin-left: auto;
  margin-right: auto;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.stat-item {
  text-align: center;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.stat-value {
  font-size: 2rem;
  font-weight: bold;
  color: #ffeb3b;
  margin-bottom: 0.5rem;
}

.stat-label {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.8);
}

.return-controls {
  display: flex;
  justify-content: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.return-lobby-btn, .new-game-btn {
  padding: 1rem 2rem;
  border: none;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 1.1rem;
}

.return-lobby-btn {
  background: linear-gradient(45deg, #2196f3, #1976d2);
  color: white;
}

.new-game-btn {
  background: linear-gradient(45deg, #4caf50, #66bb6a);
  color: white;
}

.return-lobby-btn:hover, .new-game-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
</style>