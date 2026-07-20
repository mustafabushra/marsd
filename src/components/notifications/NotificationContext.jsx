import React, { createContext, useCallback, useReducer, useEffect } from 'react'

export const NotificationContext = createContext()

const initialState = {
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,
  filter: 'all', // all | unread | report_approved | score_changed | request_received | watchlist_alert
}

const notificationReducer = (state, action) => {
  switch (action.type) {
    case 'SET_NOTIFICATIONS':
      return {
        ...state,
        notifications: action.payload.notifications,
        unreadCount: action.payload.unreadCount || state.unreadCount,
      }
    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [action.payload, ...state.notifications],
        unreadCount: state.unreadCount + 1,
      }
    case 'MARK_AS_READ':
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          action.payload.includes(n.id) ? { ...n, readAt: new Date() } : n
        ),
        unreadCount: Math.max(
          0,
          state.unreadCount - action.payload.filter((id) =>
            state.notifications.find((n) => n.id === id && !n.readAt)
          ).length
        ),
      }
    case 'DELETE_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter((n) => !action.payload.includes(n.id)),
      }
    case 'SET_FILTER':
      return {
        ...state,
        filter: action.payload,
      }
    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload,
      }
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
      }
    default:
      return state
  }
}

export const NotificationProvider = ({ children }) => {
  const [state, dispatch] = useReducer(notificationReducer, initialState)

  // Fetch unread count on mount
  useEffect(() => {
    fetchUnreadCount()
    // Set up polling for new notifications
    const interval = setInterval(fetchNotifications, 30000) // Poll every 30 seconds
    return () => clearInterval(interval)
  }, [])

  // Set up WebSocket for real-time notifications (if available)
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/notifications/ws`

    try {
      const ws = new WebSocket(wsUrl, [token])

      ws.onmessage = (event) => {
        const notification = JSON.parse(event.data)
        dispatch({
          type: 'ADD_NOTIFICATION',
          payload: notification,
        })
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

      return () => {
        ws.close()
      }
    } catch (error) {
      console.error('WebSocket connection failed:', error)
    }
  }, [])

  const fetchNotifications = useCallback(
    async (type = 'all', limit = 20, offset = 0) => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true })
        const token = localStorage.getItem('token')

        const queryParams = new URLSearchParams({
          limit,
          offset,
        })

        if (type !== 'all') {
          queryParams.append('type', type)
        }

        const response = await fetch(
          `/api/notifications?${queryParams}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        )

        if (!response.ok) {
          throw new Error('Failed to fetch notifications')
        }

        const data = await response.json()
        dispatch({
          type: 'SET_NOTIFICATIONS',
          payload: {
            notifications: data.notifications,
            unreadCount: data.unreadCount,
          },
        })

        dispatch({ type: 'SET_ERROR', payload: null })
      } catch (error) {
        dispatch({ type: 'SET_ERROR', payload: error.message })
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false })
      }
    },
    []
  )

  const fetchUnreadCount = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/notifications/unread-count', {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch unread count')
      }

      const data = await response.json()
      dispatch({
        type: 'SET_NOTIFICATIONS',
        payload: {
          notifications: state.notifications,
          unreadCount: data.unreadCount,
        },
      })
    } catch (error) {
      console.error('Failed to fetch unread count:', error)
    }
  }, [state.notifications])

  const markAsRead = useCallback(async (notificationIds, markAll = false) => {
    try {
      const token = localStorage.getItem('token')

      const response = await fetch('/api/notifications/mark-as-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          notificationIds,
          markAll,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to mark notifications as read')
      }

      dispatch({
        type: 'MARK_AS_READ',
        payload: notificationIds,
      })

      dispatch({ type: 'SET_ERROR', payload: null })
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error.message })
    }
  }, [])

  const deleteNotifications = useCallback(async (notificationIds) => {
    try {
      const token = localStorage.getItem('token')

      const response = await fetch('/api/notifications/delete-multiple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          notificationIds,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to delete notifications')
      }

      dispatch({
        type: 'DELETE_NOTIFICATION',
        payload: notificationIds,
      })

      dispatch({ type: 'SET_ERROR', payload: null })
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error.message })
    }
  }, [])

  const setFilter = useCallback((filter) => {
    dispatch({
      type: 'SET_FILTER',
      payload: filter,
    })
    fetchNotifications(filter === 'all' ? 'all' : filter)
  }, [fetchNotifications])

  const value = {
    ...state,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    deleteNotifications,
    setFilter,
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}
