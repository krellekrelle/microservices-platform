<template>
  <div class="game-view">
    <!-- Pass Cards Button (only during passing phase) -->
    <div v-if="gameStore.lobbyState?.state === 'passing' && !gameStore.hasPassed" class="pass-controls">
      <button 
        class="pass-cards-btn"
        :disabled="gameStore.selectedCards.length !== 3"
        @click="passSelectedCards"
      >
        Pass {{ gameStore.selectedCards.length }}/3 Cards
        <span v-if="gameStore.selectedCards.length === 3">→</span>
      </button>
    </div>

    <!-- 3x3 Game Table Layout -->
    <div class="game-seats-container">
      <!-- Top Center: Opponent Across (Seat based on my position) -->
      <div class="game-seat game-seat-upper">
        <OpponentPlayer :seatIndex="getOpponentSeat('upper')" />
      </div>

      <!-- Middle Left: Left Opponent -->
      <div class="game-seat game-seat-left">
        <OpponentPlayer :seatIndex="getOpponentSeat('left')" />
      </div>

      <!-- Middle Center: Trick Area -->
      <div class="game-seat game-seat-center">
        <div class="trick-area">
          <!-- Show completed trick (all 4 cards) if available -->
          <div v-if="gameStore.lobbyState?.trickCompleted" class="current-trick completed-trick">
            <div class="trick-cards-positioned">
              <PlayerCard 
                v-for="(play, index) in gameStore.lobbyState.trickCompleted.trickCards"
                :key="`completed-${index}`"
                :card="play.card"
                :size="'medium'"
                :clickable="false"
                :style="getTrickCardPosition(play.seat)"
                class="trick-card-positioned"
              />
            </div>
          </div>
          <!-- Show current in-progress trick if no completed trick -->
          <div v-else-if="gameStore.lobbyState?.currentTrickCards?.length" class="current-trick">
            <div class="trick-cards-positioned">
              <PlayerCard 
                v-for="(play, index) in gameStore.lobbyState.currentTrickCards"
                :key="`current-${index}`"
                :card="play.card"
                :size="'medium'"
                :clickable="false"
                :style="getTrickCardPosition(play.seat)"
                class="trick-card-positioned"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Middle Right: Right Opponent -->
      <div class="game-seat game-seat-right">
        <OpponentPlayer :seatIndex="getOpponentSeat('right')" />
      </div>

      <!-- Bottom: My Hand and Avatar -->
      <div class="game-seat game-seat-hand">
        <!-- My Avatar/Profile -->
        <div 
          class="my-player-info"
          :class="{ 'my-turn': gameStore.isMyTurn }"
        >
          <PlayerAvatar
            :seat="gameStore.mySeat"
            :player-name="getMyPlayerName()"
            :profile-picture="gameStore.myPlayer?.profilePicture"
            :is-lobby-leader="false"
            :video-stream="localStream"
            :show-video="isVideoEnabled"
            size="xlarge"
          />
          <div class="my-name">{{ getPlayerFirstName(getMyPlayerName()) }}</div>
          <div class="my-stats">
            Cards: {{ gameStore.myPlayer?.hand?.length || 0 }} | 
            Tricks: {{ getTricksWon(gameStore.mySeat) }}
          </div>
        </div>

        <!-- My Hand -->
        <div class="my-hand-area">
          <PlayerHand
            v-if="gameStore.myPlayer?.hand"
            :hand="gameStore.myPlayer.hand"
            :cardSize="'xlarge'"
            :overlapAmount="35"
            @cardClick="handleCardClick"
          />
        </div>
      </div>
    </div>

    <!-- Scoreboard Overlay -->
    <div v-if="gameStore.lobbyState?.state !== 'lobby'" class="scoreboard-overlay">
      <div class="scoreboard">
        <!-- Header row with player names -->
        <div class="round-label">Round</div>
        <template v-for="index in [0, 1, 2, 3]" :key="`header-${index}`">
          <div 
            v-if="gameStore.lobbyState?.players?.[index]"
            class="player-header"
          >
            {{ getPlayerFirstName(getPlayerName(index)) }}
          </div>
        </template>
        
        <!-- Round scores -->
        <template v-for="(roundData, roundIndex) in getHistoricalScores()" :key="`round-${roundIndex}`">
          <div class="round-number">{{ roundData.round }}</div>
          <template v-for="index in [0, 1, 2, 3]" :key="`round-${roundIndex}-${index}`">
            <div 
              v-if="gameStore.lobbyState?.players?.[index]"
              class="round-score"
            >
              {{ roundData.scores?.[index] || 0 }}
            </div>
          </template>
        </template>
        
        <!-- Total row -->
        <div class="round-label">Total</div>
        <template v-for="index in [0, 1, 2, 3]" :key="`total-${index}`">
          <div 
            v-if="gameStore.lobbyState?.players?.[index]"
            class="total-score"
          >
            {{ getTotalScore(index) }}
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { useSocket } from '../composables/useSocket'
import PlayerCard from './PlayerCard.vue'
import PlayerHand from './PlayerHand.vue'
import OpponentPlayer from './OpponentPlayer.vue'
import PlayerAvatar from './PlayerAvatar.vue'

const gameStore = useGameStore()
const { emitPassCards, emitPlayCard, emitStopGame, videoManager } = useSocket()

// Computed properties to properly unwrap video manager refs
const isVideoEnabled = computed(() => {
  return videoManager.value?.isVideoEnabled ?? false
})
const localStream = computed(() => {
  return videoManager.value?.localStream ?? null
})
const activeVideoSeats = computed(() => {
  return videoManager.value?.activeVideoSeats ?? new Set()
})
const remoteStreams = computed(() => {
  return videoManager.value?.remoteStreams ?? new Map()
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

function getPlayerName(seatIndex) {
  const player = gameStore.lobbyState?.players[seatIndex]
  return getPlayerFirstName(player?.userName || player?.name || 'Unknown')
}

function getMyPlayerName() {
  if (!gameStore.myPlayer) return 'You'
  return gameStore.myPlayer.userName || gameStore.myPlayer.name || 'You'
}

function getPlayerHandSize(seatIndex) {
  const player = gameStore.lobbyState?.players[seatIndex]
  return player?.hand?.length || player?.handSize || 0
}

function getTricksWon(seatIndex) {
  return gameStore.lobbyState?.tricksWon?.[seatIndex] || 0
}

function getCurrentRoundScore(seatIndex) {
  // Get current round score from the scores object
  return gameStore.lobbyState?.scores?.round?.[seatIndex] || 0
}

function getTotalScore(seatIndex) {
  return gameStore.lobbyState?.scores?.total?.[seatIndex] || 0
}

function getHistoricalScores() {
  // Get historical scores from the scores object
  const historical = gameStore.lobbyState?.scores?.historical || []
  console.log('🏆 Historical scores:', historical)
  console.log('🎮 Current game state scores:', gameStore.lobbyState?.scores)
  
  // The historical data structure is: [{ round: 1, scores: {0: 0, 1: 25, 2: 0, 3: 1} }]
  // Return it directly as it's already in the correct format
  return historical
}

function getOpponentSeat(position) {
  // Get the seat index for opponents relative to my position
  // In a 4-player Hearts game, seats are arranged as:
  // 0 (top), 1 (right), 2 (bottom), 3 (left) - this is the lobby layout
  // We need to map positions relative to my seat to match the lobby visually
  
  const mySeat = gameStore.mySeat
  if (mySeat === null || mySeat === undefined) return null
  
  // Calculate opponent positions relative to my seat
  // Fixed mapping to resolve the mirroring issue: swap left/right from original
  const seatMappings = {
    0: { upper: 2, left: 1, right: 3 },  // If I'm seat 0: across=2, left=1, right=3 (swapped from original)
    1: { upper: 3, left: 2, right: 0 },  // If I'm seat 1: across=3, left=2, right=0 (swapped from original)
    2: { upper: 0, left: 3, right: 1 },  // If I'm seat 2: across=0, left=3, right=1 (swapped from original)
    3: { upper: 1, left: 0, right: 2 }   // If I'm seat 3: across=1, left=0, right=2 (swapped from original)
  }
  
  return seatMappings[mySeat]?.[position] ?? null
}

function getTrickCardPosition(seatIndex) {
  // Position cards based on the mathematical seat relationships
  // This converts absolute seat numbers from trick data to relative visual positions
  const mySeat = gameStore.mySeat
  if (mySeat === null || mySeat === undefined) return {}
  
  // Calculate relative positions using mathematical relationships
  const leftSeat = (mySeat + 1) % 4      // Left of me: +1
  const rightSeat = (mySeat - 1 + 4) % 4 // Right of me: -1 (with wrap-around)
  const oppositeSeat = (mySeat + 2) % 4  // Opposite of me: +2
  
  // Determine visual position based on seat relationships
  let visualPosition = 'center' // fallback
  
  if (seatIndex === mySeat) {
    visualPosition = 'bottom'           // My card comes from bottom
  } else if (seatIndex === leftSeat) {
    visualPosition = 'left'             // Left player's card comes from left
  } else if (seatIndex === rightSeat) {
    visualPosition = 'right'            // Right player's card comes from right  
  } else if (seatIndex === oppositeSeat) {
    visualPosition = 'top'              // Opposite player's card comes from top
  }
  
  // Define card positions for each visual direction
  const cardPositions = {
    bottom: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, 20px)' },
    top: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -80px)' },
    left: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-80px, -50%)' },
    right: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(20px, -50%)' },
    center: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }
  
  return cardPositions[visualPosition] || cardPositions.center
}

function passSelectedCards() {
  if (gameStore.selectedCards.length === 3) {
    emitPassCards(gameStore.selectedCards)
  }
}

function handleCardClick(card) {
  if (gameStore.lobbyState?.state === 'playing' && gameStore.isMyTurn) {
    emitPlayCard(card)
  }
}
</script>

<style scoped>
.game-view {
  padding: 1rem;
  color: white;
  background: linear-gradient(135deg, #1e3c72, #2a5298);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}



.pass-controls {
  position: absolute;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
}

.pass-cards-btn {
  background: linear-gradient(45deg, #4caf50, #66bb6a);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.3s ease;
}

.pass-cards-btn:disabled {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
  cursor: not-allowed;
}

/* Scoreboard overlay */
.scoreboard-overlay {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 100;
  pointer-events: none;
}

.scoreboard {
  background: rgba(0, 0, 0, 0.7);
  border-radius: 8px;
  padding: 12px;
  font-size: 12px;
  color: white;
  display: grid;
  grid-template-columns: 60px repeat(4, 1fr);
  gap: 4px 8px;
  min-width: 250px;
}

.scoreboard > div {
  padding: 3px 6px;
  text-align: center;
}

.round-label {
  font-weight: bold;
  text-align: left;
}

.player-header {
  font-weight: bold;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 4px;
}

.round-number {
  text-align: center;
  font-weight: bold;
}

.round-score, .total-score {
  text-align: center;
}

.total-score {
  font-weight: bold;
  border-top: 1px solid rgba(255, 255, 255, 0.3);
  padding-top: 4px;
}

/* Header row styling */
.scoreboard > .round-label {
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  padding-bottom: 4px;
}

/* 3x3 Grid Layout for Hearts Table - Fixed Size */
.game-seats-container {
  display: grid;
  grid-template-areas: 
    ".    upper    ."
    "left center right"
    "hand hand hand";
  grid-template-columns: 200px 400px 200px;
  grid-template-rows: 150px 250px 200px;
  gap: 1rem;
  width: 800px;
  height: 600px;
  margin: 2rem auto;
  flex-shrink: 0;
}

.game-seat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.game-seat-upper {
  grid-area: upper;
}

.game-seat-left {
  grid-area: left;
}

.game-seat-center {
  grid-area: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  min-height: 200px;
}

.game-seat-right {
  grid-area: right;
}

.game-seat-hand {
  grid-area: hand;
  flex-direction: column;
  gap: 1rem;
}

.my-player-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
  border: 2px solid transparent;
  transition: all 0.3s ease;
}

.my-player-info.my-turn {
  border-color: #ffeb3b;
  box-shadow: 0 0 15px rgba(255, 235, 59, 0.5);
  animation: pulse-border 2s infinite;
}

@keyframes pulse-border {
  0%, 100% { 
    border-color: #ffeb3b;
    box-shadow: 0 0 15px rgba(255, 235, 59, 0.5);
  }
  50% { 
    border-color: #ffc107;
    box-shadow: 0 0 25px rgba(255, 235, 59, 0.8);
  }
}

.my-name {
  font-weight: bold;
  color: #ffeb3b;
}

.my-stats {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.8);
}

.my-hand-area {
  display: flex;
  justify-content: center;
}

.game-board {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 2rem 0;
}

.trick-area {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.trick-cards-positioned {
  position: relative;
  width: 200px;
  height: 150px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.completed-trick .trick-cards-positioned {
  /* Slightly emphasize completed tricks */
  background: rgba(255, 255, 0, 0.1);
  border-radius: 8px;
  padding: 10px;
}

.trick-card-positioned {
  position: absolute;
  transition: all 0.3s ease;
  z-index: 1;
}

.opponents-area {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 1;
}

.opponent {
  position: absolute;
  pointer-events: auto;
}

.opponent.current-turn {
  animation: highlight 2s infinite;
}

@keyframes highlight {
  0%, 100% { box-shadow: 0 0 0 rgba(255, 235, 59, 0); }
  50% { box-shadow: 0 0 20px rgba(255, 235, 59, 0.6); }
}

.opponent-info {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 1rem;
  text-align: center;
  min-width: 120px;
}

.opponent-avatar, .opponent-avatar-placeholder {
  width: 150px;
  height: 150px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  margin: 0 auto 0.5rem;
}

.opponent-avatar-placeholder {
  background: linear-gradient(45deg, #666, #888);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 2rem;
  color: white;
}

.opponent-name {
  font-weight: bold;
  margin-bottom: 0.25rem;
}

.opponent-stats {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.8);
}



.scoreboard-overlay {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 8px;
  padding: 0.75rem;
  z-index: 10;
  backdrop-filter: blur(3px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-size: 0.85rem;
}

.score-table {
  display: grid;
  grid-template-columns: auto repeat(4, 1fr);
  gap: 0.3rem;
  min-width: 0;
}

.score-header {
  display: contents;
  font-weight: bold;
  color: #ffeb3b;
  font-size: 0.8rem;
}

.score-header > div {
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  text-align: center;
}

.round-label, .round-number {
  text-align: center;
  font-weight: 500;
  color: #ccc;
}

.player-header {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60px;
}

.score-row {
  display: contents;
}

.score-row > div {
  padding: 0.3rem 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  text-align: center;
  font-size: 0.8rem;
}

.total-row {
  font-weight: bold;
  color: #ffeb3b;
}

.total-row > div {
  border-top: 1px solid rgba(255, 255, 255, 0.3);
  border-bottom: none;
  padding: 0.4rem 0.5rem;
}
</style>