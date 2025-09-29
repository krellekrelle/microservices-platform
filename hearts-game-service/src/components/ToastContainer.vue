<template>
  <div class="toast-container">
    <Toast
      v-for="toast in toastStore.toasts"
      :key="toast.id"
      :id="toast.id"
      :message="toast.message"
      :type="toast.type"
      :ttl="toast.ttl"
      @remove="handleRemove"
    />
  </div>
</template>

<script setup>
import { useToastStore } from '../stores/toastStore'
import Toast from './Toast.vue'

const toastStore = useToastStore()

function handleRemove(id) {
  toastStore.removeToast(id)
}
</script>

<style scoped>
.toast-container {
  position: fixed;
  right: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 3000;
  pointer-events: none; /* allow clicks to pass through except on toasts themselves */
}
</style>