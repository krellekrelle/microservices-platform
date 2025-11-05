<template>
  <div class="player-hand" :style="handContainerStyles">
    <PlayerCard
      v-for="(card, index) in hand"
      :key="card"
      :card="card"
      :index="index"
      :selected="selectedCards.includes(card)"
      :clickable="isClickable"
      :size="cardSize"
      :overlap="overlapAmount"
      @click="handleCardClick"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { useSocket } from '../composables/useSocket'
import PlayerCard from './PlayerCard.vue'

const props = defineProps({
  hand: {
    type: Array,
    default: () => []
  },
  cardSize: {
    type: String,
    default: 'large'
  },
  overlapAmount: {
    type: Number,
    default: 25
  }
})

const emit = defineEmits(['cardClick'])

const gameStore = useGameStore()
const { emitPassCards, emitPlayCard } = useSocket()

const selectedCards = computed(() => gameStore.selectedCards)

const isPassingPhase = computed(() => {
  return gameStore.lobbyState?.state === 'passing' && !gameStore.hasPassed
})

const isPlayingPhase = computed(() => {
  return gameStore.lobbyState?.state === 'playing' && gameStore.isMyTurn
})

const isClickable = computed(() => {
  return isPassingPhase.value || isPlayingPhase.value
})

const handContainerStyles = computed(() => {
  // Calculate total width based on card size and overlap
  const cardWidth = props.cardSize === 'xlarge' ? 100 : 80
  const totalWidth = Math.max(400, (props.hand.length - 1) * props.overlapAmount + cardWidth)
  
  return {
    position: 'relative',
    width: `${totalWidth}px`,
    height: '150px', // Increased height for larger cards
    margin: '0 auto'
  }
})

function handleCardClick(card) {
  console.log('🃏 Card clicked:', card, 'Phase:', gameStore.lobbyState?.state, 'IsMyTurn:', gameStore.isMyTurn)
  
  if (isPassingPhase.value) {
    // Passing phase: toggle card selection
    const wasToggled = gameStore.toggleCardSelection(card)
    if (wasToggled) {
      console.log('🃏 Card toggled for passing:', card, 'Selected cards:', gameStore.selectedCards)
    }
  } else if (isPlayingPhase.value) {
    // Playing phase: play the card immediately
    console.log('🎯 Playing card:', card)
    emitPlayCard(card)
    // Also emit to parent component if needed
    emit('cardClick', card)
  }
}
</script>

<style scoped>
.player-hand {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  margin: 1rem auto;
  min-height: 120px;
  padding-top: 2rem
}
</style>