import { useState, useEffect } from 'react'
import { CheckIcon, CloseIcon } from '../components/icons'
import * as api from '../lib/api'

export default function AdminRequests() {
  const [requests, setRequests] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pagination, setPagination] = useState({ page: 1, limit: 20 })

  useEffect(() => {
    fetchRequests()
  }, [])

  const fetchRequests = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.getAdminRequests(pagination.page, pagination.limit)
      const formatted = response.data?.map(r => ({
        ...r,
        tBg: r.request_type === 'add' ? '#F0FDF4' : '#EEF2FF',
        tC: r.request_type === 'add' ? '#15803D' : '#1E2A52',
        type: r.request_type === 'add' ? 'جديدة' : 'تعديل',
        by: r.sender_tenant?.name || 'غير محدد',
        name: r.target_company?.name || 'غير محدد'
      })) || []
      setRequests(formatted)
      if (formatted.length > 0) setSelected(formatted[0])
      setPagination(response.pagination || {})
    } catch (err) {
      setError(err.message || 'خطأ في تحميل الطلبات')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div style={{ padding: '28px', textAlign: 'center' }}>جاري التحميل...</div>
  if (error) return <div style={{ padding: '28px', color: '#DC2626' }}>خطأ: {error}</div>

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '28px' }}>
      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '14px 18px', marginBottom: '18px', display: 'flex', gap: '11px', alignItems: 'center' }}>
        <span style={{ fontSize: '18px' }}>🏢</span>
        <span style={{ fontSize: '13.5px', color: '#15803D', fontWeight: 700 }}>طلبات إضافة وتعديل الشركات المقدّمة من الأعضاء. تحقّق من مطابقة البيانات للسجل التجاري قبل النشر.</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '18px', alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '15px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: '0 0 0 0' }}>الطلبات المعلّقة</h3>
            <span style={{ background: '#FEF2F2', color: '#B91C1C', borderRadius: '999px', padding: '3px 11px', fontSize: '12.5px', fontWeight: 800 }}>{requests.length}</span>
          </div>
          {requests.map(r => (
            <div key={r.id} onClick={() => setSelected(r)} style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', background: selected.id === r.id ? '#F8FAFC' : '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', lineHeight: 1.4 }}>{r.name}</div>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>مقدّم من: {r.by}</div>
              </div>
              <span>
                <span style={{ background: r.tBg, color: r.tC, borderRadius: '7px', padding: '4px 10px', fontSize: '11.5px', fontWeight: 800 }}>{r.type}</span>
              </span>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px', paddingBottom: '16px', borderBottom: '1px solid #F1F5F9' }}>
            <div>
              <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>الشركة</div>
              <h2 style={{ fontSize: '19px', fontWeight: 900, color: '#0F172A', margin: '0 0 0 0' }}>{selected.name}</h2>
            </div>
            <span style={{ background: selected.tBg, color: selected.tC, borderRadius: '8px', padding: '6px 13px', fontSize: '12.5px', fontWeight: 800 }}>{selected.type}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
            <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '14px' }}>
              <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>رقم السجل التجاري</div>
              <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A', direction: 'ltr', textAlign: 'right' }}>1010234567</div>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '14px' }}>
              <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>الرقم الموحّد (700)</div>
              <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A', direction: 'ltr', textAlign: 'right' }}>7001234567</div>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '14px' }}>
              <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>القطاع</div>
              <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>مقاولات</div>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '14px' }}>
              <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>المدينة</div>
              <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>الرياض</div>
            </div>
          </div>

          <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#3730A3', marginBottom: '5px' }}>🔗 نتيجة المطابقة الآلية</div>
            <div style={{ fontSize: '13.5px', color: '#4338CA', fontWeight: 600, lineHeight: 1.6 }}>البيانات مطابقة 100% مع السجل التجاري</div>
          </div>

          <div style={{ display: 'flex', gap: '10px', paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}>
            <button style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '12px 24px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <CheckIcon />
              موافقة ونشر
            </button>
            <button style={{ background: '#fff', color: '#B91C1C', border: '1.5px solid #FECACA', borderRadius: '10px', padding: '12px 24px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <CloseIcon />
              رفض
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
