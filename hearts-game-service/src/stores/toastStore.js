import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useToastStore = defineStore('toast', () => {
  // State
  const toasts = ref([])
  let nextId = 1

  // Actions
  function showToast(message, type = 'info', ttl = 4500) {
    const toast = {
      id: nextId++,
      message,
      type, // 'error', 'success', 'info', 'warning'
      ttl,
      timestamp: Date.now()
    }

    toasts.value.push(toast)

    // Auto-remove after ttl
    setTimeout(() => {
      removeToast(toast.id)
    }, ttl)

    return toast.id
  }

  function removeToast(id) {
    const index = toasts.value.findIndex(toast => toast.id === id)
    if (index > -1) {
      toasts.value.splice(index, 1)
    }
  }

  function clearAllToasts() {
    toasts.value = []
  }

  // Convenience methods for different types
  function showError(message, ttl = 4500) {
    return showToast(message, 'error', ttl)
  }

  function showSuccess(message, ttl = 4500) {
    return showToast(message, 'success', ttl)
  }

  function showInfo(message, ttl = 4500) {
    return showToast(message, 'info', ttl)
  }

  function showWarning(message, ttl = 4500) {
    return showToast(message, 'warning', ttl)
  }

  return {
    toasts,
    showToast,
    removeToast,
    clearAllToasts,
    showError,
    showSuccess,
    showInfo,
    showWarning
  }
})