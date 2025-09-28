<template>
  <div class="game-view">
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

    <!-- Game Board -->
    <div class="game-board">
      <!-- Center area with trick cards -->
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

      <!-- Opponents around the table -->
      <div class="opponents-area">
        <div 
          v-for="(player, seatIndex) in gameStore.lobbyState?.players"
          :key="seatIndex"
          v-if="seatIndex !== gameStore.mySeat && player?.name"
          class="opponent"
          :class="{ 'current-turn': gameStore.lobbyState?.currentTurnSeat === seatIndex }"
        >
          <div class="opponent-info">
            <img 
              v-if="player.profilePicture"
              :src="player.profilePicture" 
              :alt="player.name"
              class="opponent-avatar"
            >
            <div v-else class="opponent-avatar-placeholder">
              {{ getPlayerInitials(player.name) }}
            </div>
            <div class="opponent-name">{{ getPlayerFirstName(player.name) }}</div>
            <div class="opponent-stats">
              Cards: {{ getPlayerHandSize(seatIndex) }} | 
              Tricks: {{ getTricksWon(seatIndex) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- My Hand -->
    <div class="my-hand-area">
      <h3>Your Hand</h3>
      <PlayerHand
        v-if="gameStore.myPlayer?.hand"
        :hand="gameStore.myPlayer.hand"
        :cardSize="'large'"
        :overlapAmount="25"
        @cardClick="handleCardClick"
      />
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
          v-for="(player, index) in gameStore.lobbyState.players"
          :key="index"
          v-if="player?.name"
          class="score-row"
        >
          <div class="player-name">{{ getPlayerFirstName(player.name) }}</div>
          <div class="current-score">{{ getCurrentRoundScore(index) }}</div>
          <div class="total-score">{{ getTotalScore(index) }}</div>
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
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.pass-controls {
  margin-top: 1rem;
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

.waiting-message {
  background: rgba(255, 255, 255, 0.1);
  padding: 0.75rem;
  border-radius: 8px;
  margin-top: 1rem;
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
  min-width: 300px;
  min-height: 200px;
}

.trick-cards {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 1rem;
}

.trick-card {
  text-align: center;
}

.card-player {
  margin-top: 0.5rem;
  font-size: 0.9rem;
  color: #ffeb3b;
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

.my-hand-area {
  text-align: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1rem;
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