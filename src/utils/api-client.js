/**
 * API Client with Error Handling
 * Handles requests, errors, retries, and logging
 */

import { getErrorLogger } from './error-logger'
import { getRetryService } from './retry-service'
import { showError, showSuccess, showWarning } from './toast-service'
import { ErrorCode, requiresReAuth, getUserFriendlyMessage, isRetryable } from './error-codes'

export class ApiClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.REACT_APP_API_URL || 'http://localhost:3000/api'
    this.timeout = options.timeout || 30000
    this.showErrors = options.showErrors ?? true
    this.showSuccess = options.showSuccess ?? true
    this.retryOptions = options.retryOptions || {}
    this.errorLogger = getErrorLogger()
    this.retryService = getRetryService(this.retryOptions)
    this.onUnauthorized = options.onUnauthorized // Callback for 401 errors
    this.defaultHeaders = options.defaultHeaders || {}
    this.requestInterceptors = []
    this.responseInterceptors = []
  }

  /**
   * Add request interceptor
   */
  addRequestInterceptor(interceptor) {
    this.requestInterceptors.push(interceptor)
    return () => {
      this.requestInterceptors = this.requestInterceptors.filter((i) => i !== interceptor)
    }
  }

  /**
   * Add response interceptor
   */
  addResponseInterceptor(interceptor) {
    this.responseInterceptors.push(interceptor)
    return () => {
      this.responseInterceptors = this.responseInterceptors.filter((i) => i !== interceptor)
    }
  }

  /**
   * Get auth token (can be overridden)
   */
  getAuthToken() {
    try {
      const token = localStorage.getItem('auth_token')
      return token
    } catch {
      return null
    }
  }

  /**
   * Set auth token
   */
  setAuthToken(token) {
    try {
      if (token) {
        localStorage.setItem('auth_token', token)
      } else {
        localStorage.removeItem('auth_token')
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Build full URL
   */
  buildUrl(endpoint) {
    if (endpoint.startsWith('http')) {
      return endpoint
    }

    return `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`
  }

  /**
   * Build request headers
   */
  buildHeaders(options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...options.headers,
    }

    const token = this.getAuthToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    return headers
  }

  /**
   * Execute request with retry logic
   */
  async request(method, endpoint, options = {}) {
    const url = this.buildUrl(endpoint)
    const headers = this.buildHeaders(options)

    const requestConfig = {
      method,
      headers,
      ...options,
    }

    // Apply request interceptors
    for (const interceptor of this.requestInterceptors) {
      await interceptor(requestConfig)
    }

    // Execute with retry
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => abortController.abort(), this.timeout)

    try {
      const response = await this.retryService.execute(async () => {
        const res = await fetch(url, {
          ...requestConfig,
          signal: abortController.signal,
        })

        return this.handleResponse(res, endpoint)
      })

      // Apply response interceptors
      let finalResponse = response
      for (const interceptor of this.responseInterceptors) {
        finalResponse = await interceptor(finalResponse)
      }

      return finalResponse
    } catch (error) {
      return this.handleError(error, endpoint, method)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Handle response
   */
  async handleResponse(response, endpoint) {
    let data

    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      data = await response.json()
    } else {
      data = await response.text()
    }

    if (!response.ok) {
      const error = new Error(data?.error?.message || `HTTP ${response.status}`)
      error.status = response.status
      error.statusCode = response.status
      error.errorCode = data?.error?.code
      error.details = data?.error?.details
      error.response = data

      throw error
    }

    return data
  }

  /**
   * Handle error
   */
  handleError(error, endpoint, method) {
    // Log error
    this.errorLogger.logApiError(error, {
      endpoint,
      method,
      action: 'API Request',
    })

    // Check if requires re-authentication
    if (requiresReAuth(error.errorCode)) {
      this.setAuthToken(null)

      if (this.onUnauthorized) {
        this.onUnauthorized(error)
      }
    }

    // Show error to user
    if (this.showErrors) {
      const message = getUserFriendlyMessage(error.errorCode, error.message)
      showError(message)
    }

    throw error
  }

  /**
   * GET request
   */
  get(endpoint, options = {}) {
    return this.request('GET', endpoint, options)
  }

  /**
   * POST request
   */
  post(endpoint, data = {}, options = {}) {
    return this.request('POST', endpoint, {
      ...options,
      body: JSON.stringify(data),
    })
  }

  /**
   * PUT request
   */
  put(endpoint, data = {}, options = {}) {
    return this.request('PUT', endpoint, {
      ...options,
      body: JSON.stringify(data),
    })
  }

  /**
   * PATCH request
   */
  patch(endpoint, data = {}, options = {}) {
    return this.request('PATCH', endpoint, {
      ...options,
      body: JSON.stringify(data),
    })
  }

  /**
   * DELETE request
   */
  delete(endpoint, options = {}) {
    return this.request('DELETE', endpoint, options)
  }

  /**
   * Upload file
   */
  async uploadFile(endpoint, file, additionalData = {}, onProgress = null) {
    const formData = new FormData()
    formData.append('file', file)

    Object.entries(additionalData).forEach(([key, value]) => {
      formData.append(key, value)
    })

    const url = this.buildUrl(endpoint)
    const headers = this.buildHeaders()
    delete headers['Content-Type'] // Let browser set it with boundary

    const xhr = new XMLHttpRequest()

    return new Promise((resolve, reject) => {
      if (onProgress) {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100
            onProgress(percentComplete)
          }
        })
      }

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText)
            resolve(response)
          } catch {
            resolve(xhr.responseText)
          }
        } else {
          const error = new Error('Upload failed')
          error.status = xhr.status
          reject(error)
        }
      })

      xhr.addEventListener('error', () => {
        reject(new Error('Upload error'))
      })

      xhr.open('POST', url)
      Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value)
      })

      xhr.send(formData)
    })
  }
}

// Create singleton instance
let instance = null

/**
 * Get or create ApiClient instance
 */
export function getApiClient(options = {}) {
  if (!instance) {
    instance = new ApiClient(options)
  }
  return instance
}

/**
 * Initialize API client
 */
export function initializeApiClient(options = {}) {
  const client = getApiClient(options)

  // Add interceptor to attach request ID
  client.addRequestInterceptor((config) => {
    const requestId = config.headers?.['x-request-id'] || generateRequestId()
    config.headers['x-request-id'] = requestId
  })

  return client
}

/**
 * Generate request ID
 */
function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}
