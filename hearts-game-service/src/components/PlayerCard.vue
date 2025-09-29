<template>
  <img
    :id="`card-${sanitizedCard}`"
    :src="cardImageUrl"
    :alt="card"
    :title="card"
    :data-card="card"
    :class="cardClasses"
    :style="cardStyles"
    @click="handleClick"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @error="handleError"
    @load="handleLoad"
  >
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  card: {
    type: String,
    required: true
  },
  index: {
    type: Number,
    default: 0
  },
  selected: {
    type: Boolean,
    default: false
  },
  clickable: {
    type: Boolean,
    default: true
  },
  size: {
    type: String,
    default: 'large',
    validator: (value) => ['small', 'medium', 'large'].includes(value)
  },
  overlap: {
    type: Number,
    default: 20 // pixels to overlap
  }
})

const emit = defineEmits(['click', 'hover', 'unhover'])

const isHovered = ref(false)
const isBroken = ref(false)

const sanitizedCard = computed(() => {
  return String(props.card).replace(/[^a-zA-Z0-9]/g, '')
})

const cardImageUrl = computed(() => {
  if (!props.card || props.card.length < 2) return ''
  
  let rank = props.card[0]
  let suit = props.card[1]
  
  // Handle 10 cards
  if (rank === '1' && props.card[1] === '0') {
    rank = 'T'
    suit = props.card[2]
  }
  
  const fileName = (rank + suit).toUpperCase() + '.svg'
  return `/hearts/bridge3-box-qr-Large/${fileName}`
})

const cardDimensions = computed(() => {
  const sizes = {
    small: { width: 40, height: 60 },
    medium: { width: 60, height: 90 },
    large: { width: 80, height: 115 },
    xlarge: { width: 100, height: 144 }
  }
  return sizes[props.size]
})

const cardClasses = computed(() => {
  return [
    'player-card',
    `card-${props.size}`,
    {
      'card-selected': props.selected,
      'card-hovered': isHovered.value,
      'card-clickable': props.clickable,
      'card-broken': isBroken.value
    }
  ]
})

const cardStyles = computed(() => {
  const { width, height } = cardDimensions.value
  const leftOffset = props.index * props.overlap
  
  let transform = 'translateY(0px)'
  
  if (props.selected) {
    transform = 'translateY(-15px)'
  } else if (isHovered.value && props.clickable) {
    transform = 'translateY(-8px)'
  }
  
  return {
    width: `${width}px`,
    height: `${height}px`,
    position: 'absolute',
    left: `${leftOffset}px`,
    zIndex: props.index,
    transform,
    transition: 'all 0.2s ease',
    borderRadius: '8px',
    background: '#fff',
    boxShadow: props.selected 
      ? '0 4px 16px rgba(255, 235, 59, 0.6), 0 0 0 3px #ffeb3b'
      : '0 2px 8px rgba(0, 0, 0, 0.3)',
    cursor: props.clickable ? 'pointer' : 'default',
    visibility: isBroken.value ? 'hidden' : 'visible'
  }
})

function handleClick() {
  if (props.clickable && !isBroken.value) {
    emit('click', props.card)
  }
}

function handleMouseEnter() {
  if (props.clickable) {
    isHovered.value = true
    emit('hover', props.card)
  }
}

function handleMouseLeave() {
  if (props.clickable) {
    isHovered.value = false
    emit('unhover', props.card)
  }
}

function handleError() {
  isBroken.value = true
}

function handleLoad() {
  isBroken.value = false
}
</script>

<style scoped>
.player-card {
  user-select: none;
  -webkit-user-drag: none;
  image-rendering: crisp-edges;
}

.card-clickable:hover {
  filter: brightness(1.05);
}

.card-selected {
  filter: brightness(1.1) saturate(1.1);
}

.card-broken {
  visibility: hidden !important;
}

/* Animation for card play */
.card-playing {
  animation: cardPlayAnimation 0.6s ease-out forwards;
}

@keyframes cardPlayAnimation {
  0% {
    transform: translateY(0px) scale(1);
    opacity: 1;
  }
  50% {
    transform: translateY(-20px) scale(1.1);
    opacity: 0.9;
  }
  100% {
    transform: translateY(-40px) scale(0.8);
    opacity: 0;
  }
}
</style>