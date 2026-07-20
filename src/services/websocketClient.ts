/**
 * WebSocket Client Service for Marsad
 *
 * Provides:
 * - Real-time connection management
 * - Auto-reconnection with exponential backoff
 * - Event subscription/unsubscription
 * - JWT token handling
 * - Connection state tracking
 *
 * Uses native WebSocket API (no Socket.io client needed on frontend for basic WebSocket)
 * or can be extended to use Socket.io client
 */

type ConnectionState = 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'error'

interface WebSocketMessage {
  event: string
  data?: any
  timestamp?: Date
}

interface ReconnectConfig {
  maxRetries: number
  initialDelay: number
  maxDelay: number
  backoffMultiplier: number
}

interface WebSocketClientConfig {
  url: string
  token: string
  reconnect?: ReconnectConfig
  debug?: boolean
}

class WebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private token: string
  private state: ConnectionState = 'disconnected'
  private listeners = new Map<string, Set<(data: any) => void>>()
  private messageQueue: WebSocketMessage[] = []

  // Reconnection config
  private reconnectConfig: ReconnectConfig
  private reconnectAttempts = 0
  private reconnectTimeout: NodeJS.Timeout | null = null

  private debug: boolean
  private stateListeners = new Set<(state: ConnectionState) => void>()

  constructor(config: WebSocketClientConfig) {
    this.url = config.url
    this.token = config.token
    this.debug = config.debug ?? false
    this.reconnectConfig = {
      maxRetries: config.reconnect?.maxRetries ?? 10,
      initialDelay: config.reconnect?.initialDelay ?? 1000,
      maxDelay: config.reconnect?.maxDelay ?? 30000,
      backoffMultiplier: config.reconnect?.backoffMultiplier ?? 2,
    }

    this.log('WebSocketClient initialized')
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.setState('connecting')

        // Use Socket.io compatible endpoint
        const wsUrl = `${this.url}?token=${encodeURIComponent(this.token)}`

        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          this.log('WebSocket connected')
          this.setState('connected')
          this.reconnectAttempts = 0
          this.flushMessageQueue()
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (error) {
            this.log('Failed to parse WebSocket message', error)
          }
        }

        this.ws.onerror = (error) => {
          this.log('WebSocket error', error)
          this.setState('error')
          reject(error)
        }

        this.ws.onclose = () => {
          this.log('WebSocket disconnected')
          this.setState('disconnected')
          this.attemptReconnect()
        }
      } catch (error) {
        this.setState('error')
        reject(error)
      }
    })
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    this.setState('disconnecting')

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.setState('disconnected')
  }

  /**
   * Send message to server
   */
  send(event: string, data?: any): void {
    const message: WebSocketMessage = {
      event,
      data,
      timestamp: new Date(),
    }

    if (this.state === 'connected' && this.ws) {
      try {
        this.ws.send(JSON.stringify(message))
      } catch (error) {
        this.log('Failed to send message', error)
        this.messageQueue.push(message)
      }
    } else {
      // Queue message if not connected
      this.messageQueue.push(message)
    }
  }

  /**
   * Subscribe to event
   */
  on(event: string, callback: (data: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
    this.log(`Subscribed to event: ${event}`)
  }

  /**
   * Unsubscribe from event
   */
  off(event: string, callback: (data: any) => void): void {
    this.listeners.get(event)?.delete(callback)
  }

  /**
   * Subscribe to connection state changes
   */
  onStateChange(callback: (state: ConnectionState) => void): void {
    this.stateListeners.add(callback)
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'connected'
  }

  /**
   * Update JWT token (for token refresh)
   */
  updateToken(token: string): void {
    this.token = token
    // If already connected, could re-authenticate here if needed
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private handleMessage(message: WebSocketMessage): void {
    this.log(`Received event: ${message.event}`, message.data)

    const callbacks = this.listeners.get(message.event)
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(message.data)
        } catch (error) {
          this.log(`Error in event handler for ${message.event}`, error)
        }
      })
    }
  }

  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      const oldState = this.state
      this.state = newState
      this.log(`State changed: ${oldState} -> ${newState}`)

      this.stateListeners.forEach((callback) => {
        try {
          callback(newState)
        } catch (error) {
          this.log('Error in state change handler', error)
        }
      })
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.state === 'disconnecting') {
      return
    }

    if (this.reconnectAttempts >= this.reconnectConfig.maxRetries) {
      this.log('Max reconnection attempts reached')
      this.setState('error')
      return
    }

    this.reconnectAttempts++

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.reconnectConfig.initialDelay *
        Math.pow(this.reconnectConfig.backoffMultiplier, this.reconnectAttempts - 1),
      this.reconnectConfig.maxDelay,
    )

    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.reconnectConfig.maxRetries})`)

    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch((error) => {
        this.log('Reconnection failed', error)
      })
    }, delay)
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.ws) {
      const message = this.messageQueue.shift()
      if (message) {
        try {
          this.ws.send(JSON.stringify(message))
        } catch (error) {
          this.log('Failed to flush queued message', error)
          this.messageQueue.unshift(message)
          break
        }
      }
    }
  }

  private log(message: string, data?: any): void {
    if (this.debug) {
      console.log(`[WebSocketClient] ${message}`, data || '')
    }
  }
}

// Export singleton instance factory
export function createWebSocketClient(config: WebSocketClientConfig): WebSocketClient {
  return new WebSocketClient(config)
}

export type { ConnectionState, WebSocketClientConfig, ReconnectConfig }
export { WebSocketClient }
