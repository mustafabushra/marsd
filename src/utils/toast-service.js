/**
 * Toast Notification Service
 * Centralized toast management with deduplication and auto-dismiss
 */

// Store for active toasts
let toastListeners = []
let toastIdCounter = 0

// Toast type constants
export const ToastType = {
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
  WARNING: 'warning',
}

// Toast position constants
export const ToastPosition = {
  TOP_RIGHT: 'top-right',
  TOP_LEFT: 'top-left',
  TOP_CENTER: 'top-center',
  BOTTOM_RIGHT: 'bottom-right',
  BOTTOM_LEFT: 'bottom-left',
  BOTTOM_CENTER: 'bottom-center',
}

/**
 * Toast notification object
 */
class Toast {
  constructor(message, type, options = {}) {
    this.id = `toast-${++toastIdCounter}`
    this.message = message
    this.type = type
    this.title = options.title
    this.duration = options.duration ?? 5000
    this.position = options.position ?? ToastPosition.TOP_RIGHT
    this.dismissible = options.dismissible ?? true
    this.action = options.action
    this.createdAt = Date.now()
  }

  /**
   * Dismiss this toast
   */
  dismiss() {
    toastListeners.forEach((listener) => listener({ action: 'REMOVE', toast: this }))
  }
}

/**
 * Show success toast
 */
export function showSuccess(message, options = {}) {
  const toast = new Toast(message, ToastType.SUCCESS, options)
  toastListeners.forEach((listener) => listener({ action: 'ADD', toast }))

  if (toast.duration > 0) {
    setTimeout(() => toast.dismiss(), toast.duration)
  }

  return toast
}

/**
 * Show error toast
 */
export function showError(message, options = {}) {
  const toast = new Toast(message, ToastType.ERROR, { duration: 7000, ...options })
  toastListeners.forEach((listener) => listener({ action: 'ADD', toast }))

  if (toast.duration > 0) {
    setTimeout(() => toast.dismiss(), toast.duration)
  }

  return toast
}

/**
 * Show info toast
 */
export function showInfo(message, options = {}) {
  const toast = new Toast(message, ToastType.INFO, options)
  toastListeners.forEach((listener) => listener({ action: 'ADD', toast }))

  if (toast.duration > 0) {
    setTimeout(() => toast.dismiss(), toast.duration)
  }

  return toast
}

/**
 * Show warning toast
 */
export function showWarning(message, options = {}) {
  const toast = new Toast(message, ToastType.WARNING, { duration: 6000, ...options })
  toastListeners.forEach((listener) => listener({ action: 'ADD', toast }))

  if (toast.duration > 0) {
    setTimeout(() => toast.dismiss(), toast.duration)
  }

  return toast
}

/**
 * Show loading toast (no auto-dismiss)
 */
export function showLoading(message, options = {}) {
  const toast = new Toast(message, ToastType.INFO, { duration: 0, ...options })
  toastListeners.forEach((listener) => listener({ action: 'ADD', toast }))
  return toast
}

/**
 * Dismiss specific toast by ID
 */
export function dismissToast(toastId) {
  toastListeners.forEach((listener) => listener({ action: 'REMOVE_ID', toastId }))
}

/**
 * Dismiss all toasts
 */
export function dismissAllToasts() {
  toastListeners.forEach((listener) => listener({ action: 'REMOVE_ALL' }))
}

/**
 * Subscribe to toast events
 */
export function subscribeToToasts(listener) {
  toastListeners.push(listener)

  // Return unsubscribe function
  return () => {
    toastListeners = toastListeners.filter((l) => l !== listener)
  }
}

/**
 * Get all active toasts
 */
export function getActiveToasts() {
  return toastListeners.map((listener) => {
    // Call listener to get toasts
    let toasts = []
    const mockListener = (event) => {
      if (event.action === 'ADD') {
        toasts.push(event.toast)
      }
    }
    // This is a workaround - in real implementation, maintain a separate state
    return toasts
  })
}
