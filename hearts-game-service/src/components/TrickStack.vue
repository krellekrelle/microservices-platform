<template>
  <div class="trick-stack" :class="{ 'has-tricks': trickCount > 0 }">
    <div
      v-for="trick in trickCount"
      :key="trick"
      class="trick-card"
      :style="{ 
        left: `${(trick - 1) * 3}px`,
        zIndex: trick
      }"
    >
      <img
        :src="backCardUrl"
        alt="Trick card"
        class="trick-card-image"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

defineProps({
  trickCount: {
    type: Number,
    default: 0
  }
})

const backCardUrl = computed(() => {
  return `/hearts/bridge3-box-qr-Large/2B.svg`
})
</script>

<style scoped>
.trick-stack {
  position: relative;
  display: inline-block;
  height: 24px;
  min-width: 18px;
}

.trick-card {
  position: absolute;
  top: 0;
}

.trick-card-image {
  width: 18px;
  height: 24px;
  border-radius: 2px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.has-tricks {
  /* Add some extra width when there are tricks to account for stacking */
  min-width: calc(18px + var(--stack-width, 0px));
}

/* Calculate dynamic width based on trick count */
.trick-stack:has(.trick-card:nth-child(2)) { --stack-width: 3px; }
.trick-stack:has(.trick-card:nth-child(3)) { --stack-width: 6px; }
.trick-stack:has(.trick-card:nth-child(4)) { --stack-width: 9px; }
.trick-stack:has(.trick-card:nth-child(5)) { --stack-width: 12px; }
.trick-stack:has(.trick-card:nth-child(6)) { --stack-width: 15px; }
.trick-stack:has(.trick-card:nth-child(7)) { --stack-width: 18px; }
.trick-stack:has(.trick-card:nth-child(8)) { --stack-width: 21px; }
.trick-stack:has(.trick-card:nth-child(9)) { --stack-width: 24px; }
.trick-stack:has(.trick-card:nth-child(10)) { --stack-width: 27px; }
.trick-stack:has(.trick-card:nth-child(11)) { --stack-width: 30px; }
.trick-stack:has(.trick-card:nth-child(12)) { --stack-width: 33px; }
.trick-stack:has(.trick-card:nth-child(13)) { --stack-width: 36px; }
</style>