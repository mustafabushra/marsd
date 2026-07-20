import { useState, useEffect } from 'react'
import { CheckIcon, CloseIcon } from '../components/icons'
import * as api from '../lib/api'

export default function AdminReports() {
  const [selectedReport, setSelectedReport] = useState(null)
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 })
  const [actionLoading, setActionLoading] = useState(null)

  // Fetch reports on mount
  useEffect(() => {
    fetchReports()
  }, [])

  const fetchReports = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await api.getAdminReports(pagination.page, pagination.limit)
      setReports(response.data || [])
      setPagination(response.pagination || {})
      if (response.data?.length > 0) {
        setSelectedReport(response.data[0])
      }
    } catch (err) {
      setError(err.message || 'حدث خطأ في تحميل التقارير')
      console.error('Error fetching reports:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    if (!selectedReport) return
    try {
      setActionLoading('approve')
      await api.approveReport(selectedReport.id)
      // Remove from list and select next
      const updatedReports = reports.filter(r => r.id !== selectedReport.id)
      setReports(updatedReports)
      setSelectedReport(updatedReports[0] || null)
    } catch (err) {
      setError(err.message || 'فشل الموافقة على التقرير')
      console.error('Error approving report:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async () => {
    if (!selectedReport) return
    try {
      setActionLoading('reject')
      await api.rejectReport(selectedReport.id, 'تم الرفض من قبل الإدارة')
      // Remove from list and select next
      const updatedReports = reports.filter(r => r.id !== selectedReport.id)
      setReports(updatedReports)
      setSelectedReport(updatedReports[0] || null)
    } catch (err) {
      setError(err.message || 'فشل رفض التقرير')
      console.error('Error rejecting report:', err)
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '28px 32px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr', gap: '18px' }}>
        {/* Left: Reports Table */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '15px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', fontSize: '13px', fontWeight: 800, color: '#64748B' }}>
            <span>الشركة</span>
            <span>المبلّغ</span>
            <span>التاريخ</span>
            <span>الحدة</span>
            <span>الإجراء</span>
          </div>
          {reports.map(r => (
            <div key={r.id} onClick={() => setSelectedReport(r)} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', padding: '15px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center', cursor: 'pointer' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{r.company}</span>
              <span style={{ fontSize: '13.5px', color: '#64748B' }}>{r.reporter}</span>
              <span style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 600 }}>{r.date}</span>
              <span style={{ background: r.st.bg, color: r.st.c, borderRadius: '6px', padding: '4px 10px', fontSize: '12.5px', fontWeight: 800 }}>{r.severity}</span>
              <button onClick={(e) => { e.stopPropagation(); setSelectedReport(r); }} style={{ background: '#fff', color: '#1E2A52', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>مراجعة</button>
            </div>
          ))}
        </div>

        {/* Right: Details Panel */}
        {selectedReport && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>تفاصيل التقرير</h3>
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>الشركة</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedReport.company}</div>
            </div>
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>قيمة التعامل</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedReport.value}</div>
            </div>
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>المبلّغ</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedReport.reporter}</div>
            </div>
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>التاريخ</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedReport.date}</div>
            </div>
            <div style={{ marginBottom: '18px', padding: '14px', background: '#F8FAFC', borderRadius: '10px' }}>
              <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '6px' }}>الملاحظات</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#334155', lineHeight: 1.6 }}>{selectedReport.details}</div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button style={{ flex: 1, background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '11px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <CheckIcon />
                موافقة
              </button>
              <button style={{ flex: 1, background: '#FEE2E2', color: '#DC2626', border: 0, borderRadius: '10px', padding: '11px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <CloseIcon />
                رفض
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
