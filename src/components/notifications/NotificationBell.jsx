import React, { useState, useRef, useEffect } from 'react'
import { useNotifications } from './useNotifications'
import NotificationDropdown from './NotificationDropdown'
import { Bell } from 'lucide-react'

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)
  const { unreadCount, fetchNotifications } = useNotifications()

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleBellClick = () => {
    setIsOpen(!isOpen)
    if (!isOpen) {
      fetchNotifications('all', 10, 0)
    }
  }

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={handleBellClick}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="الإشعارات"
      >
        <Bell size={24} color="#1E2A52" />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              background: '#DC2626',
              color: '#fff',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && <NotificationDropdown onClose={() => setIsOpen(false)} />}
    </div>
  )
}
