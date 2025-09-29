<template>
  <div 
    v-if="visible"
    class="toast"
    :class="[type, { show: isShowing }]"
    @click="handleClick"
  >
    <div class="toast-icon">
      {{ getIcon() }}
    </div>
    <div class="toast-body">
      {{ message }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  id: {
    type: Number,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    default: 'info',
    validator: (value) => ['error', 'success', 'info', 'warning'].includes(value)
  },
  ttl: {
    type: Number,
    default: 4500
  },
  autoRemove: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['remove'])

const visible = ref(false)
const isShowing = ref(false)
let removeTimeout = null

function getIcon() {
  switch (props.type) {
    case 'success': return '✓'
    case 'error': return '!'
    case 'warning': return '⚠'
    case 'info': 
    default: return 'ⓘ'
  }
}

function handleClick() {
  removeToast()
}

function removeToast() {
  if (!visible.value) return
  
  isShowing.value = false
  
  // Wait for exit animation to complete
  setTimeout(() => {
    visible.value = false
    emit('remove', props.id)
  }, 220)
  
  // Clear any pending auto-removal
  if (removeTimeout) {
    clearTimeout(removeTimeout)
    removeTimeout = null
  }
}

onMounted(() => {
  // Show the toast with enter animation
  visible.value = true
  requestAnimationFrame(() => {
    isShowing.value = true
  })
  
  // Set up auto-removal if enabled
  if (props.autoRemove && props.ttl > 0) {
    removeTimeout = setTimeout(() => {
      removeToast()
    }, props.ttl)
  }
})

onUnmounted(() => {
  if (removeTimeout) {
    clearTimeout(removeTimeout)
  }
})
</script>

<style scoped>
.toast {
  pointer-events: auto;
  min-width: 180px;
  max-width: 320px;
  background: rgba(30, 30, 30, 0.95);
  color: #fff;
  padding: 8px 12px;
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.6);
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 10px;
  opacity: 0;
  transform: translateY(8px) scale(0.98);
  transition: opacity 180ms ease, transform 180ms ease;
  cursor: pointer;
  margin-bottom: 8px;
}

.toast.show {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.toast-icon {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex: 0 0 28px;
  font-weight: 700;
  font-size: 14px;
}

.toast.error { 
  background: linear-gradient(90deg, #3a1b1b, #5c1820); 
}
.toast.success { 
  background: linear-gradient(90deg, #123d1f, #1f8a3d); 
}
.toast.warning { 
  background: linear-gradient(90deg, #3d2a0f, #8a5f1f); 
}
.toast.info { 
  background: linear-gradient(90deg, #1b2a3a, #1f5c8a); 
}

.toast.error .toast-icon { 
  background: rgba(255, 255, 255, 0.12); 
  color: #ffdddd; 
}
.toast.success .toast-icon { 
  background: rgba(255, 255, 255, 0.08); 
  color: #ddffea; 
}
.toast.warning .toast-icon { 
  background: rgba(255, 255, 255, 0.12); 
  color: #fff3dd; 
}
.toast.info .toast-icon { 
  background: rgba(255, 255, 255, 0.08); 
  color: #ddeeff; 
}

.toast-body {
  flex: 1;
  line-height: 1.3;
}
</style>