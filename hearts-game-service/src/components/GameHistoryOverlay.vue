<template>
  <div class="game-history-overlay" @click.self="close">
    <div class="overlay-content">
      <!-- Header -->
      <div class="overlay-header">
        <h2>📊 Game History</h2>
        <button class="close-button" @click="close">×</button>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>Loading game history...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error-state">
        <p>❌ {{ error }}</p>
        <button class="btn primary" @click="fetchHistory">Retry</button>
      </div>

      <!-- Empty State -->
      <div v-else-if="!games || games.length === 0" class="empty-state">
        <p>🎮 No games played yet</p>
        <p class="subtext">Start playing to build your game history!</p>
      </div>

      <!-- Game History List -->
      <div v-else class="history-list">
        <div 
          v-for="game in games" 
          :key="game.gameId"
          class="game-card"
          :class="getGameStatusClass(game.state)"
        >
          <!-- Game Header -->
          <div class="game-header">
            <div class="game-status">
              <span class="status-badge" :class="getStatusBadgeClass(game.state)">
                {{ formatGameStatus(game.state) }}
              </span>
              <span class="game-date">{{ formatDate(game.finishedAt || game.startedAt || game.createdAt) }}</span>
            </div>
            
            <!-- Admin Delete Button -->
            <button 
              v-if="isAdmin"
              class="delete-game-btn"
              @click.stop="deleteGame(game.gameId)"
              title="Delete this game"
            >
              🗑️
            </button>
          </div>

          <!-- Players and Scores -->
          <div class="players-grid">
            <div 
              v-for="(player, index) in getSortedPlayers(game.players)" 
              :key="index"
              class="player-row"
              :class="{
                'winner': index === 0 && game.state === 'finished',
                'loser': index === game.players.length - 1 && game.state === 'finished' && game.players.length > 1
              }"
            >
              <span class="player-rank">{{ index + 1 }}.</span>
              <span class="player-name">{{ getPlayerDisplayName(player.name) }}</span>
              <span class="player-score" v-if="player.finalScore !== null && player.finalScore !== undefined">
                {{ player.finalScore }} pts
              </span>
              <span class="player-score incomplete" v-else>-</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'

const emit = defineEmits(['close'])

const gameStore = useGameStore()
const games = ref([])
const loading = ref(true)
const error = ref(null)

// Check if current user is admin
const isAdmin = computed(() => gameStore.currentUser?.isAdmin === true)

onMounted(() => {
  fetchHistory()
})

async function fetchHistory() {
  loading.value = true
  error.value = null
  
  try {
    const response = await fetch('/hearts/api/history', {
      method: 'GET',
      credentials: 'include'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch history: ${response.status}`)
    }
    
    const data = await response.json()
    games.value = data
  } catch (err) {
    console.error('Error fetching game history:', err)
    error.value = err.message || 'Failed to load game history'
  } finally {
    loading.value = false
  }
}

async function deleteGame(gameId) {
  if (!confirm('Are you sure you want to delete this game? This action cannot be undone.')) {
    return
  }
  
  try {
    const response = await fetch(`/hearts/api/admin/games/${gameId}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Failed to delete game: ${response.status}`)
    }
    
    // Remove the game from the list
    games.value = games.value.filter(game => game.gameId !== gameId)
    
    console.log(`Successfully deleted game ${gameId}`)
  } catch (err) {
    console.error('Error deleting game:', err)
    alert(`Failed to delete game: ${err.message}`)
  }
}

function close() {
  emit('close')
}

function formatGameStatus(state) {
  const statusMap = {
    'finished': '✓ Finished',
    'saved': '⏸ Stopped',
    'abandoned': '⚠ Abandoned',
    'playing': '🎮 In Progress',
    'passing': '🔄 Passing',
    'lobby': '⏳ Lobby'
  }
  return statusMap[state] || state
}

function getStatusBadgeClass(state) {
  const classMap = {
    'finished': 'status-finished',
    'saved': 'status-stopped',
    'abandoned': 'status-abandoned',
    'playing': 'status-active',
    'passing': 'status-active',
    'lobby': 'status-lobby'
  }
  return classMap[state] || ''
}

function getGameStatusClass(state) {
  return `game-${state}`
}

function getSortedPlayers(players) {
  if (!players || players.length === 0) return []
  
  // Sort by final score (lowest first for finished games)
  return [...players].sort((a, b) => {
    const scoreA = a.finalScore ?? 999
    const scoreB = b.finalScore ?? 999
    return scoreA - scoreB
  })
}

function getPlayerDisplayName(name) {
  if (!name) return 'Unknown Player'
  // If name is an email, show only the part before @
  if (name.includes('@')) {
    return name.split('@')[0]
  }
  // If name is too long, truncate it
  if (name.length > 20) {
    return name.substring(0, 18) + '...'
  }
  return name
}

function formatDate(dateString) {
  if (!dateString) return ''
  
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  
  // Format as date
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
</script>

<style scoped>
.game-history-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(5px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
  animation: fadeIn 0.2s ease-in;
}

.overlay-content {
  background: linear-gradient(135deg, rgba(76, 0, 153, 0.95), rgba(123, 31, 162, 0.95));
  border-radius: 20px;
  padding: 2rem;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  animation: slideIn 0.3s ease-out;
}

.overlay-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid rgba(255, 255, 255, 0.2);
}

.overlay-header h2 {
  margin: 0;
  color: #fff;
  font-size: 1.8rem;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
}

.close-button {
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  font-size: 2rem;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.close-button:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: rotate(90deg);
}

.loading-state, .error-state, .empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #fff;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.2);
  border-top-color: #fff;
  border-radius: 50%;
  margin: 0 auto 1rem;
  animation: spin 0.8s linear infinite;
}

.error-state p {
  margin-bottom: 1rem;
  font-size: 1.1rem;
}

.empty-state p {
  font-size: 1.3rem;
  margin-bottom: 0.5rem;
}

.subtext {
  font-size: 1rem !important;
  opacity: 0.8;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.game-card {
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  padding: 1rem;
  transition: all 0.2s;
}

.game-card:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}

.game-header {
  margin-bottom: 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.game-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex: 1;
}

.delete-game-btn {
  background: rgba(244, 67, 54, 0.3);
  border: 1px solid rgba(244, 67, 54, 0.6);
  color: #ef9a9a;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.delete-game-btn:hover {
  background: rgba(244, 67, 54, 0.5);
  border-color: rgba(244, 67, 54, 0.8);
  transform: scale(1.1);
}

.delete-game-btn:active {
  transform: scale(0.95);
}

.status-badge {
  padding: 0.3rem 0.8rem;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-finished {
  background: rgba(76, 175, 80, 0.3);
  border: 1px solid rgba(76, 175, 80, 0.6);
  color: #a5d6a7;
}

.status-stopped {
  background: rgba(255, 152, 0, 0.3);
  border: 1px solid rgba(255, 152, 0, 0.6);
  color: #ffcc80;
}

.status-abandoned {
  background: rgba(244, 67, 54, 0.3);
  border: 1px solid rgba(244, 67, 54, 0.6);
  color: #ef9a9a;
}

.status-active {
  background: rgba(33, 150, 243, 0.3);
  border: 1px solid rgba(33, 150, 243, 0.6);
  color: #90caf9;
}

.status-lobby {
  background: rgba(158, 158, 158, 0.3);
  border: 1px solid rgba(158, 158, 158, 0.6);
  color: #e0e0e0;
}

.game-date {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
}

.players-grid {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.player-row {
  display: grid;
  grid-template-columns: 30px 1fr auto;
  gap: 0.5rem;
  align-items: center;
  padding: 0.4rem 0.6rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  color: #fff;
  transition: all 0.2s;
}

.player-row.winner {
  background: rgba(76, 175, 80, 0.2);
  border: 1px solid rgba(76, 175, 80, 0.4);
}

.player-row.loser {
  background: rgba(244, 67, 54, 0.2);
  border: 1px solid rgba(244, 67, 54, 0.4);
}

.player-rank {
  font-weight: bold;
  opacity: 0.7;
  font-size: 0.9rem;
}

.player-name {
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-score {
  font-weight: bold;
  font-size: 0.95rem;
  color: #ffd54f;
}

.player-score.incomplete {
  opacity: 0.5;
  color: rgba(255, 255, 255, 0.5);
}

.btn {
  padding: 0.6rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.btn.primary {
  background: linear-gradient(45deg, #2196f3, #1976d2);
  color: white;
}

.btn.primary:hover {
  background: linear-gradient(45deg, #1976d2, #1565c0);
  transform: translateY(-2px);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Scrollbar styling */
.overlay-content::-webkit-scrollbar {
  width: 8px;
}

.overlay-content::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
}

.overlay-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 10px;
}

.overlay-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}
</style>
