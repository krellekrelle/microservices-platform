<template>
  <div class="game-ended-view">
    <!-- Confetti Animation -->
    <div class="confetti-container">
      <div class="confetti" v-for="n in 50" :key="n" :style="getConfettiStyle(n)"></div>
    </div>

    <!-- Animated Header -->
    <div class="game-ended-header">
      <div class="title-animation">
        <h1 class="game-title">🏁 Game Finished!</h1>
        <div class="title-sparkles">
          <span class="sparkle" v-for="n in 6" :key="n">✨</span>
        </div>
      </div>
    </div>

    <!-- Final Results with Staggered Animation -->
    <div class="final-results" v-if="gameStore.lobbyState?.scores">
      <h2 class="results-title">🏆 Final Standings 🏆</h2>
      <div class="podium-container" v-if="sortedPlayers.length >= 3">
        <!-- Podium Animation -->
        <div class="podium">
          <!-- 2nd Place -->
          <div class="podium-position second-place" :style="{ animationDelay: '0.5s' }">
            <div class="podium-player">
              <img 
                v-if="sortedPlayers[1]?.profilePicture"
                :src="sortedPlayers[1].profilePicture" 
                class="podium-avatar"
              >
              <div v-else class="podium-avatar-placeholder">
                {{ getPlayerInitials(sortedPlayers[1]?.name) }}
              </div>
              <div class="podium-name">{{ getPlayerFirstName(sortedPlayers[1]?.name) }}</div>
              <div class="podium-score">{{ sortedPlayers[1]?.totalScore }}</div>
            </div>
            <div class="podium-base second">
              <div class="podium-number">2</div>
              <div class="medal">🥈</div>
            </div>
          </div>

          <!-- 1st Place (Winner) -->
          <div class="podium-position first-place" :style="{ animationDelay: '1s' }">
            <div class="crown">👑</div>
            <div class="podium-player winner-glow">
              <img 
                v-if="sortedPlayers[0]?.profilePicture"
                :src="sortedPlayers[0].profilePicture" 
                class="podium-avatar winner-avatar"
              >
              <div v-else class="podium-avatar-placeholder winner-avatar">
                {{ getPlayerInitials(sortedPlayers[0]?.name) }}
              </div>
              <div class="podium-name winner-name">{{ getPlayerFirstName(sortedPlayers[0]?.name) }}</div>
              <div class="podium-score winner-score">{{ sortedPlayers[0]?.totalScore }}</div>
            </div>
            <div class="podium-base first">
              <div class="podium-number">1</div>
              <div class="medal winner-medal">🥇</div>
            </div>
          </div>

          <!-- 3rd Place -->
          <div class="podium-position third-place" :style="{ animationDelay: '0.3s' }">
            <div class="podium-player">
              <img 
                v-if="sortedPlayers[2]?.profilePicture"
                :src="sortedPlayers[2].profilePicture" 
                class="podium-avatar"
              >
              <div v-else class="podium-avatar-placeholder">
                {{ getPlayerInitials(sortedPlayers[2]?.name) }}
              </div>
              <div class="podium-name">{{ getPlayerFirstName(sortedPlayers[2]?.name) }}</div>
              <div class="podium-score">{{ sortedPlayers[2]?.totalScore }}</div>
            </div>
            <div class="podium-base third">
              <div class="podium-number">3</div>
              <div class="medal">🥉</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Detailed Results Table -->
      <div class="detailed-results">
        <h3>Complete Results</h3>
        <div class="results-table">
          <div 
            v-for="(player, index) in sortedPlayers"
            :key="index"
            class="result-row animated-row"
            :class="{ winner: index === 0, loser: index === sortedPlayers.length - 1 }"
            :style="{ animationDelay: `${1.5 + index * 0.2}s` }"
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
    </div>

    <!-- Round-by-Round Scoreboard -->
    <div class="scoreboard-section" v-if="gameStore.lobbyState?.scores?.historical?.length">
      <h3 class="scoreboard-title">📊 Round-by-Round Scoreboard</h3>
      <div class="scoreboard-container">
        <table class="scoreboard-table">
          <thead>
            <tr>
              <th class="round-header">Round</th>
              <th 
                v-for="player in sortedPlayers" 
                :key="player.seatIndex"
                class="player-header"
                :class="{ 'winner-column': player.seatIndex === winnerIndex }"
              >
                <div class="player-header-content">
                  <img 
                    v-if="player.profilePicture"
                    :src="player.profilePicture" 
                    class="header-avatar"
                  >
                  <div v-else class="header-avatar-placeholder">
                    {{ getPlayerInitials(player.name) }}
                  </div>
                  <div class="header-name">{{ getPlayerFirstName(player.name) }}</div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="(round, roundIndex) in gameStore.lobbyState?.scores?.historical || []" 
              :key="roundIndex"
              class="round-row"
              :style="{ animationDelay: `${4 + roundIndex * 0.1}s` }"
            >
              <td class="round-number">{{ round.round || (roundIndex + 1) }}</td>
              <td 
                v-for="player in sortedPlayers"
                :key="player.seatIndex"
                class="score-cell"
                :class="{ 
                  'winner-column': player.seatIndex === winnerIndex,
                  'high-score': (round.scores?.[player.seatIndex] || 0) >= 20,
                  'perfect-round': (round.scores?.[player.seatIndex] || 0) === 0
                }"
              >
                {{ round.scores?.[player.seatIndex] || 0 }}
              </td>
            </tr>
            <!-- Final Totals Row -->
            <tr class="totals-row">
              <td class="round-number total-label">TOTAL</td>
              <td 
                v-for="player in sortedPlayers"
                :key="player.seatIndex"
                class="total-score"
                :class="{ 
                  'winner-total': player.seatIndex === winnerIndex,
                  'loser-total': player.seatIndex === loserIndex
                }"
              >
                {{ player.totalScore || 0 }}
              </td>
            </tr>
          </tbody>
        </table>
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
    </div>

    <div class="celebration-animation" ref="celebration"></div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { useSocket } from '../composables/useSocket'

const gameStore = useGameStore()
const { emitJoinLobby, emitStartGame } = useSocket()

// API-fetched game data as fallback
const apiGameData = ref(null)
const isLoadingGameData = ref(false)

// Fetch game data from API if needed
const fetchGameData = async (gameId) => {
  if (!gameId || isLoadingGameData.value) return
  
  try {
    isLoadingGameData.value = true
    console.log('🏆 DEBUG: Fetching game data from API for gameId:', gameId)
    
    const response = await fetch(`/hearts/api/history/${gameId}`)
    if (!response.ok) throw new Error(`API request failed: ${response.status}`)
    
    const data = await response.json()
    console.log('🏆 DEBUG: API response:', data)
    apiGameData.value = data
  } catch (error) {
    console.error('🏆 ERROR: Failed to fetch game data:', error)
  } finally {
    isLoadingGameData.value = false
  }
}

// Try to fetch game data on mount if we have a gameId
onMounted(() => {
  const gameId = gameStore.lobbyState?.gameId
  if (gameId && gameStore.lobbyState?.state === 'finished') {
    fetchGameData(gameId)
  }
})

const sortedPlayers = computed(() => {
  console.log('🏆 DEBUG: sortedPlayers computed called')
  console.log('🏆 DEBUG: gameStore.lobbyState:', gameStore.lobbyState)
  console.log('🏆 DEBUG: apiGameData.value:', apiGameData.value)
  
  // First try to use game state data (handle both array and object formats)
  let playersData = null
  let scoresData = null
  
  if (gameStore.lobbyState?.players && gameStore.lobbyState?.scores?.total) {
    const players = gameStore.lobbyState.players
    
    // Handle both array and object formats for players
    if (Array.isArray(players)) {
      playersData = players
    } else if (typeof players === 'object') {
      // Convert object to array (players is {0: {...}, 1: {...}, etc.})
      playersData = Object.keys(players)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map(key => ({ ...players[key], seatIndex: parseInt(key) }))
    }
    
    scoresData = gameStore.lobbyState.scores.total
    console.log('🏆 DEBUG: Using game state data - players:', playersData, 'scores:', scoresData)
  }
  
  // Fallback to API data if game state data is not available
  if ((!playersData || !scoresData) && apiGameData.value) {
    console.log('🏆 DEBUG: Falling back to API data')
    playersData = apiGameData.value.players?.map(p => ({
      ...p,
      userName: p.name,
      seatIndex: p.seat
    })) || []
    
    scoresData = apiGameData.value.finalScores || {}
    console.log('🏆 DEBUG: Using API data - players:', playersData, 'scores:', scoresData)
  }
  
  if (!playersData || !scoresData) {
    console.log('🏆 DEBUG: No data available, returning empty array')
    return []
  }

  console.log('🏆 DEBUG: Processing players with scores')
  return playersData
    .map((player) => ({
      ...player,
      seatIndex: player.seatIndex ?? player.seat ?? 0,
      totalScore: scoresData[player.seatIndex ?? player.seat ?? 0] ?? player.finalScore ?? player.totalScore ?? 0,
      name: player.userName ?? player.name ?? 'Unknown'
    }))
    .filter(player => player && player.name)
    .sort((a, b) => a.totalScore - b.totalScore) // Lower score wins in Hearts
})

const activePlayers = computed(() => {
  // Use the same data as sortedPlayers but without sorting
  let playersData = null
  
  if (gameStore.lobbyState?.players) {
    const players = gameStore.lobbyState.players
    
    // Handle both array and object formats for players
    if (Array.isArray(players)) {
      playersData = players
    } else if (typeof players === 'object') {
      // Convert object to array (players is {0: {...}, 1: {...}, etc.})
      playersData = Object.keys(players)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map(key => ({ ...players[key], seatIndex: parseInt(key) }))
    }
  }
  
  // Fallback to API data
  if (!playersData && apiGameData.value) {
    playersData = apiGameData.value.players?.map(p => ({
      ...p,
      userName: p.name,
      seatIndex: p.seat
    })) || []
  }
  
  if (!playersData) return []
  
  return playersData
    .map(player => ({
      ...player,
      seatIndex: player.seatIndex ?? player.seat ?? 0,
      name: player.userName ?? player.name ?? 'Unknown'
    }))
    .filter(player => player && player.name)
})

const winnerIndex = computed(() => {
  if (!sortedPlayers.value.length) return -1
  
  // sortedPlayers is already sorted by score (lowest first), so first player is winner
  const winner = sortedPlayers.value[0]
  return winner?.seatIndex ?? -1
})

const loserIndex = computed(() => {
  if (!sortedPlayers.value.length) return -1
  
  // sortedPlayers is already sorted by score (lowest first), so last player is loser
  const loser = sortedPlayers.value[sortedPlayers.value.length - 1]
  return loser?.seatIndex ?? -1
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

function getConfettiStyle(index) {
  const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8']
  const randomColor = colors[index % colors.length]
  const randomDelay = Math.random() * 3
  const randomDuration = 3 + Math.random() * 2
  const randomX = Math.random() * 100
  
  return {
    backgroundColor: randomColor,
    left: `${randomX}%`,
    animationDelay: `${randomDelay}s`,
    animationDuration: `${randomDuration}s`
  }
}

onMounted(() => {
  // Mark that we've shown the end game screen
  gameStore.setEndGameShown(true)
  
  // Play celebration sound/animation for winner
  if (sortedPlayers.value.length > 0) {
    const winner = sortedPlayers.value[0]
    if (winner.seatIndex === gameStore.mySeat) {
      console.log('🎉 Congratulations! You won!')
      // Could add sound effect here
    }
  }
  
  // Start the animation sequence
  setTimeout(() => {
    document.querySelector('.game-ended-view')?.classList.add('animations-started')
  }, 100)
})
</script>

<style scoped>
.game-ended-view {
  padding: 2rem;
  color: white;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
  text-align: center;
  overflow-x: hidden;
  position: relative;
}

/* Confetti Animation */
.confetti-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
}

.confetti {
  position: absolute;
  width: 10px;
  height: 10px;
  top: -10px;
  animation: confetti-fall linear infinite;
}

@keyframes confetti-fall {
  0% {
    transform: translateY(-10px) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(100vh) rotate(360deg);
    opacity: 0;
  }
}

/* Header Animations */
.game-ended-header {
  margin-bottom: 3rem;
  z-index: 2;
  position: relative;
}

.title-animation {
  position: relative;
}

.game-title {
  font-size: 4rem;
  margin-bottom: 1rem;
  text-shadow: 3px 3px 6px rgba(0, 0, 0, 0.7);
  animation: titleEntrance 2s ease-out;
  background: linear-gradient(45deg, #FFD700, #FFA500, #FFD700);
  background-size: 200% 200%;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: titleEntrance 2s ease-out, shimmer 3s ease-in-out infinite;
}

.title-sparkles {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.sparkle {
  position: absolute;
  font-size: 2rem;
  animation: sparkle 2s ease-in-out infinite;
}

.sparkle:nth-child(1) { top: 10%; left: 10%; animation-delay: 0s; }
.sparkle:nth-child(2) { top: 20%; right: 15%; animation-delay: 0.3s; }
.sparkle:nth-child(3) { top: 60%; left: 20%; animation-delay: 0.6s; }
.sparkle:nth-child(4) { top: 70%; right: 10%; animation-delay: 0.9s; }
.sparkle:nth-child(5) { top: 40%; left: 5%; animation-delay: 1.2s; }
.sparkle:nth-child(6) { top: 30%; right: 5%; animation-delay: 1.5s; }

@keyframes titleEntrance {
  0% { 
    opacity: 0; 
    transform: scale(0.3) rotate(-10deg); 
  }
  50% { 
    opacity: 1; 
    transform: scale(1.1) rotate(5deg); 
  }
  100% { 
    opacity: 1; 
    transform: scale(1) rotate(0deg); 
  }
}

@keyframes shimmer {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

@keyframes sparkle {
  0%, 100% { 
    opacity: 0; 
    transform: scale(0) rotate(0deg); 
  }
  50% { 
    opacity: 1; 
    transform: scale(1) rotate(180deg); 
  }
}

/* Results Section */
.final-results {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 3rem 2rem;
  margin-bottom: 2rem;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  position: relative;
  z-index: 2;
}

.results-title {
  color: #FFD700;
  margin-bottom: 3rem;
  font-size: 2.5rem;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.7);
  animation: slideInFromTop 1s ease-out 0.5s both;
}

/* Podium Styles */
.podium-container {
  margin-bottom: 3rem;
}

.podium {
  display: flex;
  justify-content: center;
  align-items: end;
  gap: 2rem;
  margin: 2rem 0;
  height: 300px;
}

.podium-position {
  display: flex;
  flex-direction: column;
  align-items: center;
  opacity: 0;
  animation: podiumRise 1s ease-out forwards;
}

.podium-player {
  margin-bottom: 1rem;
  text-align: center;
  transform: translateY(20px);
  animation: playerFloat 1s ease-out 1.5s forwards;
}

.podium-avatar, .podium-avatar-placeholder {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.5);
  margin-bottom: 0.5rem;
  transition: all 0.3s ease;
}

.winner-avatar {
  border: 4px solid #FFD700 !important;
  animation: winnerGlow 2s ease-in-out infinite;
  transform: scale(1.1);
}

.podium-avatar-placeholder {
  background: linear-gradient(45deg, #666, #888);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  color: white;
}

.podium-name {
  font-weight: bold;
  margin-bottom: 0.5rem;
}

.winner-name {
  color: #FFD700;
  font-size: 1.2rem;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.7);
}

.podium-score {
  font-size: 1.1rem;
  color: #fff;
}

.winner-score {
  color: #FFD700;
  font-size: 1.3rem;
  font-weight: bold;
}

.podium-base {
  border-radius: 10px 10px 0 0;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  min-width: 120px;
}

.podium-base.first {
  height: 120px;
  background: linear-gradient(45deg, #FFD700, #FFA500);
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
}

.podium-base.second {
  height: 90px;
  background: linear-gradient(45deg, #C0C0C0, #A8A8A8);
  box-shadow: 0 0 15px rgba(192, 192, 192, 0.3);
}

.podium-base.third {
  height: 60px;
  background: linear-gradient(45deg, #CD7F32, #B8860B);
  box-shadow: 0 0 10px rgba(205, 127, 50, 0.3);
}

.podium-number {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.medal {
  font-size: 2rem;
}

.winner-medal {
  animation: medalSpin 2s ease-in-out infinite;
}

.crown {
  position: absolute;
  top: -40px;
  font-size: 3rem;
  animation: crownBounce 2s ease-in-out infinite;
}

@keyframes slideInFromTop {
  from { opacity: 0; transform: translateY(-30px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes podiumRise {
  from { 
    opacity: 0; 
    transform: translateY(100px) scale(0.8); 
  }
  to { 
    opacity: 1; 
    transform: translateY(0) scale(1); 
  }
}

@keyframes playerFloat {
  from { 
    opacity: 0; 
    transform: translateY(20px); 
  }
  to { 
    opacity: 1; 
    transform: translateY(0); 
  }
}

@keyframes winnerGlow {
  0%, 100% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.7); }
  50% { box-shadow: 0 0 30px rgba(255, 215, 0, 1); }
}

@keyframes medalSpin {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(10deg); }
  75% { transform: rotate(-10deg); }
}

@keyframes crownBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

/* Detailed Results */
.detailed-results {
  margin-top: 3rem;
}

.detailed-results h3 {
  color: #FFD700;
  margin-bottom: 2rem;
  font-size: 1.8rem;
  animation: slideInFromTop 1s ease-out 1.2s both;
}

.results-table {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.result-row {
  display: grid;
  grid-template-columns: 60px 1fr auto auto;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 1.5rem;
  transition: all 0.3s ease;
  backdrop-filter: blur(5px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.animated-row {
  opacity: 0;
  transform: translateX(-50px);
  animation: slideInFromLeft 0.8s ease-out forwards;
}

.result-row:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
}

.result-row.winner {
  background: linear-gradient(45deg, rgba(255, 215, 0, 0.3), rgba(255, 235, 59, 0.3));
  border: 2px solid #FFD700;
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.4);
}

.result-row.loser {
  background: rgba(244, 67, 54, 0.15);
  border: 1px solid rgba(244, 67, 54, 0.4);
}

@keyframes slideInFromLeft {
  from { 
    opacity: 0; 
    transform: translateX(-50px); 
  }
  to { 
    opacity: 1; 
    transform: translateX(0); 
  }
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

/* Scoreboard Styles */
.scoreboard-section {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 2rem;
  margin: 3rem auto;
  max-width: 900px;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.scoreboard-title {
  color: #FFD700;
  margin-bottom: 2rem;
  font-size: 2rem;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.7);
  animation: slideInFromTop 1s ease-out 3.5s both;
}

.scoreboard-container {
  overflow-x: auto;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
}

.scoreboard-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 1rem;
}

.scoreboard-table th,
.scoreboard-table td {
  padding: 1rem;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.scoreboard-table thead {
  background: rgba(255, 255, 255, 0.1);
}

.round-header {
  color: #FFD700;
  font-weight: bold;
  background: rgba(255, 215, 0, 0.1) !important;
}

.player-header {
  color: #fff;
  font-weight: bold;
  min-width: 120px;
}

.winner-column {
  background: rgba(255, 215, 0, 0.15) !important;
  border-left: 2px solid #FFD700;
  border-right: 2px solid #FFD700;
}

.player-header-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.header-avatar, .header-avatar-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.header-avatar-placeholder {
  background: linear-gradient(45deg, #666, #888);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  color: white;
  font-size: 0.8rem;
}

.header-name {
  font-size: 0.9rem;
  font-weight: bold;
}

.round-row {
  opacity: 0;
  animation: fadeInUp 0.5s ease-out forwards;
  transition: background-color 0.3s ease;
}

.round-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

.round-number {
  color: #FFD700;
  font-weight: bold;
  background: rgba(255, 215, 0, 0.1);
}

.score-cell {
  color: #fff;
  font-weight: 500;
}

.high-score {
  background: rgba(244, 67, 54, 0.2) !important;
  color: #ff6b6b !important;
  font-weight: bold;
}

.perfect-round {
  background: rgba(76, 175, 80, 0.2) !important;
  color: #4caf50 !important;
  font-weight: bold;
}

.totals-row {
  background: rgba(255, 255, 255, 0.1);
  border-top: 2px solid rgba(255, 215, 0, 0.5);
  font-weight: bold;
}

.total-label {
  color: #FFD700;
  font-size: 1.1rem;
}

.total-score {
  color: #fff;
  font-size: 1.1rem;
  font-weight: bold;
}

.winner-total {
  background: rgba(255, 215, 0, 0.3) !important;
  color: #FFD700 !important;
  font-size: 1.2rem;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.7);
}

.loser-total {
  background: rgba(244, 67, 54, 0.3) !important;
  color: #ff6b6b !important;
}

.return-controls {
  display: flex;
  justify-content: center;
  gap: 2rem;
  flex-wrap: wrap;
  margin-top: 3rem;
  opacity: 0;
  animation: fadeInUp 1s ease-out 5s forwards;
}

.return-lobby-btn {
  padding: 1.5rem 3rem;
  border: none;
  border-radius: 15px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 1.2rem;
  position: relative;
  overflow: hidden;
  background: linear-gradient(45deg, #667eea, #764ba2);
  color: white;
  border: 2px solid rgba(255, 255, 255, 0.3);
}

.return-lobby-btn:hover {
  transform: translateY(-5px) scale(1.05);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
}

.return-lobby-btn:active {
  transform: translateY(-2px) scale(1.02);
}

@keyframes fadeInUp {
  from { 
    opacity: 0; 
    transform: translateY(30px); 
  }
  to { 
    opacity: 1; 
    transform: translateY(0); 
  }
}

/* Responsive Design */
@media (max-width: 768px) {
  .game-title {
    font-size: 2.5rem;
  }
  
  .podium {
    gap: 1rem;
    height: 250px;
  }
  
  .podium-avatar, .podium-avatar-placeholder {
    width: 60px;
    height: 60px;
  }
  
  .result-row {
    grid-template-columns: 50px 1fr auto;
    padding: 1rem;
  }
  
  .result-badge {
    display: none;
  }
  
  .scoreboard-section {
    padding: 1rem;
    margin: 2rem 0.5rem;
  }
  
  .scoreboard-title {
    font-size: 1.5rem;
  }
  
  .scoreboard-table th,
  .scoreboard-table td {
    padding: 0.5rem;
    font-size: 0.9rem;
  }
  
  .header-avatar, .header-avatar-placeholder {
    width: 30px;
    height: 30px;
  }
  
  .header-name {
    font-size: 0.8rem;
  }
  
  .return-controls {
    gap: 1rem;
  }
  
  .return-lobby-btn {
    padding: 1rem 2rem;
    font-size: 1rem;
  }
}
</style>