import { ref, onUnmounted } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { useToastStore } from '../stores/toastStore'
import { io } from 'socket.io-client'

// Singleton socket instance shared across all components
const socket = ref(null)
const videoManager = ref(null)

// Function to fetch user info from API
async function fetchUserInfo() {
  try {
    console.log('📡 Fetching user info from API...')
    const response = await fetch('/api/user', {
      method: 'GET',
      credentials: 'include'
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    console.log('👤 User info received from API:', data)
    
    if (data.success && data.user) {
      return data.user
    } else if (data.authenticated && data.user) {
      // Handle alternative response format
      return data.user
    } else {
      throw new Error('Invalid user data received')
    }
  } catch (error) {
    console.error('❌ Failed to fetch user info:', error)
    return null
  }
}

export function useSocket() {
  const gameStore = useGameStore()
  const toastStore = useToastStore()



  function findMySeatByUserId(lobbyData) {
    const currentUser = gameStore.currentUser
    if (!currentUser || !lobbyData.players) {
      console.log('🤷 Cannot detect seat - no current user or player data')
      return null
    }

    console.log('🔍 Looking for my seat. Current user ID:', currentUser.id)
    
    for (let seat = 0; seat < 4; seat++) {
      const player = lobbyData.players[seat]
      if (player && String(player.userId) === String(currentUser.id)) {
        console.log('🪑 Found my seat:', seat, 'Player:', player)
        return seat
      }
    }
    
    console.log('🤷 My seat not found in player data')
    return null
  }

  function initializeSocket() {
    console.log('🔌 Initializing Socket.IO connection...')
    
    // For local development, connect to localhost:3004
    const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    const socketUrl = isLocalDev ? 'http://localhost:3004' : undefined
    
    socket.value = io(socketUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      path: '/hearts/socket.io/'
    })

    // Connection events
    socket.value.on('connect', async () => {
      console.log('✅ Connected to server')
      gameStore.updateConnectionStatus(true)
      
      // Fetch user info from API
      const userInfo = await fetchUserInfo()
      if (userInfo) {
        gameStore.setCurrentUser(userInfo)
      }
      
      socket.value.emit('join-lobby')
      
      // Initialize video manager if available
      if (window.VideoManager) {
        videoManager.value = new window.VideoManager(socket.value)
      }
    })

    socket.value.on('disconnect', (reason) => {
      console.log('❌ Disconnected from server. Reason:', reason)
      gameStore.updateConnectionStatus(false)
    })

    socket.value.on('connect_error', (error) => {
      console.error('🔥 Socket.IO connection error:', error)
      gameStore.updateConnectionStatus(false)
    })

    socket.value.on('error', (error) => {
      console.error('🔥 Socket.IO error:', error)
    })

    // Lobby events
    socket.value.on('lobby-updated', (data) => {
      console.log('🏛️ Lobby updated:', data)
      if (data.state === 'lobby') {
        gameStore.updateLobbyState(data)
        
        // Check if we have a pending seat from a recent take-seat action
        if (socket.value._pendingSeat !== undefined) {
          const pendingSeat = socket.value._pendingSeat
          const player = data.players[pendingSeat]
          
          console.log('🔍 Checking pending seat', pendingSeat, ':', player)
          
          // If the pending seat now has a player (and it's not a bot), assume it's us
          if (player && !player.isBot && player.userName) {
            console.log('🪑 Setting my seat to pending seat:', pendingSeat)
            gameStore.setMySeat(pendingSeat)
            delete socket.value._pendingSeat // Clear the pending seat
            return // Exit early since we found our seat
          }
        }
        
        // Try to detect seat by matching user ID
        const detectedSeat = findMySeatByUserId(data)
        if (detectedSeat !== null) {
          gameStore.setMySeat(detectedSeat)
        }
      }
    })

    socket.value.on('game-started', (data) => {
      console.log('🎮 Game started:', data)
      gameStore.setEndGameShown(false)
      gameStore.updateLobbyState(data)
      
      // Restore video streams after game start
      setTimeout(() => {
        if (videoManager.value) {
          console.log('🎥 Restoring video streams after game start')
          videoManager.value.restoreVideoStreams()
        }
      }, 500)
    })

    // Game state events
    socket.value.on('game-state', (data) => {
      console.log('🎯 Game state update:', data)
      try {
        gameStore.updateGameState(data)
        
        // Clear any card being played since we received an update
        gameStore.clearCardBeingPlayed()
        
        // Auto-detect my seat if not already set and we have player data
        if (gameStore.mySeat === null && data.players) {
          console.log('🔍 Attempting to detect my seat from game state...')
          const detectedSeat = findMySeatByUserId(data)
          if (detectedSeat !== null) {
            gameStore.setMySeat(detectedSeat)
          }
        }
        
        // Check for sound events
        if (window.soundManager) {
          window.soundManager.checkForSoundEvents(data)
        }
        console.log('✅ Game state update completed successfully')
      } catch (error) {
        console.error('❌ Error updating game state:', error)
        // Don't let game state errors disconnect the socket
      }
    })

    socket.value.on('cards-passed', (data) => {
      console.log('🃏 Cards passed:', data)
      gameStore.setHasPassed(false) // Reset for next round
      gameStore.clearSelectedCards()
    })

    socket.value.on('trick-completed', (data) => {
      console.log('🎯 Trick completed:', data)
      // Show the completed trick with all 4 cards for 1.5 seconds
      // The server will send updated game-state after TRICK_DISPLAY_MS to clear it
      gameStore.setTrickCompleted(data)
    })

    socket.value.on('game-ended', (data) => {
      console.log('🏁 Game ended:', data)
      gameStore.updateLobbyState(data)
    })

    // User events
    socket.value.on('user-info', (data) => {
      console.log('👤 User info received:', data)
      gameStore.setCurrentUser(data.user)
      gameStore.setMySeat(data.seat)
    })

    // Error events
    socket.value.on('error', (error) => {
      console.error('❌ Socket error:', error)
      const message = error.message || error || 'An error occurred'
      toastStore.showError(message)
      
      // Clear any card being played on error
      gameStore.clearCardBeingPlayed()
    })

    // Success events
    socket.value.on('pass-cards-success', (data) => {
      console.log('✅ Cards passed successfully:', data)
      toastStore.showSuccess('Cards passed successfully!')
    })

    // Disconnection countdown
    socket.value.on('player-disconnected-countdown', (data) => {
      console.log('⏰ Player disconnected, countdown started:', data)
      if (data.durationMinutes) {
        const endTime = Date.now() + (data.durationMinutes * 60 * 1000)
        gameStore.setCountdownEndTime(endTime)
      }
    })

    socket.value.on('player-reconnected', () => {
      console.log('🔄 Player reconnected, countdown stopped')
      gameStore.setCountdownEndTime(null)
    })

    // Handle game stopped
    socket.value.on('game-stopped', (data) => {
      console.log('🛑 Game stopped:', data)
      toastStore.showSuccess(`Game stopped by ${data.stoppedBy}: ${data.reason}`)
      gameStore.setEndGameShown(false) // Reset for next game
    })

    // Handle return to lobby
    socket.value.on('return-to-lobby', (data) => {
      console.log('🏠 Returning to lobby:', data)
      
      // Reset game state
      gameStore.resetGameState()
      gameStore.setMySeat(null)
      gameStore.clearSelectedCards()
      gameStore.setHasPassed(false)
      gameStore.setEndGameShown(false)
      
      toastStore.showSuccess('Returned to lobby')
    })
  }

  function emitJoinLobby(options = {}) {
    if (socket.value) {
      socket.value.emit('join-lobby', options)
    }
  }

  function emitTakeSeat(seatIndex) {
    console.log('🎯 DEBUG: emitTakeSeat called with seatIndex:', seatIndex)
    console.log('🎯 DEBUG: socket.value exists:', !!socket.value)
    console.log('🎯 DEBUG: socket.value.connected:', socket.value?.connected)
    console.log('🎯 DEBUG: socket.value.id:', socket.value?.id)
    
    if (!socket.value) {
      console.error('❌ DEBUG: Cannot emit take-seat - socket is null')
      toastStore.showError('Not connected to server')
      return
    }
    
    if (gameStore.mySeat !== null) {
      toastStore.showError('You already have a seat. Leave your current seat first.')
      return
    }
    
    console.log('🎯 DEBUG: About to emit take-seat event with data:', { seat: seatIndex })
    socket.value.emit('take-seat', { seat: seatIndex })
    console.log('🎯 DEBUG: take-seat event emitted successfully')
    
    // Store the seat we're trying to take so we can set it when lobby updates
    socket.value._pendingSeat = seatIndex
  }

  function emitLeaveSeat() {
    if (socket.value) {
      socket.value.emit('leave-seat')
    }
  }

  function emitToggleReady() {
    if (socket.value) {
      socket.value.emit('ready-for-game')
    }
  }

  function emitAddBot(seatIndex) {
    if (socket.value) {
      socket.value.emit('add-bot', { seat: seatIndex })
    }
  }

  function emitRemoveBot(seatIndex) {
    if (socket.value) {
      socket.value.emit('remove-bot', { seat: seatIndex })
    }
  }

  function emitStartGame() {
    if (!socket.value) {
      console.error('❌ Cannot emit start-game - socket is null')
      toastStore.showError('Not connected to server')
      return
    }
    
    if (!gameStore.isLobbyLeader) {
      toastStore.showError('Only the lobby leader can start the game')
      return
    }
    
    if (!gameStore.canStartGame) {
      toastStore.showError('Not all players are ready')
      return
    }
    
    console.log('🚀 Emitting start-game event...')
    socket.value.emit('start-game')
    console.log('✅ Start-game event emitted')
  }

  function emitStopGame() {
    if (socket.value) {
      socket.value.emit('stop-game')
    }
  }

  function emitPassCards(cards) {
    if (!socket.value) {
      toastStore.showError('Not connected to server')
      return
    }
    
    if (cards.length !== 3) {
      toastStore.showError('You must select exactly 3 cards to pass')
      return
    }
    
    if (gameStore.hasPassed) {
      toastStore.showError('You have already passed cards this round')
      return
    }
    
    socket.value.emit('pass-cards', { cards })
    gameStore.setHasPassed(true)
  }

  function emitPlayCard(card) {
    if (!socket.value) {
      toastStore.showError('Not connected to server')
      return
    }
    
    if (!gameStore.isMyTurn) {
      toastStore.showError('It\'s not your turn')
      return
    }
    
    if (gameStore.lobbyState?.state !== 'playing') {
      toastStore.showError('You can only play cards during the playing phase')
      return
    }

    // Prevent duplicate card plays
    if (gameStore.cardBeingPlayed === card) {
      console.log('🚫 Card already being played:', card)
      return
    }

    console.log('🎯 Playing card:', card)
    gameStore.setCardBeingPlayed(card)
    socket.value.emit('play-card', { card })
  }

  function cleanup() {
    if (socket.value) {
      console.log('🧹 Cleaning up socket connection...')
      socket.value.disconnect()
      socket.value = null
    }
    
    if (videoManager.value) {
      // Cleanup video manager if needed
      videoManager.value = null
    }
    
    gameStore.resetGameState()
  }

  // Note: Don't auto-cleanup on component unmount since socket should persist
  // across different views (lobby -> game). Only cleanup when app unmounts.

  return {
    socket,
    initializeSocket,
    emitJoinLobby,
    emitTakeSeat,
    emitLeaveSeat,
    emitToggleReady,
    emitAddBot,
    emitRemoveBot,
    emitStartGame,
    emitStopGame,
    emitPassCards,
    emitPlayCard,
    cleanup
  }
}