/**
 * Error Logger Service (Frontend)
 * Captures, formats, and sends error logs to backend or local storage
 */

export class ErrorLogger {
  constructor(options = {}) {
    this.apiEndpoint = options.apiEndpoint || '/api/logs'
    this.enableLocalStorage = options.enableLocalStorage ?? true
    this.localStorageKey = options.localStorageKey || 'marsad_error_logs'
    this.maxLocalLogs = options.maxLocalLogs || 100
    this.isDevelopment = options.isDevelopment ?? process.env.NODE_ENV === 'development'
    this.enableConsole = options.enableConsole ?? true
    this.batchSize = options.batchSize || 10
    this.batchTimeout = options.batchTimeout || 30000 // 30 seconds
    this.logs = []
    this.batchTimer = null
  }

  /**
   * Format error object
   */
  formatError(error, context = {}) {
    const formatted = {
      timestamp: new Date().toISOString(),
      type: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      context: {
        userId: context.userId,
        requestId: context.requestId,
        page: context.page,
        component: context.component,
        action: context.action,
        ...context,
      },
    }

    // Add custom error properties
    if (error.errorCode) {
      formatted.errorCode = error.errorCode
    }
    if (error.details) {
      formatted.details = error.details
    }
    if (error.statusCode) {
      formatted.statusCode = error.statusCode
    }

    return formatted
  }

  /**
   * Log error
   */
  logError(error, context = {}) {
    const formattedError = this.formatError(error, context)

    // Log to console in development
    if (this.isDevelopment && this.enableConsole) {
      console.error('[ERROR LOG]', formattedError)
    }

    // Add to batch
    this.logs.push(formattedError)

    // Store locally
    if (this.enableLocalStorage) {
      this.storeLocally(formattedError)
    }

    // Check if we should flush batch
    if (this.logs.length >= this.batchSize) {
      this.flushBatch()
    } else {
      // Set timeout for batch flush
      if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => this.flushBatch(), this.batchTimeout)
      }
    }

    return formattedError
  }

  /**
   * Store error locally in localStorage
   */
  storeLocally(error) {
    try {
      const stored = JSON.parse(localStorage.getItem(this.localStorageKey) || '[]')
      stored.push(error)

      // Keep only recent logs
      if (stored.length > this.maxLocalLogs) {
        stored.splice(0, stored.length - this.maxLocalLogs)
      }

      localStorage.setItem(this.localStorageKey, JSON.stringify(stored))
    } catch (err) {
      if (this.enableConsole) {
        console.warn('Failed to store error log locally', err)
      }
    }
  }

  /**
   * Flush batch of errors to backend
   */
  async flushBatch() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }

    if (this.logs.length === 0) {
      return
    }

    const logsToSend = [...this.logs]
    this.logs = []

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ errors: logsToSend }),
      })

      if (!response.ok) {
        // Re-add logs to retry later
        this.logs.unshift(...logsToSend)
      }
    } catch (err) {
      if (this.enableConsole) {
        console.warn('Failed to send error logs to server', err)
      }

      // Re-add logs to retry later
      this.logs.unshift(...logsToSend)

      // Store failed logs locally
      logsToSend.forEach((log) => this.storeLocally(log))
    }
  }

  /**
   * Get local error logs
   */
  getLocalLogs() {
    try {
      return JSON.parse(localStorage.getItem(this.localStorageKey) || '[]')
    } catch {
      return []
    }
  }

  /**
   * Clear local error logs
   */
  clearLocalLogs() {
    try {
      localStorage.removeItem(this.localStorageKey)
    } catch {
      // Ignore
    }
  }

  /**
   * Log API error
   */
  logApiError(error, context = {}) {
    const apiError = {
      ...error,
      type: 'API_ERROR',
      statusCode: error.status || error.statusCode,
      errorCode: error.errorCode,
      details: error.details,
    }

    return this.logError(apiError, {
      ...context,
      errorType: 'API',
    })
  }

  /**
   * Log validation error
   */
  logValidationError(errors, context = {}) {
    const validationError = new Error('Validation failed')
    validationError.validationErrors = errors
    validationError.type = 'VALIDATION_ERROR'

    return this.logError(validationError, {
      ...context,
      errorType: 'VALIDATION',
      details: errors,
    })
  }

  /**
   * Log network error
   */
  logNetworkError(error, context = {}) {
    const networkError = new Error(error.message || 'Network error')
    networkError.type = 'NETWORK_ERROR'

    return this.logError(networkError, {
      ...context,
      errorType: 'NETWORK',
    })
  }

  /**
   * Set up global error handler
   */
  setupGlobalErrorHandler() {
    // Handle uncaught errors
    window.addEventListener('error', (event) => {
      this.logError(event.error || event.message, {
        component: 'Global',
        action: 'Uncaught Error',
      })
    })

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.logError(event.reason || 'Unhandled Promise Rejection', {
        component: 'Global',
        action: 'Unhandled Promise Rejection',
      })
    })
  }

  /**
   * Cleanup (e.g., on app unmount)
   */
  destroy() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
    }

    // Flush any remaining logs
    this.flushBatch()
  }
}

// Create singleton instance
let instance = null

/**
 * Get or create ErrorLogger instance
 */
export function getErrorLogger(options = {}) {
  if (!instance) {
    instance = new ErrorLogger(options)
  }
  return instance
}

/**
 * Initialize error logger
 */
export function initializeErrorLogger(options = {}) {
  const logger = getErrorLogger(options)
  logger.setupGlobalErrorHandler()
  return logger
}
