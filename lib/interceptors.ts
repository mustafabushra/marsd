// API Interceptors for Request/Response handling

import { ApiResponse } from '@/types'

/**
 * Request Interceptor
 * Adds authentication headers, logging, and other preprocessing
 */
export function requestInterceptor(config: RequestInit): RequestInit {
  // Add auth token if available
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null

  if (token) {
    config.headers = {
      ...config.headers,
      'Authorization': `Bearer ${token}`,
    }
  }

  // Add timestamp for tracking
  config.headers = {
    ...config.headers,
    'X-Request-ID': generateRequestId(),
  }

  // Log request in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[API Request]', {
      method: config.method,
      headers: config.headers,
      timestamp: new Date().toISOString(),
    })
  }

  return config
}

/**
 * Response Interceptor
 * Handles errors, logging, and post-processing
 */
export async function responseInterceptor<T>(
  response: Response
): Promise<ApiResponse<T>> {
  // Log response in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[API Response]', {
      status: response.status,
      statusText: response.statusText,
      timestamp: new Date().toISOString(),
    })
  }

  const data = await response.json()

  if (!response.ok) {
    // Handle specific error codes
    if (response.status === 401) {
      // Unauthorized - clear auth and redirect to login
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token')
        window.location.href = '/auth/login'
      }
    }

    if (response.status === 403) {
      // Forbidden - user doesn't have permission
      console.error('Forbidden access:', data)
    }

    if (response.status === 404) {
      // Not found
      console.error('Resource not found:', data)
    }

    if (response.status === 500) {
      // Server error
      console.error('Server error:', data)
    }

    return {
      success: false,
      error: {
        code: String(response.status),
        message: data.message || response.statusText,
      },
    }
  }

  return {
    success: true,
    data,
  }
}

/**
 * Error Handler
 * Centralized error handling
 */
export function handleError(error: any): string {
  if (error instanceof TypeError) {
    if (error.message.includes('Failed to fetch')) {
      return 'خطأ في الاتصال. تحقق من اتصال الإنترنت.'
    }
  }

  if (error instanceof SyntaxError) {
    return 'خطأ في معالجة البيانات.'
  }

  return error?.message || 'حدث خطأ غير متوقع.'
}

/**
 * Retry Logic
 * Retry failed requests with exponential backoff
 */
export async function retryRequest<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: Error | null = null

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      if (i < maxRetries - 1) {
        // Wait before retrying with exponential backoff
        await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, i)))
      }
    }
  }

  throw lastError
}

/**
 * Rate Limiting
 * Prevent too many requests
 */
class RateLimiter {
  private requests: number[] = []
  private maxRequests: number
  private windowMs: number

  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
  }

  isAllowed(): boolean {
    const now = Date.now()
    this.requests = this.requests.filter((time) => now - time < this.windowMs)

    if (this.requests.length < this.maxRequests) {
      this.requests.push(now)
      return true
    }

    return false
  }
}

export const apiRateLimiter = new RateLimiter(20, 60000) // 20 requests per minute

/**
 * Request ID Generator
 * For tracking and debugging
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Cache Manager
 * Simple cache for API responses
 */
class CacheManager {
  private cache = new Map<string, { data: any; timestamp: number }>()
  private cacheDuration = 5 * 60 * 1000 // 5 minutes default

  set(key: string, data: any, duration?: number) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    })
  }

  get(key: string): any | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    const duration = this.cacheDuration
    if (Date.now() - entry.timestamp > duration) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  clear(key?: string) {
    if (key) {
      this.cache.delete(key)
    } else {
      this.cache.clear()
    }
  }

  has(key: string): boolean {
    return this.get(key) !== null
  }
}

export const apiCache = new CacheManager()

/**
 * Middleware Chain
 * Compose multiple interceptors
 */
export function createInterceptorChain(
  ...interceptors: Array<(config: RequestInit) => RequestInit>
) {
  return (config: RequestInit): RequestInit => {
    return interceptors.reduce((acc, interceptor) => interceptor(acc), config)
  }
}
