/**
 * Retry Service
 * Implements exponential backoff for failed requests
 */

export class RetryService {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3
    this.initialDelay = options.initialDelay || 1000 // 1 second
    this.maxDelay = options.maxDelay || 30000 // 30 seconds
    this.backoffMultiplier = options.backoffMultiplier || 2
    this.jitterFactor = options.jitterFactor || 0.1 // 10% jitter
    this.isRetryable = options.isRetryable || this.defaultIsRetryable
  }

  /**
   * Default retry decision logic
   */
  defaultIsRetryable(error, attempt) {
    // Retry on network errors
    if (error.message === 'Network error' || error.name === 'TypeError') {
      return true
    }

    // Retry on timeout
    if (error.message === 'Timeout' || error.code === 'ECONNABORTED') {
      return true
    }

    // Retry on 5xx server errors
    if (error.status >= 500) {
      return true
    }

    // Retry on 429 (rate limit)
    if (error.status === 429) {
      return true
    }

    // Retry on 503 (service unavailable)
    if (error.status === 503) {
      return true
    }

    return false
  }

  /**
   * Calculate delay with exponential backoff
   */
  calculateDelay(attempt) {
    const exponentialDelay = this.initialDelay * Math.pow(this.backoffMultiplier, attempt)
    const delay = Math.min(exponentialDelay, this.maxDelay)

    // Add jitter to prevent thundering herd
    const jitter = delay * this.jitterFactor * Math.random()

    return Math.floor(delay + jitter)
  }

  /**
   * Execute function with retry logic
   */
  async execute(fn, context = {}) {
    let lastError

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error

        // Check if error is retryable
        if (!this.isRetryable(error, attempt)) {
          throw error
        }

        // Don't delay after last attempt
        if (attempt < this.maxRetries) {
          const delay = this.calculateDelay(attempt)
          console.warn(
            `Retrying request (attempt ${attempt + 1}/${this.maxRetries}) after ${delay}ms`,
            context,
          )

          await this.sleep(delay)
        }
      }
    }

    throw lastError
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Execute fetch with retry
   */
  async fetchWithRetry(url, options = {}) {
    return this.execute(async () => {
      const response = await fetch(url, options)

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`)
        error.status = response.status
        error.response = response

        throw error
      }

      return response
    })
  }

  /**
   * Execute promise-based operation with retry
   */
  async executePromise(promise, context = {}) {
    return this.execute(() => promise, context)
  }

  /**
   * Get retry info for UI feedback
   */
  getRetryInfo(attempt, error) {
    return {
      attempt,
      maxRetries: this.maxRetries,
      willRetry: attempt < this.maxRetries && this.isRetryable(error, attempt),
      nextDelay: attempt < this.maxRetries ? this.calculateDelay(attempt) : null,
      message: `Attempt ${attempt + 1} of ${this.maxRetries + 1}`,
    }
  }
}

// Create singleton instance
let instance = null

/**
 * Get or create RetryService instance
 */
export function getRetryService(options = {}) {
  if (!instance) {
    instance = new RetryService(options)
  }
  return instance
}

/**
 * Retry a fetch request
 */
export async function retryFetch(url, options = {}, retryOptions = {}) {
  const retryService = getRetryService(retryOptions)
  return retryService.fetchWithRetry(url, options)
}

/**
 * Retry an async function
 */
export async function retryAsync(fn, retryOptions = {}) {
  const retryService = getRetryService(retryOptions)
  return retryService.execute(fn)
}
