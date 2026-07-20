import React from 'react'
import { X, CheckCircle } from 'lucide-react'
import { useNotifications } from './useNotifications'

export default function NotificationItem({ notification, onClose }) {
  const { markAsRead, deleteNotifications } = useNotifications()

  const getNotificationIcon = (type) => {
    const icons = {
      report_approved: '✓',
      score_changed: '📊',
      request_received: '💼',
      watchlist_alert: '⚠️',
    }
    return icons[type] || '📬'
  }

  const getNotificationTitle = (type) => {
    const titles = {
      report_approved: 'تم قبول التقرير',
      score_changed: 'تحديث مؤشر الثقة',
      request_received: 'طلب أعمال جديد',
      watchlist_alert: 'تنبيه قائمة المراقبة',
    }
    return titles[type] || 'إشعار جديد'
  }

  const getNotificationColor = (type) => {
    const colors = {
      report_approved: '#10B981',
      score_changed: '#F59E0B',
      request_received: '#3B82F6',
      watchlist_alert: '#EF4444',
    }
    return colors[type] || '#6B7280'
  }

  const handleMarkAsRead = async () => {
    if (!notification.readAt) {
      await markAsRead([notification.id])
    }
  }

  const handleDelete = async () => {
    await deleteNotifications([notification.id])
  }

  const formatDate = (date) => {
    const now = new Date()
    const notificationDate = new Date(date)
    const diffMinutes = Math.floor((now - notificationDate) / 60000)

    if (diffMinutes < 1) return 'الآن'
    if (diffMinutes < 60) return `قبل ${diffMinutes} دقيقة`

    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `قبل ${diffHours} ساعة`

    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `قبل ${diffDays} يوم`

    return notificationDate.toLocaleDateString('ar-SA')
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        padding: '12px',
        borderBottom: '1px solid #E5E7EB',
        backgroundColor: notification.readAt ? '#FFFFFF' : '#F9FAFB',
        cursor: 'pointer',
        transition: 'background-color 0.2s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F3F4F6')}
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = notification.readAt ? '#FFFFFF' : '#F9FAFB')
      }
    >
      <div
        style={{
          fontSize: '20px',
          flexShrink: 0,
        }}
      >
        {getNotificationIcon(notification.type)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }} onClick={handleMarkAsRead}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'start',
            marginBottom: '4px',
          }}
        >
          <h4
            style={{
              margin: 0,
              fontSize: '14px',
              fontWeight: notification.readAt ? '500' : '600',
              color: '#1F2937',
            }}
          >
            {getNotificationTitle(notification.type)}
          </h4>
          <span
            style={{
              fontSize: '12px',
              color: '#6B7280',
              whiteSpace: 'nowrap',
              marginLeft: '8px',
            }}
          >
            {formatDate(notification.createdAt)}
          </span>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: '13px',
            color: '#6B7280',
            lineHeight: '1.4',
            textAlign: 'right',
          }}
        >
          {notification.payload?.companyName && `الشركة: ${notification.payload.companyName}`}
          {notification.payload?.crNumber && ` (${notification.payload.crNumber})`}
          {notification.payload?.oldScore && notification.payload?.newScore && (
            <div>
              {`مؤشر الثقة: ${notification.payload.oldScore} → ${notification.payload.newScore}`}
            </div>
          )}
          {notification.payload?.subject && (
            <div>{notification.payload.subject}</div>
          )}
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        {!notification.readAt && (
          <button
            onClick={handleMarkAsRead}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10B981',
            }}
            title="وضع علامة كمقروء"
          >
            <CheckCircle size={16} />
          </button>
        )}
        <button
          onClick={handleDelete}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#EF4444',
          }}
          title="حذف"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
