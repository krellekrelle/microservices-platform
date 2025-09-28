<template>
  <div 
    v-if="showCountdown" 
    class="disconnect-countdown"
  >
    <strong>⚠️ Player Disconnected</strong><br>
    Game will end in: <span class="countdown-timer">{{ formattedTime }}</span>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useGameStore } from '../stores/gameStore'

const gameStore = useGameStore()
const currentTime = ref(Date.now())
let interval = null

const showCountdown = computed(() => {
  return gameStore.countdownEndTime !== null
})

const timeLeft = computed(() => {
  if (!gameStore.countdownEndTime) return 0
  return Math.max(0, gameStore.countdownEndTime - currentTime.value)
})

const formattedTime = computed(() => {
  const totalSeconds = Math.ceil(timeLeft.value / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  
  if (totalSeconds <= 0) {
    return '--'
  }
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
})

onMounted(() => {
  // Update current time every second
  interval = setInterval(() => {
    currentTime.value = Date.now()
    
    // Clear countdown when expired
    if (gameStore.countdownEndTime && currentTime.value >= gameStore.countdownEndTime) {
      gameStore.setCountdownEndTime(null)
    }
  }, 1000)
})

onUnmounted(() => {
  if (interval) {
    clearInterval(interval)
  }
})
</script>

<style scoped>
.disconnect-countdown {
  position: fixed;
  top: 20px;
  right: 20px;
  background: linear-gradient(45deg, #ff4444, #cc1111);
  color: white;
  padding: 1rem 1.5rem;
  border-radius: 12px;
  font-weight: bold;
  font-size: 1.1rem;
  box-shadow: 0 4px 12px rgba(255, 68, 68, 0.4);
  z-index: 5000;
  border: 2px solid rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(5px);
  animation: pulseWarning 2s infinite;
}

@keyframes pulseWarning {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.9; }
}

.countdown-timer {
  font-size: 1.3rem;
  color: #ffeb3b;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
</style>