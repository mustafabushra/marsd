import { useState, useEffect } from 'react'
import { Check, X, AlertCircle } from 'lucide-react'
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
      setError(null)
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
      setError(null)
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

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8FAFC' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block', width: '40px', height: '40px', border: '4px solid #E2E8F0', borderTop: '4px solid #16A34A', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '16px' }}></div>
          <p style={{ color: '#64748B', fontSize: '14px' }}>جاري تحميل التقارير...</p>
        </div>
      </div>
    )
  }

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '28px 32px' }}>
      {/* Error Alert */}
      {error && (
        <div style={{ marginBottom: '20px', padding: '14px 16px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <AlertCircle size={20} color='#991B1B' style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <p style={{ fontWeight: 600, color: '#991B1B', margin: '0 0 4px', fontSize: '14px' }}>خطأ</p>
            <p style={{ fontSize: '13px', color: '#7F1D1D', margin: 0 }}>{error}</p>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: '18px' }}>
        {/* Left: Reports Table */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '15px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', fontSize: '13px', fontWeight: 800, color: '#64748B', textAlign: 'right' }}>
            <span>الشركة</span>
            <span>التاريخ</span>
            <span>الحالة</span>
            <span>الإجراء</span>
          </div>
          {reports.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
              <p>لا توجد تقارير معلقة</p>
            </div>
          ) : (
            reports.map(r => (
              <div
                key={r.id}
                onClick={() => setSelectedReport(r)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  padding: '15px 22px',
                  borderBottom: '1px solid #F1F5F9',
                  alignItems: 'center',
                  cursor: 'pointer',
                  background: selectedReport?.id === r.id ? '#F0F4FF' : 'transparent',
                  transition: 'background 0.2s'
                }}
              >
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', textAlign: 'right' }}>{r.target_company?.name || 'مجهولة'}</span>
                <span style={{ fontSize: '13px', color: '#64748B', textAlign: 'right' }}>{new Date(r.created_at).toLocaleDateString('ar-SA')}</span>
                <span style={{
                  background: r.status === 'pending_review' ? '#FEF3C7' : r.status === 'approved' ? '#D1FAE5' : '#FEE2E2',
                  color: r.status === 'pending_review' ? '#92400E' : r.status === 'approved' ? '#065F46' : '#991B1B',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  textAlign: 'center'
                }}>
                  {r.status === 'pending_review' ? 'قيد الانتظار' : r.status === 'approved' ? 'معتمد' : 'مرفوض'}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedReport(r); }}
                  style={{
                    background: '#fff',
                    color: '#1E2A52',
                    border: '1.5px solid #E2E8F0',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  عرض
                </button>
              </div>
            ))
          )}
        </div>

        {/* Right: Details Panel */}
        {selectedReport && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px', height: 'fit-content', position: 'sticky', top: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>تفاصيل التقرير</h3>

            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>الشركة</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', textAlign: 'right' }}>{selectedReport.target_company?.name || 'مجهولة'}</div>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>الحالة</div>
              <div style={{
                fontSize: '14px',
                fontWeight: 700,
                padding: '6px 10px',
                borderRadius: '6px',
                display: 'inline-block',
                background: selectedReport.status === 'pending_review' ? '#FEF3C7' : selectedReport.status === 'approved' ? '#D1FAE5' : '#FEE2E2',
                color: selectedReport.status === 'pending_review' ? '#92400E' : selectedReport.status === 'approved' ? '#065F46' : '#991B1B'
              }}>
                {selectedReport.status === 'pending_review' ? 'قيد الانتظار' : selectedReport.status === 'approved' ? 'معتمد' : 'مرفوض'}
              </div>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>تاريخ التقرير</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#334155', textAlign: 'right' }}>{new Date(selectedReport.created_at).toLocaleDateString('ar-SA')}</div>
            </div>

            <div style={{ marginBottom: '18px', padding: '14px', background: '#F8FAFC', borderRadius: '10px' }}>
              <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '6px', textAlign: 'right' }}>الملاحظات</div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: '#334155', lineHeight: 1.6, textAlign: 'right', maxHeight: '200px', overflow: 'auto' }}>
                {selectedReport.description || 'لا توجد ملاحظات'}
              </div>
            </div>

            {selectedReport.status === 'pending_review' && (
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button
                  onClick={handleApprove}
                  disabled={actionLoading === 'approve'}
                  style={{
                    flex: 1,
                    background: actionLoading === 'approve' ? '#DBEAFE' : '#16A34A',
                    color: '#fff',
                    border: 0,
                    borderRadius: '10px',
                    padding: '11px',
                    fontSize: '14px',
                    fontWeight: 800,
                    cursor: actionLoading === 'approve' ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    opacity: actionLoading === 'approve' ? 0.7 : 1
                  }}
                >
                  <Check size={18} />
                  {actionLoading === 'approve' ? 'جاري...' : 'موافقة'}
                </button>
                <button
                  onClick={handleReject}
                  disabled={actionLoading === 'reject'}
                  style={{
                    flex: 1,
                    background: actionLoading === 'reject' ? '#DBEAFE' : '#FEE2E2',
                    color: actionLoading === 'reject' ? '#3B82F6' : '#DC2626',
                    border: 0,
                    borderRadius: '10px',
                    padding: '11px',
                    fontSize: '14px',
                    fontWeight: 800,
                    cursor: actionLoading === 'reject' ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    opacity: actionLoading === 'reject' ? 0.7 : 1
                  }}
                >
                  <X size={18} />
                  {actionLoading === 'reject' ? 'جاري...' : 'رفض'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  )
}
