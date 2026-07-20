import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Notifications() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      type: 'report',
      title: 'تقرير جديد معتمد',
      message: 'تم اعتماد تقريرك عن شركة النور للتجارة',
      timestamp: '2026-07-15 14:30',
      read: false,
      icon: '✓',
    },
    {
      id: 2,
      type: 'warning',
      title: 'تنبيه مراقبة',
      message: 'انخفض مؤشر شركة البناء المتحدة عن 60',
      timestamp: '2026-07-15 12:00',
      read: false,
      icon: '⚠️',
    },
    {
      id: 3,
      type: 'info',
      title: 'اشتراك قريب الانتهاء',
      message: 'سينتهي اشتراكك بعد 7 أيام',
      timestamp: '2026-07-14 10:30',
      read: true,
      icon: 'ℹ️',
    },
  ])

  const [filter, setFilter] = useState('all')

  const filteredNotifications = filter === 'all'
    ? notifications
    : notifications.filter(n => n.type === filter)

  const unreadCount = notifications.filter(n => !n.read).length

  const markAsRead = (id) => {
    setNotifications(notifications.map(n =>
      n.id === id ? { ...n, read: true } : n
    ))
  }

  const deleteNotification = (id) => {
    setNotifications(notifications.filter(n => n.id !== id))
  }

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })))
  }

  return (
    <div style={{ padding: '24px', background: '#F8FAFC', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
          الإشعارات
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          أنت لديك {unreadCount} إشعار جديد
        </p>
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        gap: '12px',
        flexDirection: 'row-reverse'
      }}>
        <div style={{ display: 'flex', gap: '8px', flexDirection: 'row-reverse' }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              padding: '8px 16px',
              background: filter === 'all' ? '#16A34A' : '#F8FAFC',
              color: filter === 'all' ? '#fff' : '#1E2A52',
              border: filter === 'all' ? 'none' : '1.5px solid #E2E8F0',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            الكل
          </button>
          <button
            onClick={() => setFilter('report')}
            style={{
              padding: '8px 16px',
              background: filter === 'report' ? '#16A34A' : '#F8FAFC',
              color: filter === 'report' ? '#fff' : '#1E2A52',
              border: filter === 'report' ? 'none' : '1.5px solid #E2E8F0',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            التقارير
          </button>
          <button
            onClick={() => setFilter('warning')}
            style={{
              padding: '8px 16px',
              background: filter === 'warning' ? '#16A34A' : '#F8FAFC',
              color: filter === 'warning' ? '#fff' : '#1E2A52',
              border: filter === 'warning' ? 'none' : '1.5px solid #E2E8F0',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            التنبيهات
          </button>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              color: '#16A34A',
              border: '1.5px solid #16A34A',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            وضع علامة كمقروء
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredNotifications.length === 0 ? (
          <div style={{
            background: '#fff',
            border: '1px dashed #CBD5E1',
            borderRadius: '12px',
            padding: '40px 24px',
            textAlign: 'center',
            color: '#64748B',
          }}>
            <p style={{ fontSize: '16px', margin: '0 0 8px 0' }}>✨ لا توجد إشعارات</p>
            <p style={{ fontSize: '14px', margin: 0 }}>أنت على اطلاع بكل شيء</p>
          </div>
        ) : (
          filteredNotifications.map(notification => (
            <div
              key={notification.id}
              onClick={() => markAsRead(notification.id)}
              style={{
                background: notification.read ? '#fff' : '#F0FDF4',
                border: `1px solid ${notification.read ? '#E2E8F0' : '#DCFCE7'}`,
                borderRadius: '12px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                gap: '16px',
                alignItems: 'flex-start',
                opacity: notification.read ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div style={{ fontSize: '24px' }}>{notification.icon}</div>

              <div style={{ flex: 1, textAlign: 'right' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px 0' }}>
                  {notification.title}
                  {!notification.read && (
                    <span style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      background: '#16A34A',
                      borderRadius: '50%',
                      marginRight: '8px'
                    }} />
                  )}
                </h3>
                <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 4px 0' }}>
                  {notification.message}
                </p>
                <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0 }}>
                  {notification.timestamp}
                </p>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteNotification(notification.id)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#DC2626',
                  cursor: 'pointer',
                  fontSize: '18px',
                  padding: 0,
                }}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
