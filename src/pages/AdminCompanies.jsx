import { useState, useEffect } from 'react'
import * as api from '../lib/api'

export default function AdminCompanies() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 })

  useEffect(() => {
    fetchCompanies()
  }, [])

  const fetchCompanies = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.getAdminCompanies(pagination.page, pagination.limit)
      const formatted = response.data?.map(c => ({
        ...c,
        stBg: c.approved ? '#ECFDF5' : '#FFFBEB',
        stC: c.approved ? '#15803D' : '#B45309',
        status: c.approved ? 'مستحق' : 'قيد المراجعة'
      })) || []
      setCompanies(formatted)
      setPagination(response.pagination || {})
    } catch (err) {
      setError(err.message || 'خطأ في تحميل الشركات')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (companyId) => {
    try {
      await api.approveCompany(companyId)
      await fetchCompanies()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div style={{ padding: '28px', textAlign: 'right' }}>جاري التحميل...</div>
  if (error) return <div style={{ padding: '28px', color: '#DC2626', textAlign: 'right' }}>خطأ: {error}</div>

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexDirection: 'row-reverse' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 0 0', textAlign: 'right' }}>إدارة الشركات</h1>
        <button style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '11px 24px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>+ شركة جديدة</button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', padding: '15px 18px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B' }}>
          <span>الاسم</span>
          <span>القطاع</span>
          <span>مؤشر الثقة</span>
          <span>الحالة</span>
          <span>الإجراءات</span>
        </div>
        {companies.map(c => (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', padding: '15px 18px', borderBottom: '1px solid #F1F5F9', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{c.name}</span>
            <span style={{ fontSize: '13.5px', color: '#64748B' }}>{c.sector}</span>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#1E2A52' }}>{c.score}</span>
            <span>
              <span style={{ background: c.stBg, color: c.stC, borderRadius: '7px', padding: '4px 11px', fontSize: '12.5px', fontWeight: 800 }}>{c.status}</span>
            </span>
            <button style={{ background: '#fff', color: '#1E2A52', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>تعديل</button>
          </div>
        ))}
      </div>
    </main>
  )
}
