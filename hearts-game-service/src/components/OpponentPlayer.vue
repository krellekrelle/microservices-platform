<template>
  <div 
    v-if="player" 
    class="opponent-player"
    :class="{ 
      'current-turn': gameStore.lobbyState?.currentTurnSeat === seatIndex,
      'is-bot': player.isBot 
    }"
  >
    <PlayerAvatar
      :seat="seatIndex"
      :player-name="getPlayerName(player)"
      :profile-picture="player.profilePicture"
      :is-lobby-leader="false"
      :video-stream="remoteStream"
      :show-video="showVideo"
      size="large"
    />
    
    <div class="opponent-info">
      <div class="opponent-name">{{ getPlayerFirstName(getPlayerName(player)) }}</div>
      <div class="opponent-stats">
        Cards: {{ getPlayerHandSize(seatIndex) }} | 
        Tricks: {{ getTricksWon(seatIndex) }}
      </div>
      <div v-if="player.isBot" class="bot-indicator">🤖 Bot</div>
    </div>
  </div>
  
  <div v-else class="empty-opponent">
    <div class="empty-seat-placeholder">Empty Seat</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { useSocket } from '../composables/useSocket'
import PlayerAvatar from './PlayerAvatar.vue'

const props = defineProps({
  seatIndex: {
    type: Number,
    required: true
  }
})

const gameStore = useGameStore()
const { videoManager } = useSocket()

const player = computed(() => {
  if (props.seatIndex === null || props.seatIndex === undefined) return null
  return gameStore.lobbyState?.players?.[props.seatIndex]
})

// Computed properties for video
const remoteStream = computed(() => {
  return videoManager.value?.remoteStreams?.get(props.seatIndex) ?? null
})

const showVideo = computed(() => {
  const hasVideo = videoManager.value?.activeVideoSeats?.has(props.seatIndex) ?? false
  const isNotBot = player.value && !player.value.isBot
  return hasVideo && isNotBot
})

function getPlayerName(player) {
  if (!player) return 'Unknown'
  return player.userName || player.name || 'Unknown'
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
  min-height: 180px;
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

.bot-indicator {
  background: rgba(0, 0, 0, 0.8);
  border-radius: 8px;
  padding: 0.2rem 0.4rem;
  margin-top: 0.2rem;
  font-size: 0.7rem;
  color: white;
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