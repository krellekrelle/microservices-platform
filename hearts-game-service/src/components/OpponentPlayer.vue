<template>
  <div 
    v-if="player" 
    class="opponent-player"
    :class="{ 
      'current-turn': gameStore.lobbyState?.currentTurnSeat === seatIndex,
      'is-bot': player.isBot 
    }"
  >
    <div class="opponent-avatar">
      <img 
        v-if="player.profilePicture"
        :src="player.profilePicture" 
        :alt="player.name"
        class="player-avatar"
      >
      <div v-else class="avatar-placeholder">
        {{ getPlayerInitials(player.name) }}
        <div v-if="player.isBot" class="bot-indicator">🤖</div>
      </div>
    </div>
    
    <div class="opponent-info">
      <div class="opponent-name">{{ getPlayerFirstName(player.name) }}</div>
      <div class="opponent-stats">
        Cards: {{ getPlayerHandSize(seatIndex) }} | 
        Tricks: {{ getTricksWon(seatIndex) }}
      </div>
    </div>

    <!-- Video area for camera (when implemented) -->
    <div class="video-area" v-if="!player.isBot">
      <div class="video-placeholder">📹</div>
    </div>
  </div>
  
  <div v-else class="empty-opponent">
    <div class="empty-seat-placeholder">Empty Seat</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const props = defineProps({
  seatIndex: {
    type: Number,
    required: true
  }
})

const gameStore = useGameStore()

const player = computed(() => {
  if (props.seatIndex === null || props.seatIndex === undefined) return null
  return gameStore.lobbyState?.players?.[props.seatIndex]
})

function getPlayerInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function getPlayerFirstName(name) {
  if (!name) return 'Unknown'
  return name.split(' ')[0]
}

function getPlayerHandSize(seatIndex) {
  return gameStore.lobbyState?.players?.[seatIndex]?.handSize || 0
}

function getTricksWon(seatIndex) {
  return gameStore.lobbyState?.tricksWon?.[seatIndex] || 0
}
</script>

<style scoped>
.opponent-player {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 15px;
  transition: all 0.3s ease;
  min-height: 120px;
  width: 100%;
  max-width: 200px;
}

.opponent-player.current-turn {
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

.opponent-player.is-bot {
  background: rgba(100, 255, 100, 0.1);
  border-color: rgba(100, 255, 100, 0.3);
}

.opponent-avatar {
  position: relative;
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
  position: relative;
}

.bot-indicator {
  position: absolute;
  bottom: -5px;
  right: -5px;
  background: rgba(0, 0, 0, 0.8);
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
}

.opponent-info {
  text-align: center;
  flex-grow: 1;
}

.opponent-name {
  font-weight: bold;
  color: white;
  margin-bottom: 0.25rem;
  font-size: 0.9rem;
}

.opponent-stats {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.8);
}

.video-area {
  margin-top: 0.5rem;
  width: 60px;
  height: 45px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.video-placeholder {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.8rem;
}

.empty-opponent {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 2px dashed rgba(255, 255, 255, 0.2);
  border-radius: 15px;
  min-height: 120px;
  width: 100%;
  max-width: 200px;
}

.empty-seat-placeholder {
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
  text-align: center;
}
</style>