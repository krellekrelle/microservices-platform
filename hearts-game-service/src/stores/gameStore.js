import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useGameStore = defineStore('game', () => {
  // State
  const connected = ref(false)
  const currentUser = ref(null)
  const mySeat = ref(null)
  const isReady = ref(false)
  const lobbyState = ref(null)
  const hasPassed = ref(false)
  const endGameShown = ref(false)
  const selectedCards = ref([])
  const countdownEndTime = ref(null)

  // Computed
  const isLobbyLeader = computed(() => {
    const result = lobbyState.value && mySeat.value !== null && lobbyState.value.lobbyLeader === mySeat.value
    console.log('🏆 isLobbyLeader check - mySeat:', mySeat.value, 'lobbyLeader:', lobbyState.value?.lobbyLeader, 'result:', result)
    return result
  })

  const myPlayer = computed(() => {
    if (!lobbyState.value || mySeat.value === null) return null
    return lobbyState.value.players[mySeat.value]
  })

  const isMyTurn = computed(() => {
    return lobbyState.value && 
           lobbyState.value.state === 'playing' && 
           mySeat.value === lobbyState.value.currentTurnSeat
  })

  const canStartGame = computed(() => {
    // Use the server's canStartGame value if available, otherwise fallback to local calculation
    if (lobbyState.value && typeof lobbyState.value.canStartGame === 'boolean') {
      return lobbyState.value.canStartGame && isLobbyLeader.value
    }
    
    // Fallback calculation if server doesn't provide canStartGame
    if (!isLobbyLeader.value || !lobbyState.value) return false
    
    let occupiedSeats = 0
    for (let seat = 0; seat < 4; seat++) {
      if (lobbyState.value.players[seat] && lobbyState.value.players[seat].userName) {
        occupiedSeats++
      }
    }
    
    return occupiedSeats === 4
  })

  // Actions
  function updateConnectionStatus(status) {
    connected.value = status
  }

  function setCurrentUser(user) {
    currentUser.value = user
  }

  function setMySeat(seat) {
    console.log('🪑 setMySeat called with:', seat)
    mySeat.value = seat
  }

  function updateLobbyState(newState) {
    console.log('🎮 Store: Updating lobby state:', newState)
    
    // Reset end-game flag when returning to lobby
    if (newState.state === 'lobby') {
      endGameShown.value = false
      hasPassed.value = false
      selectedCards.value = []
    }
    
    lobbyState.value = newState
  }

  function updateGameState(newState) {
    console.log('🎮 Store: Updating game state:', newState)
    // Clear any trick completed data when receiving regular game state update
    // This happens after the server's TRICK_DISPLAY_MS delay
    const updatedState = { ...(lobbyState.value || {}), ...newState }
    if (updatedState.trickCompleted) {
      delete updatedState.trickCompleted
    }
    lobbyState.value = updatedState
    console.log('🎮 Store: Updated lobbyState to:', lobbyState.value)
  }

  function toggleCardSelection(card) {
    if (!lobbyState.value || lobbyState.value.state !== 'passing' || hasPassed.value) {
      return false
    }
    
    const index = selectedCards.value.indexOf(card)
    if (index === -1) {
      if (selectedCards.value.length < 3) {
        selectedCards.value.push(card)
        return true
      }
    } else {
      selectedCards.value.splice(index, 1)
      return true
    }
    return false
  }

  function clearSelectedCards() {
    selectedCards.value = []
  }

  function setHasPassed(passed) {
    hasPassed.value = passed
    if (passed) {
      selectedCards.value = []
    }
  }

  function setEndGameShown(shown) {
    endGameShown.value = shown
  }

  function setCountdownEndTime(time) {
    countdownEndTime.value = time
  }

  function setTrickCompleted(trickData) {
    // Store the completed trick data temporarily for display
    // The server will send updated game-state after TRICK_DISPLAY_MS to clear it
    if (lobbyState.value) {
      lobbyState.value.trickCompleted = trickData
    }
  }

  function resetGameState() {
    lobbyState.value = null
    mySeat.value = null
    isReady.value = false
    hasPassed.value = false
    endGameShown.value = false
    selectedCards.value = []
    countdownEndTime.value = null
  }

  return {
    // State
    connected,
    currentUser,
    mySeat,
    isReady,
    lobbyState,
    hasPassed,
    endGameShown,
    selectedCards,
    countdownEndTime,
    
    // Computed
    isLobbyLeader,
    myPlayer,
    isMyTurn,
    canStartGame,
    
    // Actions
    updateConnectionStatus,
    setCurrentUser,
    setMySeat,
    updateLobbyState,
    updateGameState,
    toggleCardSelection,
    clearSelectedCards,
    setHasPassed,
    setEndGameShown,
    setCountdownEndTime,
    setTrickCompleted,
    resetGameState
  }
})