/**
 * Toast Container Component
 * Displays toast notifications from the toast service
 */

import React, { useState, useEffect } from 'react'
import { subscribeToToasts, ToastPosition, ToastType } from './toast-service'

/**
 * Individual Toast Component
 */
function Toast({ toast, onDismiss }) {
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (toast.duration > 0) {
      const timer = setTimeout(() => {
        setIsExiting(true)
        setTimeout(onDismiss, 300)
      }, toast.duration)

      return () => clearTimeout(timer)
    }
  }, [toast.duration, onDismiss])

  const handleDismiss = () => {
    setIsExiting(true)
    setTimeout(onDismiss, 300)
  }

  const toastStyles = getToastStyles(toast.type, isExiting)

  return (
    <div style={toastStyles.container}>
      <div style={toastStyles.content}>
        <div style={toastStyles.iconContainer}>{getToastIcon(toast.type)}</div>

        <div style={toastStyles.textContainer}>
          {toast.title && <div style={toastStyles.title}>{toast.title}</div>}
          <div style={toastStyles.message}>{toast.message}</div>
        </div>

        {toast.action && (
          <button style={toastStyles.actionButton} onClick={toast.action.onClick}>
            {toast.action.label}
          </button>
        )}

        {toast.dismissible && (
          <button style={toastStyles.closeButton} onClick={handleDismiss} aria-label="Dismiss">
            ×
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Toast Container Component
 */
export function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const unsubscribe = subscribeToToasts((event) => {
      setToasts((prevToasts) => {
        switch (event.action) {
          case 'ADD':
            return [...prevToasts, event.toast]
          case 'REMOVE':
            return prevToasts.filter((t) => t.id !== event.toast.id)
          case 'REMOVE_ID':
            return prevToasts.filter((t) => t.id !== event.toastId)
          case 'REMOVE_ALL':
            return []
          default:
            return prevToasts
        }
      })
    })

    return () => unsubscribe()
  }, [])

  if (toasts.length === 0) {
    return null
  }

  // Group toasts by position
  const positions = Object.values(ToastPosition)
  const toastsByPosition = {}

  positions.forEach((pos) => {
    toastsByPosition[pos] = toasts.filter((t) => t.position === pos)
  })

  return (
    <div style={styles.container}>
      {positions.map((position) => (
        <div key={position} style={getPositionStyles(position)}>
          {toastsByPosition[position].map((toast) => (
            <Toast
              key={toast.id}
              toast={toast}
              onDismiss={() => {
                setToasts((prev) => prev.filter((t) => t.id !== toast.id))
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Get toast icon based on type
 */
function getToastIcon(type) {
  const icons = {
    [ToastType.SUCCESS]: '✓',
    [ToastType.ERROR]: '✕',
    [ToastType.INFO]: 'ℹ',
    [ToastType.WARNING]: '⚠',
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '24px',
        height: '24px',
        fontSize: '16px',
        marginRight: '12px',
        flexShrink: 0,
      }}
    >
      {icons[type]}
    </div>
  )
}

/**
 * Get styles for different toast types
 */
function getToastStyles(type, isExiting) {
  const baseStyles = {
    container: {
      animation: isExiting ? 'toastExit 0.3s ease-out' : 'toastEnter 0.3s ease-out',
      marginBottom: '12px',
      borderRadius: '6px',
      overflow: 'hidden',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    },
    content: {
      display: 'flex',
      alignItems: 'flex-start',
      padding: '16px',
      gap: '12px',
    },
    iconContainer: {
      display: 'flex',
      alignItems: 'center',
      marginTop: '2px',
    },
    textContainer: {
      flex: 1,
    },
    title: {
      fontWeight: '600',
      fontSize: '14px',
      marginBottom: '4px',
    },
    message: {
      fontSize: '14px',
      lineHeight: '1.4',
    },
    actionButton: {
      padding: '4px 12px',
      fontSize: '12px',
      fontWeight: '600',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      marginLeft: '12px',
    },
    closeButton: {
      background: 'none',
      border: 'none',
      fontSize: '24px',
      cursor: 'pointer',
      padding: '0',
      width: '24px',
      height: '24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'inherit',
      opacity: 0.6,
      marginLeft: '8px',
    },
  }

  const typeStyles = {
    [ToastType.SUCCESS]: {
      backgroundColor: '#10b981',
      color: 'white',
    },
    [ToastType.ERROR]: {
      backgroundColor: '#ef4444',
      color: 'white',
    },
    [ToastType.INFO]: {
      backgroundColor: '#3b82f6',
      color: 'white',
    },
    [ToastType.WARNING]: {
      backgroundColor: '#f59e0b',
      color: 'white',
    },
  }

  const styleOverrides = typeStyles[type] || {}

  return {
    container: {
      ...baseStyles.container,
      ...styleOverrides,
    },
    content: baseStyles.content,
    iconContainer: baseStyles.iconContainer,
    textContainer: baseStyles.textContainer,
    title: baseStyles.title,
    message: baseStyles.message,
    actionButton: {
      ...baseStyles.actionButton,
      backgroundColor: type === ToastType.WARNING ? '#d97706' : 'rgba(255, 255, 255, 0.2)',
      color: 'white',
    },
    closeButton: {
      ...baseStyles.closeButton,
      color: 'inherit',
    },
  }
}

/**
 * Get styles for toast position
 */
function getPositionStyles(position) {
  const positions = {
    [ToastPosition.TOP_RIGHT]: {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: 9999,
    },
    [ToastPosition.TOP_LEFT]: {
      position: 'fixed',
      top: '20px',
      left: '20px',
      zIndex: 9999,
    },
    [ToastPosition.TOP_CENTER]: {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
    },
    [ToastPosition.BOTTOM_RIGHT]: {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 9999,
    },
    [ToastPosition.BOTTOM_LEFT]: {
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      zIndex: 9999,
    },
    [ToastPosition.BOTTOM_CENTER]: {
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
    },
  }

  return positions[position] || positions[ToastPosition.TOP_RIGHT]
}

const styles = {
  container: {
    pointerEvents: 'none',
    '--toast-enter': 'slideIn 0.3s ease-out',
    '--toast-exit': 'slideOut 0.3s ease-out',
  },
}

// Add CSS animations
const styleSheet = document.createElement('style')
styleSheet.textContent = `
  @keyframes toastEnter {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes toastExit {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(-20px);
    }
  }
`
if (typeof document !== 'undefined') {
  document.head.appendChild(styleSheet)
}

export default ToastContainer
