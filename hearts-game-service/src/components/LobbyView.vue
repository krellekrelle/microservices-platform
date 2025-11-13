<template>
  <div class="lobby-view">
    <div class="lobby-header">
      <h1>🚀 VUE.JS HEARTS LOBBY - NEW VERSION! 🚀</h1>
      <p class="room-info">
        Room: <strong>{{ gameStore.lobbyState.roomId || 'Main Lobby' }}</strong>
      </p>
    </div>

        <div class="seats-container" v-if="gameStore.lobbyState">
      <!-- Seat 0 (Top) -->
      <div class="seat seat-upper" 
           :class="getSeatClasses(0)"
           @click="handleSeatClick(0)">
        <div class="seat-number">Seat 1</div>
        <div class="seat-content">
          <div v-if="gameStore.lobbyState.players[0]" class="seat-player">
            <PlayerAvatar
              :seat="0"
              :player-name="getPlayerName(gameStore.lobbyState.players[0])"
              :is-lobby-leader="gameStore.lobbyState.lobbyLeader === 0"
              :video-stream="0 === gameStore.mySeat ? videoManager?.value?.localStream?.value : videoManager?.value?.remoteStreams?.get(0)"
              size="xlarge"
            />
            <div class="player-name">{{ getPlayerDisplayName(gameStore.lobbyState.players[0]) }}</div>
            <div v-if="gameStore.lobbyState.players[0].ready" class="ready-indicator">✓ Ready</div>
            <div v-if="gameStore.lobbyState.players[0].isBot" class="bot-status">🤖 Bot</div>
          </div>
          <div v-else class="empty-seat">Click to sit</div>
          <button v-if="!gameStore.lobbyState.players[0]" class="add-bot-seat-btn btn info" @click.stop="addBotToSeat(0)">+</button>
          <button v-if="gameStore.lobbyState.players[0] && gameStore.lobbyState.players[0].isBot" class="remove-bot-btn btn danger" @click.stop="removeBotFromSeat(0)">×</button>
        </div>
      </div>

      <!-- Seat 1 (Right) -->
      <div class="seat seat-right" 
           :class="getSeatClasses(1)"
           @click="handleSeatClick(1)">
        <div class="seat-number">Seat 2</div>
        <div class="seat-content">
          <div v-if="gameStore.lobbyState.players[1]" class="seat-player">
            <PlayerAvatar
              :seat="1"
              :player-name="getPlayerName(gameStore.lobbyState.players[1])"
              :is-lobby-leader="gameStore.lobbyState.lobbyLeader === 1"
              :video-stream="1 === gameStore.mySeat ? videoManager?.value?.localStream?.value : videoManager?.value?.remoteStreams?.get(1)"
              size="xlarge"
            />
            <div class="player-name">{{ getPlayerDisplayName(gameStore.lobbyState.players[1]) }}</div>
            <div v-if="gameStore.lobbyState.players[1].ready" class="ready-indicator">✓ Ready</div>
            <div v-if="gameStore.lobbyState.players[1].isBot" class="bot-status">🤖 Bot</div>
          </div>
          <div v-else class="empty-seat">Click to sit</div>
          <button v-if="!gameStore.lobbyState.players[1]" class="add-bot-seat-btn btn info" @click.stop="addBotToSeat(1)">+</button>
          <button v-if="gameStore.lobbyState.players[1] && gameStore.lobbyState.players[1].isBot" class="remove-bot-btn btn danger" @click.stop="removeBotFromSeat(1)">×</button>
        </div>
      </div>

      <!-- Center Controls -->
      <div class="lobby-controls">
        <button v-if="gameStore.mySeat !== null" id="leave-seat-btn" class="btn danger" @click="leaveSeat">
          Leave Seat
        </button>
        <button 
          v-if="gameStore.mySeat !== null" 
          id="ready-btn" 
          class="btn success" 
          :class="{ active: gameStore.myPlayer?.ready }"
          @click="toggleReady"
        >
          {{ gameStore.myPlayer?.ready ? '✓ Ready' : 'Ready Up' }}
        </button>
        
        <!-- Video Controls -->
        <button 
          v-if="gameStore.mySeat !== null && !videoManager?.value?.isVideoEnabled?.value" 
          id="enable-video-btn" 
          class="btn info" 
          @click="enableVideo"
        >
          📹 Enable Video
        </button>
        <button 
          v-if="gameStore.mySeat !== null && videoManager?.value?.isVideoEnabled?.value" 
          id="disable-video-btn" 
          class="btn warning" 
          @click="disableVideo"
        >
          📹 Disable Video
        </button>
        
        <button 
          id="start-game-btn" 
          class="btn success" 
          :disabled="!gameStore.canStartGame"
          @click="startGame"
        >
          Start Game
        </button>
      </div>

      <!-- Seat 2 (Bottom) -->
      <div class="seat seat-lower" 
           :class="getSeatClasses(2)"
           @click="handleSeatClick(2)">
        <div class="seat-number">Seat 3</div>
        <div class="seat-content">
          <div v-if="gameStore.lobbyState.players[2]" class="seat-player">
            <PlayerAvatar
              :seat="2"
              :player-name="getPlayerName(gameStore.lobbyState.players[2])"
              :is-lobby-leader="gameStore.lobbyState.lobbyLeader === 2"
              :video-stream="2 === gameStore.mySeat ? videoManager?.value?.localStream?.value : videoManager?.value?.remoteStreams?.get(2)"
              size="xlarge"
            />
            <div class="player-name">{{ getPlayerDisplayName(gameStore.lobbyState.players[2]) }}</div>
            <div v-if="gameStore.lobbyState.players[2].ready" class="ready-indicator">✓ Ready</div>
            <div v-if="gameStore.lobbyState.players[2].isBot" class="bot-status">🤖 Bot</div>
          </div>
          <div v-else class="empty-seat">Click to sit</div>
          <button v-if="!gameStore.lobbyState.players[2]" class="add-bot-seat-btn btn info" @click.stop="addBotToSeat(2)">+</button>
          <button v-if="gameStore.lobbyState.players[2] && gameStore.lobbyState.players[2].isBot" class="remove-bot-btn btn danger" @click.stop="removeBotFromSeat(2)">×</button>
        </div>
      </div>

      <!-- Seat 3 (Left) -->
      <div class="seat seat-left" 
           :class="getSeatClasses(3)"
           @click="handleSeatClick(3)">
        <div class="seat-number">Seat 4</div>
        <div class="seat-content">
          <div v-if="gameStore.lobbyState.players[3]" class="seat-player">
            <PlayerAvatar
              :seat="3"
              :player-name="getPlayerName(gameStore.lobbyState.players[3])"
              :is-lobby-leader="gameStore.lobbyState.lobbyLeader === 3"
              :video-stream="3 === gameStore.mySeat ? videoManager?.value?.localStream?.value : videoManager?.value?.remoteStreams?.get(3)"
              size="xlarge"
            />
            <div class="player-name">{{ getPlayerDisplayName(gameStore.lobbyState.players[3]) }}</div>
            <div v-if="gameStore.lobbyState.players[3].ready" class="ready-indicator">✓ Ready</div>
            <div v-if="gameStore.lobbyState.players[3].isBot" class="bot-status">🤖 Bot</div>
          </div>
          <div v-else class="empty-seat">Click to sit</div>
          <button v-if="!gameStore.lobbyState.players[3]" class="add-bot-seat-btn btn info" @click.stop="addBotToSeat(3)">+</button>
          <button v-if="gameStore.lobbyState.players[3] && gameStore.lobbyState.players[3].isBot" class="remove-bot-btn btn danger" @click.stop="removeBotFromSeat(3)">×</button>
        </div>
      </div>
    </div>
  </div>
  
  <!-- SIMPLE VIDEO TEST BOX AT BOTTOM -->
  <div class="video-test-box">
    <h3>Video Test Area</h3>
    <div class="video-test-content">
      <div class="local-video-container">
        <h4>My Camera</h4>
        <video 
          id="test-local-video"
          class="test-video"
          autoplay
          muted
          playsinline
        ></video>
        <div class="video-info">
          <p>Video Enabled: {{ videoManager?.value?.isVideoEnabled?.value ? 'YES' : 'NO' }}</p>
          <p>Stream Available: {{ videoManager?.value?.localStream?.value ? 'YES' : 'NO' }}</p>
          <p>My Seat: {{ gameStore.mySeat }}</p>
        </div>
        <button 
          class="btn btn-primary"
          @click="testEnableVideo"
          :disabled="videoManager?.value?.isVideoEnabled?.value"
        >
          Enable Test Video
        </button>
        <button 
          class="btn btn-danger"
          @click="testDisableVideo"
          :disabled="!videoManager?.value?.isVideoEnabled?.value"
        >
          Disable Test Video
        </button>
      </div>
      
      <div class="remote-videos-container">
        <h4>Other Players</h4>
        <div class="remote-video-grid">
          <div v-for="seat in [0, 1, 2, 3]" :key="seat" class="remote-video-slot">
            <video 
              :id="`test-remote-video-${seat}`"
              class="test-video"
              autoplay
              playsinline
            ></video>
            <p>Seat {{ seat + 1 }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useGameStore } from '../stores/gameStore'
import { useSocket } from '../composables/useSocket'
import PlayerAvatar from './PlayerAvatar.vue'

const gameStore = useGameStore()
const { emitToggleReady, emitAddBot, emitRemoveBot, emitStartGame, emitTakeSeat, emitLeaveSeat, videoManager } = useSocket()

function getPlayerName(player) {
  if (!player) return 'Unknown'
  return player.userName || player.name || 'Unknown'
}

function getPlayerDisplayName(player) {
  const fullName = getPlayerName(player)
  if (!fullName) return 'Unknown'
  return fullName.split(' ')[0]
}

function getPlayerInitials(player) {
  const fullName = getPlayerName(player)
  if (!fullName) return '?'
  return fullName.split(' ')
    .map(name => name[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getSeatClasses(seatIndex) {
  const player = gameStore.lobbyState?.players[seatIndex]
  return {
    'occupied': player && (player.userName || player.name),
    'my-seat': gameStore.mySeat === seatIndex,
    'leader': gameStore.lobbyState?.lobbyLeader === seatIndex
  }
}

function handleSeatClick(seatIndex) {
  console.log(`🪑 Clicked seat ${seatIndex}`);
  console.log('🎮 Current mySeat:', gameStore.mySeat);
  console.log('👤 Seat occupied?', gameStore.lobbyState?.players[seatIndex]);
  
  // Only allow sitting if seat is empty and user doesn't have a seat
  if (!gameStore.lobbyState?.players[seatIndex] && gameStore.mySeat == null) {
    console.log('📡 About to emit take-seat event...');
    // Take the specific seat
    emitTakeSeat(seatIndex)
    console.log('✅ Take-seat event emitted');
  } else {
    console.log('❌ Cannot take seat - either occupied or user already has seat');
  }
}

function leaveSeat() {
  if (gameStore.mySeat !== null) {
    // Leave current seat
    emitLeaveSeat()
  }
}

function toggleReady() {
  emitToggleReady()
}

function addBotToSeat(seatIndex) {
  emitAddBot(seatIndex)
}

function removeBotFromSeat(seatIndex) {
  emitRemoveBot(seatIndex)
}

function startGame() {
  if (gameStore.canStartGame) {
    emitStartGame()
  }
}

function toggleVideo() {
  if (!videoManager || !videoManager.value) {
    console.warn('Video manager not available yet')
    return
  }
  
  if (videoManager.value.isVideoEnabled) {
    disableVideo()
  } else {
    enableVideo()
  }
}

function enableVideo() {
  console.log('🔥 URGENT DEBUG: enableVideo() called!')
  if (!videoManager || !videoManager.value) {
    console.warn('Video manager not available yet')
    return
  }
  
  console.log('🔥 URGENT DEBUG: About to call videoManager.value.enableVideo()')
  videoManager.value.enableVideo()
}

function disableVideo() {
  console.log('🔥 URGENT DEBUG: disableVideo() called!')
  if (!videoManager || !videoManager.value) {
    console.warn('Video manager not available yet')
    return
  }
  
  console.log('🔥 URGENT DEBUG: About to call videoManager.value.disableVideo()')
  videoManager.value.disableVideo()
}

// TEST VIDEO FUNCTIONS
function testEnableVideo() {
  console.log('🎬 TEST: Enabling video...')
  if (!videoManager || !videoManager.value) {
    console.error('❌ TEST: Video manager not available')
    return
  }
  
  videoManager.value.enableVideo().then(() => {
    console.log('🎬 TEST: Video enabled, attempting to show in test element')
    console.log('🎬 TEST: Video manager object:', videoManager.value)
    console.log('🎬 TEST: localStream ref:', videoManager.value.localStream)
    console.log('🎬 TEST: localStream value:', videoManager.value.localStream?.value)
    console.log('🎬 TEST: isVideoEnabled:', videoManager.value.isVideoEnabled?.value)
    
    // Wait a bit for the stream to be ready
    setTimeout(() => {
      const testVideo = document.getElementById('test-local-video')
      console.log('🎬 TEST: Direct localStream access:', videoManager.value.localStream)
      console.log('🎬 TEST: Direct localStream type:', typeof videoManager.value.localStream)
      
      const stream = videoManager.value.localStream // This IS the MediaStream directly (Vue auto-unwraps)
      
      console.log('🎬 TEST: Video element:', testVideo)
      console.log('🎬 TEST: Stream after assignment:', stream)
      console.log('🎬 TEST: Stream type:', typeof stream)
      console.log('🎬 TEST: Stream constructor:', stream?.constructor?.name)
      
      // Try direct assignment without variable
      if (testVideo && videoManager.value.localStream) {
        console.log('✅ TEST: Both video element and direct stream exist')
        testVideo.srcObject = videoManager.value.localStream
        testVideo.style.display = 'block'
        testVideo.style.visibility = 'visible'
        testVideo.style.opacity = '1'
        console.log('✅ TEST: Stream assigned directly to video element')
        
        testVideo.onloadedmetadata = () => {
          console.log('✅ TEST: Video metadata loaded')
          testVideo.play().catch(error => {
            console.error('❌ TEST: Video play failed:', error)
          })
        }
      } else if (testVideo && stream) {
        // Force display properties
        testVideo.style.display = 'block'
        testVideo.style.visibility = 'visible'
        testVideo.style.opacity = '1'
        
        // Clear and reassign
        testVideo.srcObject = null
        setTimeout(() => {
          testVideo.srcObject = stream
          console.log('🎬 TEST: Stream assigned to test video element')
          
          testVideo.onloadedmetadata = () => {
            console.log('🎬 TEST: Video metadata loaded')
            testVideo.play().catch(error => {
              console.error('❌ TEST: Video play failed:', error)
            })
          }
        }, 100)
      } else {
        console.error('❌ TEST: Missing video element or stream')
        console.error('❌ TEST: Video element exists:', !!testVideo)
        console.error('❌ TEST: Stream exists:', !!stream)
      }
    }, 200)
  }).catch(error => {
    console.error('❌ TEST: Enable video failed:', error)
  })
}

function testDisableVideo() {
  console.log('🎬 TEST: Disabling video...')
  if (!videoManager || !videoManager.value) {
    console.error('❌ TEST: Video manager not available')
    return
  }
  
  videoManager.value.disableVideo()
  
  // Clear test video
  const testVideo = document.getElementById('test-local-video')
  if (testVideo) {
    testVideo.srcObject = null
    testVideo.style.display = 'none'
  }
}
</script>

<style scoped>
.lobby-view {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  color: white;
  background: linear-gradient(135deg, #1e3c72, #2a5298);
  min-height: 100vh;
}

/* Diamond layout for seats */
.seats-container {
  display: grid;
  grid-template-areas:
    ".    seat0    ."
    "seat3  controls    seat1"
    ".    seat2    .";
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 1fr 1fr 1fr;
  gap: 1rem 1rem;
  margin: 2rem 0;
  max-width: 1000px;
  justify-items: center;
  align-items: center;
  height: 715px;
}

.seat-upper { grid-area: seat0; }
.seat-right { grid-area: seat1; }
.seat-lower { grid-area: seat2; }
.seat-left { grid-area: seat3; }
.lobby-controls { grid-area: controls; }

/* Seat styling matching original */
.seat {
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 15px;
  padding: 0;
  text-align: center;
  transition: background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
  cursor: pointer;
  height: 200px;
  width: 220px;
  max-width: 260px;
  min-width: 110px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow: hidden;
  position: relative;
}

.seat:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.5);
}

.seat.occupied {
  background: rgba(76, 175, 80, 0.3);
  border-color: #4caf50;
  cursor: default;
}

.seat.my-seat {
  background: rgba(33, 150, 243, 0.3);
  border-color: #2196f3;
}

.seat.occupied:hover {
  background: rgba(76, 175, 80, 0.3);
}

.seat-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
  overflow: hidden;
  padding-bottom: 36px;
  padding-top: 12px;
}

.seat-number {
  font-size: 1rem;
  font-weight: bold;
  margin-bottom: 0.3rem;
  margin-top: 0.3rem;
  opacity: 0.7;
  display: none; /* Hide seat numbers like original */
}

.empty-seat {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
}

.seat-player {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.player-name {
  font-weight: bold;
  font-size: 0.9rem;
}

.ready-indicator {
  color: #4caf50;
  font-size: 0.8rem;
  font-weight: bold;
}

.bot-status {
  color: #ff9800;
  font-size: 0.8rem;
  font-weight: bold;
}

/* Bot control buttons */
.add-bot-seat-btn, .remove-bot-btn {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  width: 36px;
  height: 36px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 0.9rem;
  font-weight: bold;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.add-bot-seat-btn {
  background: rgba(33, 150, 243, 0.8);
  color: white;
}

.add-bot-seat-btn:hover {
  background: rgba(33, 150, 243, 1);
}

.remove-bot-btn {
  background: rgba(244, 67, 54, 0.8);
  color: white;
}

.remove-bot-btn:hover {
  background: rgba(244, 67, 54, 1);
}

/* Center controls */
.lobby-controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: center;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 1rem;
}

.btn.success {
  background: #4caf50;
  color: white;
}

.btn.success:hover {
  background: #45a049;
}

.btn.success:disabled {
  background: rgba(76, 175, 80, 0.5);
  cursor: not-allowed;
}

.btn.success.active {
  background: #2e7d32;
}

.btn.danger {
  background: #f44336;
  color: white;
}

.btn.danger:hover {
  background: #d32f2f;
}

.lobby-header {
  text-align: center;
  margin-bottom: 2rem;
}

.lobby-header h1 {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.game-info {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1.5rem;
  margin-top: 2rem;
}

.game-info h3 {
  margin-bottom: 1rem;
  color: #ffeb3b;
}

.game-info ul {
  list-style: none;
  padding: 0;
}

.game-info li {
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

/* Video toggle button styles */
#toggle-video-btn {
  font-size: 0.9rem;
  padding: 0.6rem 1rem;
  white-space: nowrap;
}

#toggle-video-btn.btn-primary {
  background: linear-gradient(45deg, #007bff, #0056b3);
  border: none;
  color: white;
}

#toggle-video-btn.btn-primary:hover {
  background: linear-gradient(45deg, #0056b3, #003d82);
  transform: translateY(-1px);
}

#toggle-video-btn.btn-danger {
  background: linear-gradient(45deg, #dc3545, #c82333);
  border: none;
  color: white;
}

#toggle-video-btn.btn-danger:hover {
  background: linear-gradient(45deg, #c82333, #a71e2a);
  transform: translateY(-1px);
}

.game-info li:last-child {
  border-bottom: none;
}

/* VIDEO TEST BOX STYLES */
.video-test-box {
  margin-top: 2rem;
  padding: 1.5rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 10px;
  border: 2px solid #4CAF50;
}

.video-test-box h3 {
  color: #4CAF50;
  margin-bottom: 1rem;
  text-align: center;
}

.video-test-content {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
}

.local-video-container {
  flex: 1;
  min-width: 300px;
}

.local-video-container h4 {
  color: #81C784;
  margin-bottom: 0.5rem;
}

.test-video {
  width: 200px;
  height: 150px;
  border: 2px solid #4CAF50;
  border-radius: 8px;
  background: #000;
  object-fit: cover;
  display: block;
  margin-bottom: 1rem;
}

.video-info {
  background: rgba(255, 255, 255, 0.1);
  padding: 1rem;
  border-radius: 5px;
  margin-bottom: 1rem;
}

.video-info p {
  margin: 0.25rem 0;
  font-size: 0.9rem;
}

.remote-videos-container {
  flex: 1;
  min-width: 300px;
}

.remote-videos-container h4 {
  color: #81C784;
  margin-bottom: 0.5rem;
}

.remote-video-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.remote-video-slot {
  text-align: center;
}

.remote-video-slot .test-video {
  width: 120px;
  height: 90px;
  margin: 0 auto 0.5rem auto;
}

.remote-video-slot p {
  font-size: 0.8rem;
  color: #B0BEC5;
}
</style>