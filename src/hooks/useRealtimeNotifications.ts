import { useEffect, useState, useCallback, useRef } from 'react'
import { WebSocketClient } from '../services/websocketClient'

/**
 * Notification object
 */
interface Notification {
  id?: string
  type: string
  title: string
  message: string
  payload?: any
  urgency?: 'low' | 'medium' | 'high'
  receivedAt?: Date
}

/**
 * Hook options
 */
interface UseRealtimeNotificationsOptions {
  token?: string
  autoConnect?: boolean
  onNotification?: (notification: Notification) => void
  onError?: (error: Error) => void
  debug?: boolean
}

/**
 * Hook state
 */
interface UseRealtimeNotificationsState {
  notifications: Notification[]
  isConnected: boolean
  error: Error | null
  addNotification: (notification: Notification) => void
  clearNotifications: () => void
  clearNotification: (index: number) => void
  subscribe: (types: string[]) => void
  unsubscribe: (subscriptionId: string) => void
}

/**
 * React hook for real-time notifications via WebSocket
 *
 * Usage:
 * ```tsx
 * const { notifications, isConnected } = useRealtimeNotifications({
 *   token: authToken,
 *   onNotification: (notif) => console.log('New notification:', notif),
 * })
 *
 * return (
 *   <div>
 *     {isConnected ? 'Connected' : 'Disconnected'}
 *     {notifications.map((notif) => (
 *       <div key={notif.id}>{notif.message}</div>
 *     ))}
 *   </div>
 * )
 * ```
 */
export function useRealtimeNotifications(
  options: UseRealtimeNotificationsOptions = {},
): UseRealtimeNotificationsState {
  const {
    token,
    autoConnect = true,
    onNotification,
    onError,
    debug = false,
  } = options

  const wsRef = useRef<WebSocketClient | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Get WebSocket URL
  const getWebSocketUrl = (): string => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = process.env.REACT_APP_API_URL || window.location.host
    return `${protocol}//${host}/realtime`
  }

  // Initialize WebSocket
  useEffect(() => {
    if (!autoConnect || !token) {
      return
    }

    const connect = async () => {
      try {
        const client = new (require('../services/websocketClient')).WebSocketClient({
          url: getWebSocketUrl(),
          token,
          debug,
        })

        wsRef.current = client

        // Listen for connection state changes
        client.onStateChange((state) => {
          setIsConnected(state === 'connected')
          if (state === 'error') {
            setError(new Error('WebSocket connection failed'))
          }
        })

        // Listen for notifications
        client.on('notification:received', (notification: Notification) => {
          setNotifications((prev) => [notification, ...prev])
          onNotification?.(notification)
        })

        // Listen for subscription confirmation
        client.on('notifications:subscribed', (data) => {
          console.log('Subscribed to notifications:', data)
        })

        // Listen for errors
        client.on('notifications:subscribe-error', (data) => {
          const err = new Error(data.error)
          setError(err)
          onError?.(err)
        })

        // Connect
        await client.connect()

        // Subscribe to all notification types
        client.send('notifications:subscribe', {
          types: ['all'],
        })
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)
        onError?.(error)
      }
    }

    connect()

    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect()
      }
    }
  }, [token, autoConnect, debug, onNotification, onError])

  // Add notification
  const addNotification = useCallback((notification: Notification) => {
    setNotifications((prev) => [notification, ...prev])
  }, [])

  // Clear all notifications
  const clearNotifications = useCallback(() => {
    setNotifications([])
  }, [])

  // Clear single notification
  const clearNotification = useCallback((index: number) => {
    setNotifications((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // Subscribe to notification types
  const subscribe = useCallback((types: string[]) => {
    if (wsRef.current?.isConnected()) {
      wsRef.current.send('notifications:subscribe', { types })
    }
  }, [])

  // Unsubscribe from notifications
  const unsubscribe = useCallback((subscriptionId: string) => {
    if (wsRef.current?.isConnected()) {
      wsRef.current.send('notifications:unsubscribe', { subscriptionId })
    }
  }, [])

  return {
    notifications,
    isConnected,
    error,
    addNotification,
    clearNotifications,
    clearNotification,
    subscribe,
    unsubscribe,
  }
}
