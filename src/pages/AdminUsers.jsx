import { useState, useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import * as api from '../lib/api'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 })

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.getAdminUsers(pagination.page, pagination.limit)
      const formatted = (response.data || []).map(u => ({
        id: u.id,
        name: u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.email,
        email: u.email,
        role: u.role || 'viewer',
        status: u.status || 'active',
        stBg: u.status === 'active' ? '#ECFDF5' : '#FEE2E2',
        stC: u.status === 'active' ? '#15803D' : '#DC2626',
        statusText: u.status === 'active' ? 'نشط' : 'غير نشط'
      }))
      setUsers(formatted)
      setPagination(response.pagination || {})
    } catch (err) {
      setError(err.message || 'خطأ في تحميل المستخدمين')
      console.error('Error fetching users:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8FAFC' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block', width: '40px', height: '40px', border: '4px solid #E2E8F0', borderTop: '4px solid #16A34A', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '16px' }}></div>
          <p style={{ color: '#64748B', fontSize: '14px' }}>جاري تحميل المستخدمين...</p>
        </div>
      </div>
    )
  }

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '28px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0', textAlign: 'right' }}>إدارة المستخدمين</h1>
      <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 20px 0', textAlign: 'right' }}>عدد المستخدمين: {pagination.total}</p>

      {error && (
        <div style={{ marginBottom: '20px', padding: '14px 16px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <AlertCircle size={20} color='#991B1B' style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <p style={{ fontWeight: 600, color: '#991B1B', margin: '0 0 4px', fontSize: '14px' }}>خطأ</p>
            <p style={{ fontSize: '13px', color: '#7F1D1D', margin: 0 }}>{error}</p>
          </div>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', padding: '15px 18px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B', textAlign: 'right' }}>
          <span>الاسم</span>
          <span>البريد الإلكتروني</span>
          <span>الدور</span>
          <span>الحالة</span>
          <span>الإجراءات</span>
        </div>
        {users.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
            <p>لا يوجد مستخدمون</p>
          </div>
        ) : (
          users.map(u => (
            <div key={u.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', padding: '15px 18px', borderBottom: '1px solid #F1F5F9', alignItems: 'center', textAlign: 'right' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{u.name}</span>
              <span style={{ fontSize: '13.5px', color: '#64748B' }}>{u.email}</span>
              <span style={{
                fontSize: '13px',
                fontWeight: 600,
                background: u.role === 'admin' ? '#F0E5FF' : u.role === 'manager' ? '#E0F2FE' : '#F1F5F9',
                color: u.role === 'admin' ? '#7C3AED' : u.role === 'manager' ? '#0369A1' : '#64748B',
                padding: '4px 10px',
                borderRadius: '6px',
                display: 'inline-block'
              }}>
                {u.role === 'admin' ? 'أدمن' : u.role === 'manager' ? 'مدير' : 'مشاهد'}
              </span>
              <span>
                <span style={{ background: u.stBg, color: u.stC, borderRadius: '7px', padding: '4px 11px', fontSize: '12.5px', fontWeight: 800 }}>{u.statusText}</span>
              </span>
              <button style={{ background: '#fff', color: '#1E2A52', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>عرض</button>
            </div>
          ))
        )}
      </div>

      {pagination.pages > 1 && (
        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
          {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              disabled={p === pagination.page}
              style={{
                padding: '8px 12px',
                background: p === pagination.page ? '#16A34A' : '#fff',
                color: p === pagination.page ? '#fff' : '#0F172A',
                border: p === pagination.page ? 'none' : '1px solid #E2E8F0',
                borderRadius: '6px',
                cursor: p === pagination.page ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 600
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  )
}
