import React, { useState, useEffect } from 'react'
import { useNotifications } from './useNotifications'
import NotificationItem from './NotificationItem'
import Button from '../common/Button'
import { Trash2, Check } from 'lucide-react'

export default function NotificationHistoryPage() {
  const {
    notifications,
    unreadCount,
    loading,
    error,
    filter,
    setFilter,
    fetchNotifications,
    markAsRead,
    deleteNotifications,
  } = useNotifications()

  const [selectedNotifications, setSelectedNotifications] = useState([])
  const [page, setPage] = useState(0)

  const limit = 20
  const pageCount = Math.ceil(notifications.length / limit)

  useEffect(() => {
    fetchNotifications(filter === 'all' ? 'all' : filter, limit, page * limit)
  }, [filter, page])

  const handleSelectAll = () => {
    if (selectedNotifications.length === notifications.length) {
      setSelectedNotifications([])
    } else {
      setSelectedNotifications(notifications.map((n) => n.id))
    }
  }

  const handleSelectNotification = (notificationId) => {
    setSelectedNotifications((prev) =>
      prev.includes(notificationId)
        ? prev.filter((id) => id !== notificationId)
        : [...prev, notificationId]
    )
  }

  const handleMarkSelectedAsRead = async () => {
    if (selectedNotifications.length > 0) {
      await markAsRead(selectedNotifications)
      setSelectedNotifications([])
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedNotifications.length > 0) {
      await deleteNotifications(selectedNotifications)
      setSelectedNotifications([])
    }
  }

  const filterOptions = [
    { value: 'all', label: 'الكل' },
    { value: 'unread', label: 'غير المقروءة' },
    { value: 'report_approved', label: 'التقارير المقبولة' },
    { value: 'score_changed', label: 'تحديثات المؤشر' },
    { value: 'request_received', label: 'طلبات الأعمال' },
    { value: 'watchlist_alert', label: 'تنبيهات قائمة المراقبة' },
  ]

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: '700', color: '#1F2937' }}>
          الإشعارات
        </h1>
        <p style={{ margin: 0, color: '#6B7280', fontSize: '14px' }}>
          {notifications.length} إشعار ({unreadCount} غير مقروء)
        </p>
      </div>

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          overflowX: 'auto',
          paddingBottom: '8px',
        }}
      >
        {filterOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => {
              setFilter(option.value)
              setPage(0)
              setSelectedNotifications([])
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid',
              backgroundColor: filter === option.value ? '#1E2A52' : '#fff',
              color: filter === option.value ? '#fff' : '#1E2A52',
              borderColor: filter === option.value ? '#1E2A52' : '#D1D5DB',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      {selectedNotifications.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: '#EFF6FF',
            borderRadius: '8px',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '14px', color: '#1E40AF' }}>
            {selectedNotifications.length} مختار
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={handleMarkSelectedAsRead}
            style={{ display: 'flex', gap: '6px', alignItems: 'center' }}
          >
            <Check size={16} />
            وضع علامة كمقروء
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleDeleteSelected}
            style={{ display: 'flex', gap: '6px', alignItems: 'center' }}
          >
            <Trash2 size={16} />
            حذف
          </Button>
        </div>
      )}

      {/* Notifications List */}
      {loading && notifications.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            color: '#6B7280',
          }}
        >
          جاري تحميل الإشعارات...
        </div>
      ) : error ? (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            color: '#DC2626',
            backgroundColor: '#FEF2F2',
            borderRadius: '8px',
            border: '1px solid #FECACA',
          }}
        >
          حدث خطأ في تحميل الإشعارات: {error}
        </div>
      ) : notifications.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 24px',
            color: '#6B7280',
            backgroundColor: '#F9FAFB',
            borderRadius: '8px',
            border: '1px dashed #D1D5DB',
          }}
        >
          لا توجد إشعارات
        </div>
      ) : (
        <>
          <div
            style={{
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              overflow: 'hidden',
              marginBottom: '24px',
              backgroundColor: '#fff',
            }}
          >
            {/* Checkbox Header */}
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: '#F9FAFB',
                borderBottom: '1px solid #E5E7EB',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <input
                type="checkbox"
                checked={
                  selectedNotifications.length === notifications.length &&
                  notifications.length > 0
                }
                onChange={handleSelectAll}
                style={{
                  cursor: 'pointer',
                  width: '18px',
                  height: '18px',
                }}
              />
              <span style={{ fontSize: '13px', color: '#6B7280', fontWeight: '500' }}>
                اختر الكل
              </span>
            </div>

            {/* Notifications Items */}
            {notifications.map((notification) => (
              <div
                key={notification.id}
                style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '12px 16px',
                  borderBottom: '1px solid #E5E7EB',
                  backgroundColor: notification.readAt ? '#FFFFFF' : '#F9FAFB',
                  alignItems: 'flex-start',
                  '&:last-child': {
                    borderBottom: 'none',
                  },
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedNotifications.includes(notification.id)}
                  onChange={() => handleSelectNotification(notification.id)}
                  style={{
                    cursor: 'pointer',
                    width: '18px',
                    height: '18px',
                    marginTop: '2px',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <NotificationItem notification={notification} />
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div
              style={{
                display: 'flex',
                gap: '8px',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #D1D5DB',
                  backgroundColor: page === 0 ? '#F3F4F6' : '#fff',
                  cursor: page === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  color: page === 0 ? '#9CA3AF' : '#1F2937',
                }}
              >
                السابق
              </button>

              {Array.from({ length: pageCount }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid',
                    backgroundColor: page === i ? '#1E2A52' : '#fff',
                    color: page === i ? '#fff' : '#1F2937',
                    borderColor: page === i ? '#1E2A52' : '#D1D5DB',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: page === i ? '600' : '400',
                  }}
                >
                  {i + 1}
                </button>
              ))}

              <button
                onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
                disabled={page === pageCount - 1}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #D1D5DB',
                  backgroundColor: page === pageCount - 1 ? '#F3F4F6' : '#fff',
                  cursor: page === pageCount - 1 ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  color: page === pageCount - 1 ? '#9CA3AF' : '#1F2937',
                }}
              >
                التالي
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
