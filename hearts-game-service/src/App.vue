<template>
  <div id="hearts-game-app" class="hearts-container">
    <!-- Connection status indicator -->
    <ConnectionStatus />
    
    <!-- Disconnect countdown timer -->
    <DisconnectCountdown />
    
    <!-- Main content based on state -->
    <div v-if="!gameStore.lobbyState" class="loading-container">
      <div class="loading-spinner"></div>
      <p>Connecting to Hearts Game...</p>
    </div>

    <div v-else-if="gameStore.lobbyState.state === 'lobby'" class="lobby-container">
      <LobbyView />
    </div>

    <div v-else-if="gameStore.lobbyState.state === 'passing' || gameStore.lobbyState.state === 'playing'" class="game-container">
      <GameView />
    </div>

    <div v-else-if="gameStore.lobbyState.state === 'game-ended'" class="game-ended-container">
      <GameEndedView />
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useGameStore } from './stores/gameStore'
import { useSocket } from './composables/useSocket'

import ConnectionStatus from './components/ConnectionStatus.vue'
import DisconnectCountdown from './components/DisconnectCountdown.vue'
import LobbyView from './components/LobbyView.vue'
import GameView from './components/GameView.vue'
import GameEndedView from './components/GameEndedView.vue'

const gameStore = useGameStore()
const { socket, initializeSocket, cleanup } = useSocket()

onMounted(() => {
  console.log('🎮 Hearts Game App mounted, initializing socket...')
  initializeSocket()
})

onUnmounted(() => {
  console.log('🎮 Hearts Game App unmounting, cleaning up...')
  cleanup()
})
</script>

<style>
/* Vue-specific base styles - we'll include game CSS separately */

/* Vue-specific styles */
.hearts-container {
  width: 100%;
  height: 100vh;
  position: relative;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: linear-gradient(135deg, #1e3c72, #2a5298);
  color: white;
}

.loading-spinner {
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-left: 4px solid #ffeb3b;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>