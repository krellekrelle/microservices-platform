<template>
  <div class="video-player" :class="`size-${size}`" :data-seat="seat">
    <!-- ALWAYS render vid    // Watch    // Watch for video stream changes - ONLY after mounting, NO immediate flag
    watch(() => props.videoStream, (newStream) => {
      console.log(`🔥 URGENT DEBUG: PlayerAvatar seat ${props.seat}: Video stream changed:`, newStream)
      attachVideoStream(newStream)
    })video stream changes and apply legacy pattern (NO immediate flag)
    watch(() => props.videoStream, (newStream) => {
      console.log(`🎬 PlayerAvatar seat ${props.seat}: Video stream changed:`, newStream)
      attachVideoStream(newStream)
    })

    onMounted(() => {
      console.log(`🏗️ PlayerAvatar mounted for seat ${props.seat}`)
      // Attach any existing stream after mounting
      if (props.videoStream) {
        attachVideoStream(props.videoStream)
      }
    }) but hide when no stream -->
    <video
      :id="`video-${seat}`"
      ref="videoElement"
      class="player-video"
      autoplay
      muted
      playsinline
      style="width: 100%; height: 100%;"
      :style="{ display: videoStream ? 'block' : 'none' }"
    ></video>
    
    <!-- No Video Placeholder - show when no stream -->
    <div v-if="!videoStream" class="no-video-placeholder">
      <div class="player-initial">{{ playerName ? playerName.charAt(0).toUpperCase() : '?' }}</div>
      <div class="player-name">{{ playerName || 'Empty Seat' }}</div>
    </div>
    
    <!-- Lobby Leader Crown -->
    <div v-if="isLobbyLeader" class="lobby-leader-crown">👑</div>
  </div>
</template>

<script>
import { ref, watch, onMounted, nextTick } from 'vue'

export default {
  name: 'PlayerAvatar',
  props: {
    seat: {
      type: Number,
      required: true
    },
    playerName: {
      type: String,
      default: ''
    },
    isLobbyLeader: {
      type: Boolean,
      default: false
    },
    videoStream: {
      type: [Object, null],
      default: null
    },
    size: {
      type: String,
      default: 'large',
      validator: (value) => ['small', 'medium', 'large', 'xlarge'].includes(value)
    }
  },
  setup(props) {
    const videoElement = ref(null)
    const isMounted = ref(false)

    // Apply the EXACT working legacy pattern
    const attachVideoStream = (stream) => {
      console.log(`🔥 URGENT DEBUG: PlayerAvatar seat ${props.seat}: Attaching video stream using legacy pattern:`, stream)
      console.log(`🔥 URGENT DEBUG: isMounted.value = ${isMounted.value}`)
      console.log(`🔥 URGENT DEBUG: videoElement.value = `, videoElement.value)
      
      if (!isMounted.value) {
        console.log(`⏳ Component not mounted yet for seat ${props.seat}, skipping attachment`)
        return
      }
      
      if (!videoElement.value) {
        console.log(`❌ No video element ref for seat ${props.seat}`)
        return
      }

      if (!stream) {
        console.log(`🛑 Clearing video for seat ${props.seat}`)
        videoElement.value.srcObject = null
        videoElement.value.style.display = 'none'
        return
      }

      // EXACT LEGACY PATTERN: Force display styles IMMEDIATELY
      videoElement.value.style.display = 'block'
      videoElement.value.style.visibility = 'visible' 
      videoElement.value.style.opacity = '1'
      
      // EXACT LEGACY PATTERN: Clear first
      videoElement.value.srcObject = null
      
      // EXACT LEGACY PATTERN: Use setTimeout with 50ms delay
      setTimeout(() => {
        if (videoElement.value && stream) {
          console.log(`📹 Setting srcObject for seat ${props.seat}`)
          videoElement.value.srcObject = stream
          
          // EXACT LEGACY PATTERN: Force display again after stream attachment
          videoElement.value.style.display = 'block'
          videoElement.value.style.visibility = 'visible'
          videoElement.value.style.opacity = '1'
          
          // EXACT LEGACY PATTERN: Add event listeners
          videoElement.value.onloadedmetadata = () => {
            console.log(`🎬 Video loaded for seat ${props.seat} - ${videoElement.value.videoWidth}x${videoElement.value.videoHeight}`)
            videoElement.value.play().catch(error => {
              console.error(`❌ Video play failed for seat ${props.seat}:`, error)
            })
          }
          
          videoElement.value.onplay = () => {
            console.log(`▶️ Video playing for seat ${props.seat}`)
          }
          
          console.log(`📹 Stream attached to seat ${props.seat}:`, videoElement.value.srcObject)
        }
      }, 50) // EXACT same 50ms delay as legacy
    }

    // Watch for video stream changes and apply legacy pattern
    watch(() => props.videoStream, (newStream) => {
      console.log(`� PlayerAvatar seat ${props.seat}: Video stream changed:`, newStream)
      attachVideoStream(newStream)
    }, { immediate: true })

    onMounted(() => {
      console.log(`🔥 URGENT DEBUG: PlayerAvatar MOUNTED for seat ${props.seat}`)
      isMounted.value = true
      // Attach any existing stream after mounting
      if (props.videoStream) {
        console.log(`🔥 URGENT DEBUG: Found existing videoStream on mount for seat ${props.seat}:`, props.videoStream)
        attachVideoStream(props.videoStream)
      }
    })

    return {
      videoElement
    }
  }
}
</script>

<style scoped>
.player-avatar-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lobby-leader-crown {
  position: absolute;
  top: -10px;
  right: -10px;
  font-size: 1.2rem;
  z-index: 2;
}

/* Small size */
.player-avatar-container.size-small .player-avatar,
.player-avatar-container.size-small .player-avatar-placeholder {
  width: 60px;
  height: 60px;
}

.player-avatar-container.size-small .player-video {
  width: 56px;
  height: 56px;
}

/* Medium size */
.player-avatar-container.size-medium .player-avatar,
.player-avatar-container.size-medium .player-avatar-placeholder {
  width: 80px;
  height: 80px;
}

.player-avatar-container.size-medium .player-video {
  width: 76px;
  height: 76px;
}

/* Large size */
.player-avatar-container.size-large .player-avatar,
.player-avatar-container.size-large .player-avatar-placeholder {
  width: 120px;
  height: 120px;
}

.player-avatar-container.size-large .player-video {
  width: 116px;
  height: 116px;
}

/* XLarge size */
.player-avatar-container.size-xlarge .player-avatar,
.player-avatar-container.size-xlarge .player-avatar-placeholder {
  width: 150px;
  height: 150px;
}

.player-avatar-container.size-xlarge .player-video {
  width: 146px;
  height: 146px;
}

.player-avatar,
.player-avatar-placeholder {
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  object-fit: cover;
}

.player-avatar-placeholder {
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 2rem;
  color: white;
}

.player-video {
  border-radius: 50%;
  object-fit: cover;
  z-index: 100;
  border: 2px solid rgba(255, 255, 255, 0.8);
  background: transparent;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  /* FORCE DISPLAY STYLES - matching legacy exactly */
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
  /* Position and size will be set by JavaScript */
}

.player-video.video-debugging {
  border: 2px solid rgba(0, 255, 0, 0.8) !important;
  border-radius: 10px !important;
}

.player-video.video-enabled {
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
}

.dummy-video-test {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(45deg, red, yellow);
  border: 3px solid blue;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  font-size: 12px;
  z-index: 200;
}

.player-video.video-enabled {
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
}
</style>