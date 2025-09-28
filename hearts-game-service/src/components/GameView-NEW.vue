<template>
  <div class="game-view">
    <!-- Game Header -->
    <div class="game-header">
      <div class="game-status">
        <h2 v-if="gameStore.lobbyState?.state === 'passing'">
          🃏 Card Passing Phase
        </h2>
        <h2 v-else-if="gameStore.lobbyState?.state === 'playing'">
          🂡 Playing Hearts - Round {{ gameStore.lobbyState?.currentRound || 1 }}
        </h2>
        
        <div v-if="gameStore.isMyTurn" class="turn-indicator">
          ⭐ Your Turn!
        </div>
      </div>

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

      <div v-else-if="gameStore.hasPassed" class="waiting-message">
        ⏳ Waiting for other players to pass cards...
      </div>
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
          <div v-if="gameStore.lobbyState?.currentTrickCards?.length" class="current-trick">
            <h3>Current Trick</h3>
            <div class="trick-cards">
              <div 
                v-for="(play, index) in gameStore.lobbyState.currentTrickCards"
                :key="index" 
                class="trick-card"
              >
                <PlayerCard 
                  :card="play.card"
                  :size="'medium'"
                  :clickable="false"
                />
                <div class="card-player">{{ getPlayerName(play.seat) }}</div>
              </div>
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
        <div class="my-player-info">
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

    <!-- Scoreboard -->
    <div class="scoreboard" v-if="gameStore.lobbyState?.scores">
      <h3>Scores</h3>
      <div class="score-table">
        <div class="score-header">
          <div>Player</div>
          <div>Current</div>
          <div>Total</div>
        </div>
        <div 
          v-for="(player, seatIndex) in gameStore.lobbyState?.players"
          :key="seatIndex"
          v-if="player?.name"
          class="score-row"
        >
          <div>{{ getPlayerFirstName(player.name) }}</div>
          <div>{{ getCurrentRoundScore(seatIndex) }}</div>
          <div>{{ getTotalScore(seatIndex) }}</div>
        </div>
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
  // This would need to be calculated based on current round
  return 0 // Placeholder
}

function getTotalScore(seatIndex) {
  return gameStore.lobbyState?.scores?.totals?.[seatIndex] || 0
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

.game-header {
  text-align: center;
  margin-bottom: 1rem;
}

.game-status h2 {
  margin-bottom: 0.5rem;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.turn-indicator {
  background: linear-gradient(45deg, #ffeb3b, #ffc107);
  color: #333;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-weight: bold;
  display: inline-block;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}

.pass-controls {
  margin-top: 1rem;
}

.pass-cards-btn {
  background: linear-gradient(45deg, #4caf50, #45a049);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
}

.pass-cards-btn:disabled {
  background: #666;
  cursor: not-allowed;
}

.pass-cards-btn:not(:disabled):hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

.waiting-message {
  color: #ffeb3b;
  font-weight: bold;
  padding: 0.75rem;
  border-radius: 8px;
  margin-top: 1rem;
}

/* 3x3 Game Table Layout */
.game-seats-container {
  display: grid;
  grid-template-areas:
    ".    upper    ."
    "left center  right"
    "hand hand   hand";
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 1fr 1fr 1fr;
  gap: 1rem;
  margin: 2rem auto;
  max-width: 1000px;
  min-height: 500px;
  height: 600px;
  justify-items: center;
  align-items: center;
}

.game-seat-upper { 
  grid-area: upper; 
  width: 100%;
  display: flex;
  justify-content: center;
}

.game-seat-left { 
  grid-area: left; 
  width: 100%;
  display: flex;
  justify-content: center;
}

.game-seat-right { 
  grid-area: right; 
  width: 100%;
  display: flex;
  justify-content: center;
}

.game-seat-hand { 
  grid-area: hand; 
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.game-seat-center { 
  grid-area: center; 
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Trick Area Styles */
.trick-area {
  text-align: center;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.current-trick h3 {
  margin-bottom: 1rem;
  color: #ffeb3b;
  font-size: 1rem;
}

.trick-cards {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.trick-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.card-player {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.8);
}

/* My Player Area */
.my-player-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 15px;
  margin-bottom: 1rem;
  width: fit-content;
}

.my-avatar {
  margin-bottom: 0.5rem;
}

.player-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.5);
}

.avatar-placeholder {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  font-size: 1.2rem;
  border: 2px solid rgba(255, 255, 255, 0.5);
}

.my-name {
  font-weight: bold;
  color: white;
  margin-bottom: 0.25rem;
}

.my-stats {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.8);
}

.my-hand-area {
  width: 100%;
  display: flex;
  justify-content: center;
}

.scoreboard {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1rem;
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