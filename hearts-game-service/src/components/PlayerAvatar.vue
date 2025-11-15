<template>
  <div class="player-avatar-container" :class="`size-${size}`" :data-seat="seat">
    <!-- Profile Picture -->
    <img 
      v-if="profilePicture && !showVideo"
      :src="profilePicture" 
      :alt="`${playerName} profile`"
      class="player-avatar"
      @error="onImageError"
    />
    
    <!-- Avatar Placeholder -->
    <div 
      v-if="!showVideo" 
      class="player-avatar-placeholder"
    >
      {{ playerInitial }}
    </div>
    
    <!-- Video Element - ALWAYS rendered, just hidden when not showing video -->
    <video
      :id="`video-${seat}`"
      class="player-video"
      autoplay
      muted
      playsinline
      :class="{ 'video-enabled': showVideo }"
      :style="{ display: showVideo ? 'block' : 'none' }"
    ></video>
    
    <!-- Lobby Leader Crown -->
    <div v-if="isLobbyLeader" class="lobby-leader-crown">
      👑
    </div>
  </div>
</template>

<script>
import { computed, watch, nextTick } from 'vue'

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
    profilePicture: {
      type: String,
      default: null
    },
    isLobbyLeader: {
      type: Boolean,
      default: false
    },
    videoStream: {
      type: MediaStream,
      default: null
    },
    showVideo: {
      type: Boolean,
      default: false
    },
    size: {
      type: String,
      default: 'large', // 'small', 'medium', 'large', 'xlarge'
      validator: (value) => ['small', 'medium', 'large', 'xlarge'].includes(value)
    }
  },
  setup(props) {
    // Debug props on every update
    watch(() => props, (newProps) => {
      // console.log(`🔍 PlayerAvatar seat ${newProps.seat} props:`, {
      //   showVideo: newProps.showVideo,
      //   hasVideoStream: !!newProps.videoStream,
      //   playerName: newProps.playerName,
      //   size: newProps.size
      // })
    }, { immediate: true, deep: true })
    
    const playerInitial = computed(() => {
      return props.playerName ? props.playerName.charAt(0).toUpperCase() : '?'
    })
    
    // Watch for video stream changes and update video element
    watch(() => [props.videoStream, props.showVideo], async () => {
      // Handle both ref and raw MediaStream
      const stream = props.videoStream?.value ?? props.videoStream
      // console.log(`🎬 PlayerAvatar seat ${props.seat}: showVideo=${props.showVideo}, hasStream=${!!stream}`)
      
      if (props.showVideo && stream) {
        // console.log(`🎬 Attempting to set video stream for seat ${props.seat}`)
        await nextTick()
        
        const videoElement = document.getElementById(`video-${props.seat}`)
        // console.log(`🎬 Video element found for seat ${props.seat}:`, !!videoElement)
        
        if (videoElement) {
          // console.log(`🎬 Setting video stream for seat ${props.seat} using working pattern`)
          
          // WORKING PATTERN FROM OLD CODE:
          // 1. Force display properties IMMEDIATELY
          videoElement.style.display = 'block'
          videoElement.style.visibility = 'visible'
          videoElement.style.opacity = '1'
          
          // 2. Clear srcObject first
          videoElement.srcObject = null
          
          // 3. Use setTimeout to reassign
          setTimeout(() => {
            videoElement.srcObject = stream
            
            // 4. Force display again after stream attachment
            videoElement.style.display = 'block'
            videoElement.style.visibility = 'visible'
            videoElement.style.opacity = '1'
            
            // console.log(`🎬 Stream attached to video element:`, stream)
            // console.log(`🎬 Video element srcObject:`, videoElement.srcObject)
            
            videoElement.onloadedmetadata = () => {
              // console.log(`🎬 Video loaded for seat ${props.seat}`)
              videoElement.play().catch(error => {
                console.error(`❌ Video play failed for seat ${props.seat}:`, error)
              })
            }
          }, 50)
        } else {
          console.error(`❌ Video element not found for seat ${props.seat}`)
        }
      } else {
        // console.log(`🎬 Not setting video for seat ${props.seat} - showVideo: ${props.showVideo}, hasStream: ${!!stream}`)
        
        // Hide video when not needed
        const videoElement = document.getElementById(`video-${props.seat}`)
        if (videoElement) {
          videoElement.style.display = 'none'
          videoElement.srcObject = null
        }
      }
    }, { immediate: true })
    
    function onImageError(event) {
      console.warn('Failed to load profile image:', event.target.src)
    }
    
    return {
      playerInitial,
      onImageError
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
  border: 2px solid rgba(255, 255, 255, 0.3);
  object-fit: cover;
  z-index: 1;
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