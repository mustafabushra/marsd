import React from 'react'
import { useNotifications } from './useNotifications'
import NotificationItem from './NotificationItem'
import Button from '../common/Button'
import { Link } from 'react-router-dom'

export default function NotificationDropdown({ onClose }) {
  const { notifications, unreadCount, loading, error, markAsRead } = useNotifications()

  const handleMarkAllAsRead = async () => {
    if (unreadCount > 0) {
      await markAsRead([], true)
    }
  }

  if (loading && notifications.length === 0) {
    return (
      <div
        style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          background: '#fff',
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          width: '360px',
          maxHeight: '400px',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: '8px',
        }}
      >
        <p style={{ color: '#6B7280', fontSize: '14px' }}>جاري التحميل...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          background: '#fff',
          border: '1px solid #FCA5A5',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          width: '360px',
          maxHeight: '400px',
          zIndex: 1000,
          padding: '16px',
          marginTop: '8px',
        }}
      >
        <p style={{ color: '#DC2626', fontSize: '14px', margin: 0 }}>
          حدث خطأ في تحميل الإشعارات
        </p>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        width: '360px',
        maxHeight: '500px',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        marginTop: '8px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #E5E7EB',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: '600',
            color: '#1F2937',
          }}
        >
          الإشعارات ({notifications.length})
        </h3>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            style={{
              background: 'none',
              border: 'none',
              color: '#3B82F6',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '500',
              textDecoration: 'underline',
            }}
          >
            وضع علامة الكل كمقروء
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          maxHeight: '350px',
        }}
      >
        {notifications.length === 0 ? (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: '#6B7280',
              fontSize: '14px',
            }}
          >
            لا توجد إشعارات حالياً
          </div>
        ) : (
          notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onClose={onClose}
            />
          ))
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid #E5E7EB',
          }}
        >
          <Link
            to="/notifications"
            style={{
              display: 'block',
              textAlign: 'center',
              color: '#3B82F6',
              fontSize: '13px',
              fontWeight: '500',
              textDecoration: 'none',
              padding: '8px',
            }}
            onClick={onClose}
          >
            عرض جميع الإشعارات
          </Link>
        </div>
      )}
    </div>
  )
}
