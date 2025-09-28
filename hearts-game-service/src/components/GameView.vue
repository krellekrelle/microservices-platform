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
          <div class="my-avatar">
            <img 
              v-if="gameStore.myPlayer?.profilePicture"
              :src="gameStore.myPlayer.profilePicture" 
              :alt="gameStore.myPlayer.name"
              class="player-avatar"
            >
            <div v-else class="avatar-placeholder">
              {{ getPlayerInitials(gameStore.myPlayer?.name || 'You') }}
            </div>
          </div>
          <div class="my-name">{{ getPlayerFirstName(gameStore.myPlayer?.name || 'You') }}</div>
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
            :cardSize="'large'"
            :overlapAmount="25"
            @cardClick="handleCardClick"
          />
        </div>
      </div>
    </div>

    <!-- Scoreboard Overlay (Top Right) -->
    <div class="scoreboard-overlay" v-if="gameStore.lobbyState?.players">
      <h3>Scores</h3>
      <div class="score-table">
        <div class="score-header">
          <div>Player</div>
          <div>Current</div>
          <div>Total</div>
        </div>
        <template v-for="index in [0, 1, 2, 3]" :key="index">
          <div 
            v-if="gameStore.lobbyState.players[index]"
            class="score-row"
          >
            <div class="player-name">{{ getPlayerFirstName(gameStore.lobbyState.players[index].userName || gameStore.lobbyState.players[index].name || 'Unknown') }}</div>
            <div class="current-score">{{ getCurrentRoundScore(index) }}</div>
            <div class="total-score">{{ getTotalScore(index) }}</div>
          </div>
        </template>
      </div>
    </div>

    <!-- Game Controls (for lobby leader) -->
    <div v-if="gameStore.isLobbyLeader" class="game-controls">
      <button class="stop-game-btn" @click="stopGame">
        Stop Game
      </button>
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

const gameStore = useGameStore()
const { emitPassCards, emitPlayCard, emitStopGame } = useSocket()

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
  return getPlayerFirstName(player?.name)
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

function getOpponentSeat(position) {
  // Get the seat index for opponents relative to my position
  // In a 4-player Hearts game, seats are arranged as:
  // 0 (top), 1 (right), 2 (bottom), 3 (left) if I'm seat 0
  // We need to map positions relative to my seat
  
  const mySeat = gameStore.mySeat
  if (mySeat === null || mySeat === undefined) return null
  
  // Calculate opponent positions relative to my seat
  const seatMappings = {
    0: { upper: 2, left: 3, right: 1 },  // If I'm seat 0 (bottom)
    1: { upper: 3, left: 0, right: 2 },  // If I'm seat 1 (right) 
    2: { upper: 0, left: 1, right: 3 },  // If I'm seat 2 (top)
    3: { upper: 1, left: 2, right: 0 }   // If I'm seat 3 (left)
  }
  
  return seatMappings[mySeat]?.[position] ?? null
}

function getTrickCardPosition(seatIndex) {
  // Position cards closer to the player who played them from the center
  const mySeat = gameStore.mySeat
  if (mySeat === null || mySeat === undefined) return {}
  
  // Define positions relative to absolute center with proper offsets
  // All positions use position: absolute with top: 50%, left: 50% as base
  const positions = {
    // If I'm in seat 0 (bottom), opponents are positioned as:
    0: {
      0: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, 20px)' },   // My card (bottom)
      1: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(20px, -50%)' },   // Right opponent  
      2: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -80px)' },  // Top opponent
      3: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-80px, -50%)' }   // Left opponent
    },
    // If I'm in seat 1 (right), adjust positions accordingly
    1: {
      0: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-80px, -50%)' },  // Left of me
      1: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(20px, -50%)' },   // My card (right)
      2: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, 20px)' },   // Bottom  
      3: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -80px)' }   // Top
    },
    // If I'm in seat 2 (top), adjust positions accordingly  
    2: {
      0: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, 20px)' },   // Bottom
      1: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-80px, -50%)' },  // Left
      2: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -80px)' },  // My card (top)
      3: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(20px, -50%)' }    // Right
    },
    // If I'm in seat 3 (left), adjust positions accordingly
    3: {
      0: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(20px, -50%)' },   // Right
      1: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, 20px)' },   // Bottom
      2: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -80px)' },  // Top  
      3: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-80px, -50%)' }   // My card (left)
    }
  }
  
  return positions[mySeat]?.[seatIndex] || { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
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

function stopGame() {
  emitStopGame()
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

.my-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 3px solid #ffeb3b;
  overflow: hidden;
}

.my-avatar .player-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(45deg, #4caf50, #66bb6a);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 1.5rem;
  color: white;
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
  width: 50px;
  height: 50px;
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
  background: rgba(0, 0, 0, 0.8);
  border-radius: 12px;
  padding: 1rem;
  min-width: 200px;
  z-index: 10;
  backdrop-filter: blur(5px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.score-table {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 0.5rem;
  margin-top: 1rem;
}

.score-header {
  display: contents;
  font-weight: bold;
  color: #ffeb3b;
}

.score-header > div {
  padding: 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.3);
}

.score-row {
  display: contents;
}

.score-row > div {
  padding: 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.game-controls {
  text-align: center;
}

.stop-game-btn {
  background: linear-gradient(45deg, #f44336, #d32f2f);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
}
</style>