import { ref, onUnmounted } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { useToastStore } from '../stores/toastStore'

export function useVideoManager(socket) {
  const gameStore = useGameStore()
  const toastStore = useToastStore()
  
  // Video state
  const localStream = ref(null)
  const isVideoEnabled = ref(false)
  const peerConnections = ref(new Map()) // seat -> RTCPeerConnection
  const remoteStreams = ref(new Map()) // seat -> MediaStream
  const activeVideoSeats = ref(new Set())
  const socketIdToSeat = ref(new Map())
  
  // WebRTC configuration
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }
  
  // Initialize socket listeners
  function setupSocketListeners() {
    const socketInstance = socket.value || socket
    if (!socketInstance) return
    
    // Listen for other players enabling/disabling video
    socketInstance.on('peer-video-enabled', async (data) => {
      socketIdToSeat.value.set(data.socketId, data.seat)
      await createPeerConnection(data.seat, data.socketId, isVideoEnabled.value)
      
      // If we have video enabled, we should initiate the connection
      if (isVideoEnabled.value) {
        const pc = peerConnections.value.get(data.seat)
        if (pc) {
          try {
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            
            socketInstance.emit('webrtc-offer', {
              offer: offer,
              toSocketId: data.socketId,
              fromSeat: gameStore.mySeat
            })
          } catch (error) {
            console.error('Error creating offer for new peer:', error)
          }
        }
      } else {
        // If we don't have video enabled, let them know we're ready for their offer
        socketInstance.emit('ready-for-offer', { 
          toSocketId: data.socketId, 
          fromSeat: gameStore.mySeat 
        })
      }
    })
    
    socketInstance.on('peer-video-disabled', (data) => {
      closePeerConnection(data.seat)
      hideVideoForSeat(data.seat)
    })
    
    socketInstance.on('peer-ready-for-offer', async (data) => {
      if (isVideoEnabled.value) {
        const pc = peerConnections.value.get(data.fromSeat)
        if (pc) {
          try {
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            
            // Find the socket ID for this seat
            let targetSocketId = null
            for (let [socketId, seat] of socketIdToSeat.value.entries()) {
              if (seat === data.fromSeat) {
                targetSocketId = socketId
                break
              }
            }
            
            if (targetSocketId) {
              socketInstance.emit('webrtc-offer', {
                offer: offer,
                toSocketId: targetSocketId,
                fromSeat: gameStore.mySeat
              })
            }
          } catch (error) {
            console.error('Error creating offer for ready peer:', error)
          }
        }
      }
    })
    
    // WebRTC signaling events
    socketInstance.on('webrtc-offer', async (data) => {
      if (data.fromSeat !== null && data.fromSeat !== undefined) {
        await handleWebRTCOffer(data)
      } else {
        console.error('Received WebRTC offer with null fromSeat:', data)
      }
    })
    
    socketInstance.on('webrtc-answer', async (data) => {
      if (data.fromSeat !== null && data.fromSeat !== undefined) {
        await handleWebRTCAnswer(data)
      } else {
        console.error('Received WebRTC answer with null fromSeat:', data)
      }
    })
    
    socketInstance.on('webrtc-ice-candidate', async (data) => {
      if (data.fromSeat !== null && data.fromSeat !== undefined) {
        await handleICECandidate(data)
      } else {
        console.error('Received ICE candidate with null fromSeat:', data)
      }
    })
  }
  
  // Enable video stream
  async function enableVideo() {
    try {
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser')
      }
      
      
      localStream.value = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 150, max: 200 },
          height: { ideal: 150, max: 200 },
          frameRate: { ideal: 15, max: 30 },
          facingMode: 'user'
        },
        audio: false
      })
      
      isVideoEnabled.value = true
      
      // Add our stream to any existing peer connections
      peerConnections.value.forEach((pc, seat) => {
        console.log(`Adding local stream to existing peer connection for seat ${seat}`)
        localStream.value.getTracks().forEach(track => {
          pc.addTrack(track, localStream.value)
        })
      })
      
      // Notify other players
      const socketInstance = socket.value || socket
      socketInstance.emit('video-enabled', { seat: gameStore.mySeat })
      
      // Add our own seat to active video seats so our avatar shows video
      if (gameStore.mySeat !== null) {
        activeVideoSeats.value.add(gameStore.mySeat)
      }
      
      toastStore.showSuccess('Camera enabled successfully!')
      
    } catch (error) {
      console.error('❌ Failed to enable video:', error)
      
      let errorMessage = 'Camera access denied or not available'
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Camera permission denied. Please allow camera access and try again.'
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No camera found on this device.'
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'Camera not supported in this browser.'
      }
      
      toastStore.showError(errorMessage)
    }
  }
  
  // Disable video stream
  function disableVideo() {
    
    // Stop local stream tracks explicitly
    if (localStream.value) {
      const tracks = localStream.value.getTracks()
      
      tracks.forEach(track => {
        track.stop()
      })
      
      localStream.value = null
    } else {
      console.log('⚠️ No localStream to stop')
    }
    
    // Close all peer connections
    peerConnections.value.forEach((pc, seat) => {
      console.log(`🔌 Closing peer connection for seat ${seat}`)
      pc.close()
    })
    peerConnections.value.clear()
    remoteStreams.value.clear()
    
    isVideoEnabled.value = false
    
    // Remove our own seat from active video seats
    if (gameStore.mySeat !== null) {
      activeVideoSeats.value.delete(gameStore.mySeat)
    }
    
    // Clear video element srcObject to fully release the stream
    if (gameStore.mySeat !== null) {
      const videoElement = document.getElementById(`video-${gameStore.mySeat}`)
      if (videoElement) {
        videoElement.srcObject = null
        videoElement.load() // Force reload to ensure stream is released
      }
    }
    
    // Notify other players
    const socketInstance = socket.value || socket
    socketInstance.emit('video-disabled', { seat: gameStore.mySeat })
    
    console.log('✅ Video disabled')
  }
  
  // Create peer connection
  async function createPeerConnection(remoteSeat, remoteSocketId, isInitiator) {
    
    const pc = new RTCPeerConnection(rtcConfig)
    peerConnections.value.set(remoteSeat, pc)
    
    // Add local stream if we have it
    if (localStream.value) {
      localStream.value.getTracks().forEach(track => {
        pc.addTrack(track, localStream.value)
      })
    }
    
    // Handle remote stream
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0]
      remoteStreams.value.set(remoteSeat, remoteStream)
      showVideoForSeat(remoteSeat, remoteStream)
    }
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const socketInstance = socket.value || socket
        socketInstance.emit('webrtc-ice-candidate', {
          candidate: event.candidate,
          toSocketId: remoteSocketId,
          fromSeat: gameStore.mySeat
        })
      }
    }
    
    // Create offer if we're the initiator
    if (isInitiator && localStream.value) {
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        
        const socketInstance = socket.value || socket
        socketInstance.emit('webrtc-offer', {
          offer: offer,
          toSocketId: remoteSocketId,
          fromSeat: gameStore.mySeat
        })
      } catch (error) {
        console.error('Error creating offer:', error)
      }
    }
  }
  
  // Handle WebRTC offer
  async function handleWebRTCOffer(data) {
    try {
      let pc = peerConnections.value.get(data.fromSeat)
      if (!pc) {
        // Create peer connection if it doesn't exist
        const targetSocketId = data.fromSocketId || socketIdToSeat.value.get(data.fromSeat)
        if (targetSocketId) {
          await createPeerConnection(data.fromSeat, targetSocketId, false)
          pc = peerConnections.value.get(data.fromSeat)
        }
      }
      
      if (!pc) {
        console.error('Still no peer connection found for seat:', data.fromSeat)
        return
      }
      
      await pc.setRemoteDescription(data.offer)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      
      // Use the fromSocketId provided by the backend
      const targetSocketId = data.fromSocketId
      if (targetSocketId) {
        const socketInstance = socket.value || socket
        socketInstance.emit('webrtc-answer', {
          answer: answer,
          toSocketId: targetSocketId,
          fromSeat: gameStore.mySeat
        })
      } else {
        console.error('No target socket ID available for answer')
      }
    } catch (error) {
      console.error('Error handling WebRTC offer:', error)
    }
  }
  
  // Handle WebRTC answer
  async function handleWebRTCAnswer(data) {
    try {
      const pc = peerConnections.value.get(data.fromSeat)
      if (pc) {
        await pc.setRemoteDescription(data.answer)
      }
    } catch (error) {
      console.error('Error handling WebRTC answer:', error)
    }
  }
  
  // Handle ICE candidate
  async function handleICECandidate(data) {
    try {
      const pc = peerConnections.value.get(data.fromSeat)
      if (pc) {
        await pc.addIceCandidate(data.candidate)
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error)
    }
  }
  
  // Close peer connection
  function closePeerConnection(seat) {
    const pc = peerConnections.value.get(seat)
    if (pc) {
      pc.close()
      peerConnections.value.delete(seat)
    }
    remoteStreams.value.delete(seat)
    activeVideoSeats.value.delete(seat)
  }
  
  // Show video for a specific seat
  function showVideoForSeat(seat, stream) {
    activeVideoSeats.value.add(seat)
    // The actual video display is handled by the avatar components
    // They will reactively update when activeVideoSeats changes
  }
  
  // Hide video for a specific seat
  function hideVideoForSeat(seat) {
    activeVideoSeats.value.delete(seat)
    remoteStreams.value.delete(seat)
  }
  
  // Restore video streams (for compatibility with legacy code)
  function restoreVideoStreams() {
    console.log('🔄 Restoring video streams (Vue reactive - handled automatically)')
    // In Vue with reactive refs, this is handled automatically
    // This function exists for compatibility with legacy calls
  }

  // Cleanup on unmount
  onUnmounted(() => {
    if (localStream.value) {
      localStream.value.getTracks().forEach(track => track.stop())
    }
    peerConnections.value.forEach(pc => pc.close())
  })
  
  return {
    // State
    localStream,
    isVideoEnabled,
    remoteStreams,
    activeVideoSeats,
    
    // Methods
    setupSocketListeners,
    enableVideo,
    disableVideo,
    showVideoForSeat,
    hideVideoForSeat,
    restoreVideoStreams
  }
}