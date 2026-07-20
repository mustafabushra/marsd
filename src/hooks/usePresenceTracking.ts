import { useEffect, useState, useCallback, useRef } from 'react'
import { WebSocketClient } from '../services/websocketClient'

/**
 * User presence information
 */
interface UserPresence {
  userId: string
  userEmail: string
  firstName?: string
  isOnline: boolean
  timestamp: Date
}

/**
 * Hook options
 */
interface UsePresenceTrackingOptions {
  token?: string
  autoConnect?: boolean
  onUserOnline?: (user: UserPresence) => void
  onUserOffline?: (user: UserPresence) => void
  pollInterval?: number
  debug?: boolean
}

/**
 * Hook state
 */
interface UsePresenceTrackingState {
  onlineUsers: UserPresence[]
  isConnected: boolean
  error: Error | null
  getOnlineUsers: () => void
}

/**
 * React hook for presence tracking via WebSocket
 *
 * Tracks which users are currently online in the tenant
 *
 * Usage:
 * ```tsx
 * const { onlineUsers, isConnected } = usePresenceTracking({
 *   token: authToken,
 *   onUserOnline: (user) => console.log(`${user.userEmail} is online`),
 * })
 *
 * return (
 *   <div>
 *     <h3>Online Users ({onlineUsers.length})</h3>
 *     {onlineUsers.map((user) => (
 *       <div key={user.userId}>
 *         <span className="online-indicator">●</span>
 *         {user.userEmail}
 *       </div>
 *     ))}
 *   </div>
 * )
 * ```
 */
export function usePresenceTracking(
  options: UsePresenceTrackingOptions = {},
): UsePresenceTrackingState {
  const {
    token,
    autoConnect = true,
    onUserOnline,
    onUserOffline,
    pollInterval = 0,
    debug = false,
  } = options

  const wsRef = useRef<WebSocketClient | null>(null)
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<UserPresence[]>([])
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

        // Listen for online users list
        client.on('presence:online-users', (data) => {
          setOnlineUsers(
            (data.users || []).map((user: any) => ({
              ...user,
              timestamp: new Date(data.timestamp),
            })),
          )
        })

        // Listen for user coming online
        client.on('presence:user-online', (data: UserPresence) => {
          setOnlineUsers((prev) => {
            const exists = prev.some((u) => u.userId === data.userId)
            if (exists) {
              return prev.map((u) =>
                u.userId === data.userId ? { ...u, isOnline: true } : u,
              )
            }
            return [...prev, { ...data, isOnline: true }]
          })
          onUserOnline?.(data)
        })

        // Listen for user going offline
        client.on('presence:user-offline', (data: UserPresence) => {
          setOnlineUsers((prev) =>
            prev.map((u) =>
              u.userId === data.userId ? { ...u, isOnline: false } : u,
            ),
          )
          onUserOffline?.(data)
        })

        // Listen for presence errors
        client.on('presence:error', (data) => {
          const err = new Error(data.error)
          setError(err)
        })

        // Connect
        await client.connect()

        // Initial fetch
        client.send('presence:get-online-users', {})

        // Poll for updates if interval is set
        if (pollInterval > 0) {
          const poll = () => {
            if (client.isConnected()) {
              client.send('presence:get-online-users', {})
            }
            pollTimeoutRef.current = setTimeout(poll, pollInterval)
          }
          pollTimeoutRef.current = setTimeout(poll, pollInterval)
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)
      }
    }

    connect()

    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.disconnect()
      }
    }
  }, [token, autoConnect, pollInterval, debug, onUserOnline, onUserOffline])

  // Manually get online users
  const getOnlineUsers = useCallback(() => {
    if (wsRef.current?.isConnected()) {
      wsRef.current.send('presence:get-online-users', {})
    }
  }, [])

  return {
    onlineUsers,
    isConnected,
    error,
    getOnlineUsers,
  }
}
