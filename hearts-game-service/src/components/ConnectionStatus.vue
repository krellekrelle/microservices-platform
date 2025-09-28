<template>
  <div id="connection-status" :class="{ 'connected': gameStore.connected, 'disconnected': !gameStore.connected }">
    {{ gameStore.connected ? 'Connected' : 'Disconnected' }}
  </div>
</template>

<script setup>
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
</script>

<style scoped>
#connection-status {
  position: fixed;
  top: 10px;
  left: 10px;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: bold;
  z-index: 1000;
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

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
</style>