import { useState, useEffect } from 'react'
import * as api from '../lib/api'

export default function AdminLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pagination, setPagination] = useState({ page: 1, limit: 50 })

  useEffect(() => {
    fetchLogs()
  }, [])

  const fetchLogs = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.getAuditLogs(pagination.page, pagination.limit)
      const formatted = response.data?.map(log => ({
        ...log,
        stBg: '#ECFDF5',
        stC: '#15803D',
        status: 'نجاح',
        timestamp: new Date(log.created_at).toLocaleString('ar-SA'),
        user: log.actor?.email || 'نظام'
      })) || []
      setLogs(formatted)
      setPagination(response.pagination || {})
    } catch (err) {
      setError(err.message || 'خطأ في تحميل السجلات')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div style={{ padding: '28px', textAlign: 'right' }}>جاري التحميل...</div>
  if (error) return <div style={{ padding: '28px', color: '#DC2626', textAlign: 'right' }}>خطأ: {error}</div>

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '28px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 18px 0', textAlign: 'right' }}>سجل العمليات</h1>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.2fr 1fr', padding: '15px 18px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B' }}>
          <span>الإجراء</span>
          <span>المستخدم</span>
          <span>الوقت</span>
          <span>النتيجة</span>
        </div>
        {logs.map(log => (
          <div key={log.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.2fr 1fr', padding: '15px 18px', borderBottom: '1px solid #F1F5F9', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{log.action}</span>
            <span style={{ fontSize: '13.5px', color: '#64748B' }}>{log.user}</span>
            <span style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 600 }}>{log.timestamp}</span>
            <span>
              <span style={{ background: log.stBg, color: log.stC, borderRadius: '7px', padding: '4px 11px', fontSize: '12.5px', fontWeight: 800 }}>{log.status}</span>
            </span>
          </div>
        ))}
      </div>
    </main>
  )
}
