import { useEffect, useState, useCallback, useRef } from 'react'
import { WebSocketClient } from '../services/websocketClient'

/**
 * Hook options
 */
interface UseWebSocketOptions {
  token?: string
  autoConnect?: boolean
  debug?: boolean
  onError?: (error: Error) => void
}

/**
 * Hook state
 */
interface UseWebSocketState {
  isConnected: boolean
  error: Error | null
  send: (event: string, data?: any) => void
  on: (event: string, callback: (data: any) => void) => () => void
  off: (event: string, callback: (data: any) => void) => void
  disconnect: () => void
  reconnect: () => Promise<void>
}

/**
 * Low-level WebSocket hook
 *
 * Provides direct access to WebSocket connection for custom event handling
 *
 * Usage:
 * ```tsx
 * const { isConnected, send, on } = useWebSocket({ token: authToken })
 *
 * useEffect(() => {
 *   const unsubscribe = on('report:approved', (data) => {
 *     console.log('Report approved:', data)
 *   })
 *   return unsubscribe
 * }, [on])
 *
 * const handleBroadcast = () => {
 *   send('admin:request-update', { type: 'reports' })
 * }
 *
 * return <button onClick={handleBroadcast}>Request Update</button>
 * ```
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketState {
  const { token, autoConnect = true, debug = false, onError } = options

  const wsRef = useRef<WebSocketClient | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Get WebSocket URL
  const getWebSocketUrl = (): string => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = process.env.REACT_APP_API_URL || window.location.host
    return `${protocol}//${host}/realtime`
  }

  // Connect
  const connect = useCallback(async () => {
    if (!token) {
      return
    }

    try {
      const client = new (require('../services/websocketClient')).WebSocketClient({
        url: getWebSocketUrl(),
        token,
        debug,
      })

      wsRef.current = client

      client.onStateChange((state) => {
        setIsConnected(state === 'connected')
        if (state === 'error') {
          const err = new Error('WebSocket connection error')
          setError(err)
          onError?.(err)
        }
      })

      await client.connect()
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      onError?.(error)
    }
  }, [token, debug, onError])

  // Initialize on mount
  useEffect(() => {
    if (autoConnect) {
      connect()
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect()
      }
    }
  }, [autoConnect, connect])

  // Send message
  const send = useCallback((event: string, data?: any) => {
    if (wsRef.current) {
      wsRef.current.send(event, data)
    }
  }, [])

  // Subscribe to event
  const on = useCallback(
    (event: string, callback: (data: any) => void) => {
      if (wsRef.current) {
        wsRef.current.on(event, callback)
      }

      // Return unsubscribe function
      return () => {
        if (wsRef.current) {
          wsRef.current.off(event, callback)
        }
      }
    },
    [],
  )

  // Unsubscribe from event
  const off = useCallback((event: string, callback: (data: any) => void) => {
    if (wsRef.current) {
      wsRef.current.off(event, callback)
    }
  }, [])

  // Disconnect
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.disconnect()
    }
  }, [])

  // Reconnect
  const reconnect = useCallback(async () => {
    disconnect()
    await connect()
  }, [connect, disconnect])

  return {
    isConnected,
    error,
    send,
    on,
    off,
    disconnect,
    reconnect,
  }
}
