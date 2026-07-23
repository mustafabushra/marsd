import { useState, useEffect } from 'react'
import { Search, Filter, Eye, Trash2, Clock, CheckCircle } from 'lucide-react'
import { searchReportsKnowledgeBase, getSupabase } from '../lib/api'

export default function ReportKnowledgeBase() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ status: 'pending_review' })
  const [selectedReport, setSelectedReport] = useState(null)
  const [auditLog, setAuditLog] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 })
  const [viewMode, setViewMode] = useState('table')

  // Load reports
  useEffect(() => {
    loadReports()
  }, [query, filters, pagination.page])

  const loadReports = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await searchReportsKnowledgeBase(
        query,
        filters,
        pagination.page,
        pagination.limit
      )
      setReports(response.data || [])
      setPagination(response.pagination || {})
    } catch (err) {
      setError(err.message || 'خطأ في تحميل التقارير')
      console.error('Error loading reports:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load audit log for selected report
  const loadAuditLog = async (reportId) => {
    try {
      const supabase = getSupabase()
      const { data, error: err } = await supabase
        .from('report_audit_log')
        .select('*')
        .eq('report_id', reportId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (err) throw err
      setAuditLog(data || [])
    } catch (err) {
      console.error('Error loading audit log:', err)
      setAuditLog([])
    }
  }

  const handleReportSelect = (report) => {
    setSelectedReport(report)
    loadAuditLog(report.id)
    setViewMode('detail')
  }

  const getStatusBadge = (status) => {
    if (status === 'pending_review') return { bg: '#FEF3C7', color: '#92400E', label: 'قيد المراجعة' }
    if (status === 'approved') return { bg: '#D1FAE5', color: '#065F46', label: 'معتمد' }
    return { bg: '#FEE2E2', color: '#991B1B', label: 'مرفوض' }
  }

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0', textAlign: 'right' }}>
          📋 مستودع التقارير المركزي
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          المصدر الوحيد للحقيقة — كل التقارير وحالاتها وسجلاتها
        </p>
      </div>

      {/* Search & Filters */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexDirection: 'row-reverse' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '0 16px' }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن تقرير (الشركة، الرقم التجاري)..."
              style={{ flex: 1, border: 0, background: 'transparent', padding: '14px 0', fontSize: '14px', outline: 'none', textAlign: 'right' }}
            />
            <Search size={20} color="#94A3B8" />
          </div>
        </div>

        {/* Filter Buttons */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flexDirection: 'row-reverse' }}>
          {[
            { value: 'pending_review', label: '⏳ قيد المراجعة' },
            { value: 'approved', label: '✅ معتمد' },
            { value: 'rejected', label: '❌ مرفوض' }
          ].map(status => (
            <button
              key={status.value}
              onClick={() => setFilters({ ...filters, status: filters.status === status.value ? null : status.value })}
              style={{
                background: filters.status === status.value ? '#16A34A' : '#EEF2FF',
                color: filters.status === status.value ? '#fff' : '#1E2A52',
                border: 'none',
                borderRadius: '999px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              {filters.status === status.value ? '✓ ' : ''}{status.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedReport ? '2fr 1.2fr' : '1fr', gap: '24px' }}>
        {/* Reports Table */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', fontSize: '12px', fontWeight: 800, color: '#64748B', gap: '12px' }}>
            <span>الشركة</span>
            <span>التاريخ</span>
            <span>الحالة</span>
            <span>النقاط</span>
            <span>الإجراء</span>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>جاري التحميل...</div>
          ) : reports.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>لم يتم العثور على تقارير</div>
          ) : (
            reports.map(r => {
              const status = getStatusBadge(r.status)
              return (
                <div
                  key={r.id}
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #F1F5F9',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    background: selectedReport?.id === r.id ? '#F0F4FF' : 'transparent',
                    transition: 'background 0.2s'
                  }}
                  onClick={() => handleReportSelect(r)}
                >
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{r.company_name || 'مجهولة'}</span>
                  <span style={{ fontSize: '13px', color: '#64748B' }}>
                    {new Date(r.submitted_at).toLocaleDateString('ar-SA')}
                  </span>
                  <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', background: status.bg, color: status.color, fontWeight: 800, textAlign: 'center' }}>
                    {status.label}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: r.total_credits_awarded > 0 ? '#16A34A' : '#64748B' }}>
                    {r.total_credits_awarded > 0 ? `+${r.total_credits_awarded}` : '—'}
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleReportSelect(r); }}
                      title="عرض التفاصيل"
                      style={{ background: '#EEF2FF', color: '#1E2A52', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer' }}
                    >
                      <Eye size={14} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Right Panel: Report Details */}
        {selectedReport && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '20px', height: 'fit-content', position: 'sticky', top: '20px' }}>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '16px' }}>
              <button
                onClick={() => setViewMode('detail')}
                style={{ flex: 1, background: viewMode === 'detail' ? '#1E2A52' : '#F8FAFC', color: viewMode === 'detail' ? '#fff' : '#1E2A52', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                التفاصيل
              </button>
              <button
                onClick={() => setViewMode('audit')}
                style={{ flex: 1, background: viewMode === 'audit' ? '#1E2A52' : '#F8FAFC', color: viewMode === 'audit' ? '#fff' : '#1E2A52', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                السجل
              </button>
            </div>

            {viewMode === 'detail' && (
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>
                  {selectedReport.company_name || 'تقرير'}
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'right' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>الحالة</div>
                    <div style={{ display: 'inline-block', padding: '6px 12px', borderRadius: '6px', background: getStatusBadge(selectedReport.status).bg, color: getStatusBadge(selectedReport.status).color, fontWeight: 800, fontSize: '13px' }}>
                      {getStatusBadge(selectedReport.status).label}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>التاريخ</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                      {new Date(selectedReport.submitted_at).toLocaleDateString('ar-SA', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>نطاق المبلغ</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                      {selectedReport.deal_amount_range || '—'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>نوع الالتزام</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                      {selectedReport.payment_commitment || '—'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>النقاط المُعطاة</div>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: selectedReport.total_credits_awarded > 0 ? '#16A34A' : '#64748B' }}>
                      {selectedReport.total_credits_awarded > 0 ? `+${selectedReport.total_credits_awarded}` : 'لم تُعطَ بعد'}
                    </div>
                  </div>

                  {selectedReport.status === 'pending_review' && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                      <button style={{ flex: 1, background: '#16A34A', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                        ✅ موافقة
                      </button>
                      <button style={{ flex: 1, background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                        ❌ رفض
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {viewMode === 'audit' && (
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                  <Clock size={16} /> السجل التاريخي
                </h3>

                {auditLog.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#94A3B8', padding: '20px' }}>لا توجد تغييرات مسجلة</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '500px', overflowY: 'auto' }}>
                    {auditLog.map((log, idx) => (
                      <div key={idx} style={{ padding: '12px', background: '#F8FAFC', borderRadius: '8px', borderRight: '3px solid #16A34A', textAlign: 'right' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                          {log.action === 'submitted' ? '✨ تم الإرسال' :
                            log.action === 'status_changed' ? '🔄 تغيير الحالة' :
                            '📝 تحديث'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748B' }}>
                          {new Date(log.created_at).toLocaleDateString('ar-SA', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {reports.length > 0 && (
        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setPagination({ ...pagination, page: Math.max(1, pagination.page - 1) })}
            disabled={pagination.page === 1}
            style={{ padding: '8px 16px', border: '1px solid #E2E8F0', borderRadius: '8px', background: '#fff', cursor: pagination.page === 1 ? 'not-allowed' : 'pointer', opacity: pagination.page === 1 ? 0.5 : 1 }}
          >
            ← السابق
          </button>
          <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 700 }}>
            {pagination.page} من {pagination.pages}
          </span>
          <button
            onClick={() => setPagination({ ...pagination, page: Math.min(pagination.pages, pagination.page + 1) })}
            disabled={pagination.page === pagination.pages}
            style={{ padding: '8px 16px', border: '1px solid #E2E8F0', borderRadius: '8px', background: '#fff', cursor: pagination.page === pagination.pages ? 'not-allowed' : 'pointer', opacity: pagination.page === pagination.pages ? 0.5 : 1 }}
          >
            التالي →
          </button>
        </div>
      )}
    </main>
  )
}
