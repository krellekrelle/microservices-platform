<template>
  <div class="game-ended-overlay" @click.self="returnToLobby">
    <div class="overlay-content">
      <!-- Header -->
      <div class="overlay-header">
        <h2>🏁 Game Finished!</h2>
      </div>

      <!-- Results -->
      <div class="results-section">
        <div 
          v-for="(player, index) in sortedPlayers" 
          :key="player.seatIndex"
          class="player-result"
          :class="{
            'winner': index === 0,
            'loser': index === sortedPlayers.length - 1
          }"
        >
          <div class="result-position">
            <span v-if="index === 0">👑</span>
            <span v-else-if="index === sortedPlayers.length - 1">💔</span>
            <span v-else>{{ index + 1 }}</span>
          </div>
          
          <div class="result-avatar">
            <img 
              v-if="player.profilePicture"
              :src="player.profilePicture" 
              :alt="player.name"
            />
            <div v-else class="avatar-placeholder">
              {{ getPlayerInitials(player.name) }}
            </div>
          </div>
          
          <div class="result-info">
            <div class="result-name">{{ getPlayerFirstName(player.name) }}</div>
            <div class="result-score">{{ player.totalScore }} points</div>
          </div>
          
          <div class="result-badge" v-if="index === 0">
            <span class="badge-winner">Winner!</span>
          </div>
          <div class="result-badge" v-else-if="index === sortedPlayers.length - 1">
            <span class="badge-loser">Loser 😅</span>
          </div>
        </div>
      </div>

      <!-- Action Button -->
      <div class="overlay-actions">
        <button class="return-button" @click="returnToLobby">
          Return to Lobby
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { useSocket } from '../composables/useSocket'

const gameStore = useGameStore()
const { emitReturnToLobby } = useSocket()

// Compute sorted players
const sortedPlayers = computed(() => {
  if (!gameStore.lobbyState?.scores?.total) return []
  
  const players = []
  const totalScores = gameStore.lobbyState.scores.total
  
  for (let seat = 0; seat < 4; seat++) {
    const player = gameStore.lobbyState.players?.[seat]
    if (player) {
      players.push({
        seatIndex: seat,
        name: player.userName || `Player ${seat + 1}`,
        profilePicture: player.profilePicture,
        totalScore: totalScores[seat] || 0
      })
    }
  }
  
  // Sort by score (lowest score wins in Hearts)
  return players.sort((a, b) => a.totalScore - b.totalScore)
})

function getPlayerInitials(fullName) {
  if (!fullName) return '?'
  return fullName.split(' ')
    .map(name => name[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getPlayerFirstName(fullName) {
  if (!fullName) return 'Unknown'
  return fullName.split(' ')[0]
}

function returnToLobby() {
  console.log('🏠 Player clicked Return to Lobby')
  // Immediately hide the overlay
  gameStore.setEndGameShown(false)
  // Emit the return event to the server
  emitReturnToLobby()
}
</script>

<style scoped>
.game-ended-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.overlay-content {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 20px;
  padding: 40px;
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.4s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(30px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.overlay-header {
  text-align: center;
  margin-bottom: 30px;
}

.overlay-header h2 {
  color: white;
  font-size: 2rem;
  margin: 0;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.results-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 30px;
}

.player-result {
  display: flex;
  align-items: center;
  gap: 15px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  padding: 15px;
  border-radius: 12px;
  transition: all 0.3s ease;
  animation: slideInResult 0.5s ease-out backwards;
}

.player-result:nth-child(1) { animation-delay: 0.1s; }
.player-result:nth-child(2) { animation-delay: 0.2s; }
.player-result:nth-child(3) { animation-delay: 0.3s; }
.player-result:nth-child(4) { animation-delay: 0.4s; }

@keyframes slideInResult {
  from {
    transform: translateX(-20px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.player-result.winner {
  background: rgba(255, 215, 0, 0.3);
  border: 2px solid #ffd700;
  transform: scale(1.02);
}

.player-result.loser {
  background: rgba(255, 100, 100, 0.2);
  border: 2px solid rgba(255, 100, 100, 0.5);
}

.result-position {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  font-size: 1.5rem;
  font-weight: bold;
  color: white;
}

.result-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid rgba(255, 255, 255, 0.5);
}

.result-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-weight: bold;
  font-size: 1.2rem;
}

.result-info {
  flex: 1;
}

.result-name {
  color: white;
  font-size: 1.1rem;
  font-weight: bold;
  margin-bottom: 4px;
}

.result-score {
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.9rem;
}

.result-badge {
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: bold;
}

.badge-winner {
  background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
  color: #333;
  padding: 6px 12px;
  border-radius: 20px;
  box-shadow: 0 2px 10px rgba(255, 215, 0, 0.4);
}

.badge-loser {
  background: rgba(255, 100, 100, 0.3);
  color: #ffcccc;
  padding: 6px 12px;
  border-radius: 20px;
}

.overlay-actions {
  display: flex;
  justify-content: center;
}

.return-button {
  background: white;
  color: #667eea;
  border: none;
  padding: 15px 40px;
  border-radius: 30px;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}

.return-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  background: #f0f0f0;
}

.return-button:active {
  transform: translateY(0);
}

/* Mobile Responsive */
@media (max-width: 600px) {
  .overlay-content {
    padding: 30px 20px;
  }
  
  .overlay-header h2 {
    font-size: 1.5rem;
  }
  
  .player-result {
    padding: 12px;
    gap: 10px;
  }
  
  .result-avatar {
    width: 40px;
    height: 40px;
  }
  
  .result-name {
    font-size: 1rem;
  }
  
  .return-button {
    padding: 12px 30px;
    font-size: 1rem;
  }
}
</style>
