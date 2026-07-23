import { useState, useEffect } from 'react'
import { Search, Filter, Eye, Edit2, Trash2, Merge2, Clock } from 'lucide-react'
import { searchCompaniesKnowledgeBase, getSupabase } from '../lib/api'

export default function CompanyKnowledgeBase() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ status: null, source: null })
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [auditLog, setAuditLog] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 })
  const [viewMode, setViewMode] = useState('table') // table, detail, audit

  // Load companies
  useEffect(() => {
    loadCompanies()
  }, [query, filters, pagination.page])

  const loadCompanies = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await searchCompaniesKnowledgeBase(
        query,
        filters,
        pagination.page,
        pagination.limit
      )
      setCompanies(response.data || [])
      setPagination(response.pagination || {})
    } catch (err) {
      setError(err.message || 'خطأ في تحميل الشركات')
      console.error('Error loading companies:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load audit log for selected company
  const loadAuditLog = async (companyId) => {
    try {
      const supabase = getSupabase()
      const { data, error: err } = await supabase
        .from('company_audit_log')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (err) throw err
      setAuditLog(data || [])
    } catch (err) {
      console.error('Error loading audit log:', err)
      setAuditLog([])
    }
  }

  const handleCompanySelect = (company) => {
    setSelectedCompany(company)
    loadAuditLog(company.id)
    setViewMode('detail')
  }

  const getRiskBadge = (score) => {
    if (score >= 70) return { bg: '#ECFDF5', color: '#15803D', label: 'مخاطر منخفضة' }
    if (score >= 40) return { bg: '#FFFBEB', color: '#B45309', label: 'مخاطر متوسطة' }
    return { bg: '#FEE2E2', color: '#DC2626', label: 'مخاطر عالية' }
  }

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0', textAlign: 'right' }}>
          📚 مستودع الشركات المركزي
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          المصدر الوحيد للحقيقة — كل الشركات وبياناتها في مكان واحد
        </p>
      </div>

      {/* Search & Filters */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexDirection: 'row-reverse' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '0 16px' }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن شركة (الاسم، السجل، رقم موحد)..."
              style={{ flex: 1, border: 0, background: 'transparent', padding: '14px 0', fontSize: '14px', outline: 'none', textAlign: 'right' }}
            />
            <Search size={20} color="#94A3B8" />
          </div>
          <button style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '12px', padding: '0 24px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>
            + شركة جديدة
          </button>
        </div>

        {/* Filter Buttons */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flexDirection: 'row-reverse' }}>
          <button
            onClick={() => setFilters({ ...filters, status: filters.status === 'approved' ? null : 'approved' })}
            style={{
              background: filters.status === 'approved' ? '#16A34A' : '#EEF2FF',
              color: filters.status === 'approved' ? '#fff' : '#1E2A52',
              border: 'none',
              borderRadius: '999px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {filters.status === 'approved' ? '✓ ' : ''}معتمدة
          </button>
          <button
            onClick={() => setFilters({ ...filters, source: filters.source === 'official' ? null : 'official' })}
            style={{
              background: filters.source === 'official' ? '#16A34A' : '#EEF2FF',
              color: filters.source === 'official' ? '#fff' : '#1E2A52',
              border: 'none',
              borderRadius: '999px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {filters.source === 'official' ? '✓ ' : ''}رسمية
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedCompany ? '2fr 1.2fr' : '1fr', gap: '24px' }}>
        {/* Companies Table */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', fontSize: '12px', fontWeight: 800, color: '#64748B', gap: '12px' }}>
            <span>الاسم</span>
            <span>السجل</span>
            <span>القطاع</span>
            <span>مؤشر الثقة</span>
            <span>التقارير</span>
            <span>الإجراء</span>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>جاري التحميل...</div>
          ) : companies.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8' }}>لم يتم العثور على شركات</div>
          ) : (
            companies.map(c => {
              const risk = getRiskBadge(c.trust_score)
              return (
                <div
                  key={c.id}
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #F1F5F9',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(6, 1fr)',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    background: selectedCompany?.id === c.id ? '#F0F4FF' : 'transparent',
                    transition: 'background 0.2s'
                  }}
                  onClick={() => handleCompanySelect(c)}
                >
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{c.name}</span>
                  <span style={{ fontSize: '13px', color: '#64748B' }}>{c.cr_number || '—'}</span>
                  <span style={{ fontSize: '13px', color: '#64748B' }}>{c.sector || '—'}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{Math.round(c.trust_score)}</span>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: risk.bg, color: risk.color, fontWeight: 700 }}>●</span>
                  </div>
                  <span style={{ fontSize: '13px', color: '#64748B' }}>{c.total_reports_count || 0}</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCompanySelect(c); }}
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

        {/* Right Panel: Company Details */}
        {selectedCompany && (
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
                  {selectedCompany.name}
                </h3>

                {/* Details Grid */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'right' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>السجل التجاري</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>{selectedCompany.cr_number || '—'}</div>
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>مؤشر الثقة</div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: '#1E2A52' }}>
                      {Math.round(selectedCompany.trust_score)}%
                    </div>
                    <div style={{ fontSize: '12px', color: getRiskBadge(selectedCompany.trust_score).color, fontWeight: 700 }}>
                      {getRiskBadge(selectedCompany.trust_score).label}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>التقارير</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div style={{ background: '#F1F5F9', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: '#15803D' }}>
                          {selectedCompany.approved_reports_count || 0}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>معتمدة</div>
                      </div>
                      <div style={{ background: '#F1F5F9', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: '#F59E0B' }}>
                          {selectedCompany.pending_reports_count || 0}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>معلقة</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>المصدر</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                      {selectedCompany.source === 'official' ? '📋 رسمي' : '👥 من المجتمع'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                    <button style={{ flex: 1, background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                      ✏️ تعديل
                    </button>
                    <button style={{ flex: 1, background: '#F1F5F9', color: '#1E2A52', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                      🔗 دمج
                    </button>
                  </div>
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
                          {log.action === 'created' ? '✨ تم الإنشاء' :
                            log.action === 'status_changed' ? '🔄 تغيير الحالة' :
                            log.action === 'approved' ? '✅ تم الاعتماد' :
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
      {companies.length > 0 && (
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
