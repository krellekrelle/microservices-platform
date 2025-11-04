<template>
  <div class="connection-status-container">
    <div id="connection-status" :class="{ 'connected': gameStore.connected, 'disconnected': !gameStore.connected }">
      {{ gameStore.connected ? 'Connected' : 'Disconnected' }}
    </div>
    
    <!-- Video toggle button -->
    <button 
      v-if="gameStore.mySeat !== null"
      class="video-toggle-btn"
      :class="isVideoEnabled ? 'btn-video-on' : 'btn-video-off'"
      @click="toggleVideo"
      :title="isVideoEnabled ? 'Turn off camera' : 'Turn on camera'"
    >
      {{ isVideoEnabled ? '📹' : '📷' }}
    </button>
    
    <!-- Stop Game button for lobby leader during game -->
    <button 
      v-if="gameStore.isLobbyLeader && isInGame"
      class="stop-game-btn"
      @click="stopGame"
      title="Stop the current game"
    >
      Stop Game
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { useSocket } from '../composables/useSocket'

const gameStore = useGameStore()
const { emitStopGame, videoManager } = useSocket()

const isInGame = computed(() => {
  return gameStore.lobbyState?.state === 'playing' || gameStore.lobbyState?.state === 'passing'
})

// Computed property to properly unwrap isVideoEnabled ref
const isVideoEnabled = computed(() => videoManager.value?.isVideoEnabled ?? false)

function stopGame() {
  if (confirm('Are you sure you want to stop the current game?')) {
    emitStopGame()
  }
}

function toggleVideo() {
  if (!videoManager || !videoManager.value) {
    console.warn('Video manager not available yet')
    return
  }
  
  console.log('🎥 Toggle video clicked, current state:', isVideoEnabled.value)
  
  if (isVideoEnabled.value) {
    console.log('🎥 Disabling video...')
    videoManager.value.disableVideo()
  } else {
    console.log('🎥 Enabling video...')
    videoManager.value.enableVideo()
  }
}
</script>

<style scoped>
.connection-status-container {
  position: fixed;
  top: 10px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 1000;
}

#connection-status {
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: bold;
  transition: all 0.3s ease;
}

.connected {
  background: linear-gradient(45deg, #4caf50, #66bb6a);
  color: white;
  box-shadow: 0 2px 8px rgba(76, 175, 80, 0.3);
}

.disconnected {
  background: linear-gradient(45deg, #f44336, #ef5350);
  color: white;
  box-shadow: 0 2px 8px rgba(244, 67, 54, 0.3);
  animation: pulse 1s infinite;
}

.stop-game-btn {
  background: linear-gradient(45deg, #ff4444, #cc1111);
  border: none;
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-weight: bold;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(255, 68, 68, 0.3);
}

.stop-game-btn:hover {
  background: linear-gradient(45deg, #ff6666, #ee3333);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 68, 68, 0.4);
}

/* Video toggle button styles */
.video-toggle-btn {
  border: none;
  color: white;
  padding: 0.5rem;
  border-radius: 50%;
  font-size: 1.2rem;
  cursor: pointer;
  transition: all 0.3s ease;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-video-off {
  background: linear-gradient(45deg, #6c757d, #495057);
  box-shadow: 0 2px 8px rgba(108, 117, 125, 0.3);
}

.btn-video-off:hover {
  background: linear-gradient(45deg, #495057, #343a40);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(108, 117, 125, 0.4);
}

.btn-video-on {
  background: linear-gradient(45deg, #007bff, #0056b3);
  box-shadow: 0 2px 8px rgba(0, 123, 255, 0.3);
}

.btn-video-on:hover {
  background: linear-gradient(45deg, #0056b3, #003d82);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 123, 255, 0.4);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
</style>