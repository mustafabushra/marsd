import { useState, useEffect } from 'react'
import * as api from '../lib/api'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pagination, setPagination] = useState({ page: 1, limit: 20 })

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.getAdminUsers(pagination.page, pagination.limit)
      const formatted = response.data?.map(u => ({
        ...u,
        stBg: u.status === 'active' ? '#ECFDF5' : '#FEE2E2',
        stC: u.status === 'active' ? '#15803D' : '#DC2626',
        statusText: u.status === 'active' ? 'نشط' : 'غير نشط'
      })) || []
      setUsers(formatted)
      setPagination(response.pagination || {})
    } catch (err) {
      setError(err.message || 'خطأ في تحميل المستخدمين')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div style={{ padding: '28px', textAlign: 'right' }}>جاري التحميل...</div>
  if (error) return <div style={{ padding: '28px', color: '#DC2626', textAlign: 'right' }}>خطأ: {error}</div>

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '28px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 18px 0', textAlign: 'right' }}>إدارة المستخدمين</h1>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', padding: '15px 18px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B' }}>
          <span>الاسم</span>
          <span>البريد الإلكتروني</span>
          <span>الاشتراك</span>
          <span>الحالة</span>
          <span>الإجراءات</span>
        </div>
        {users.map(u => (
          <div key={u.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', padding: '15px 18px', borderBottom: '1px solid #F1F5F9', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{u.name}</span>
            <span style={{ fontSize: '13.5px', color: '#64748B' }}>{u.email}</span>
            <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 700 }}>{u.subscription}</span>
            <span>
              <span style={{ background: u.stBg, color: u.stC, borderRadius: '7px', padding: '4px 11px', fontSize: '12.5px', fontWeight: 800 }}>{u.status}</span>
            </span>
            <button style={{ background: '#fff', color: '#1E2A52', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>تفاصيل</button>
          </div>
        ))}
      </div>
    </main>
  )
}
