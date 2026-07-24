import { useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { CloseIcon, FileIcon } from '../components/icons'
import { useUserRole } from '../hooks/useUserRole'
import { useSystemStatus } from '../hooks/useSystemStatus'
import { canPerform } from '../utils/roles'

export default function MyReports() {
  const { user } = useUser()
  const { role, loading: roleLoading } = useUserRole()
  const systemStatus = useSystemStatus()
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedReport, setSelectedReport] = useState(null)
  const [reports, setReports] = useState([])
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    const loadReports = async () => {
      try {
        const supabase = getSupabase()

        // Get current user's tenant
        const { data: userData } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', user?.id)
          .single()

        if (!userData?.tenant_id) {
          setLoading(false)
          return
        }

        // Get user's reports with company data + credits earned + review actions (rejection reason)
        const { data: reportsData } = await supabase
          .from('reports')
          .select(`
            id,
            target_company_id,
            status,
            submitted_at,
            approved_at,
            dealt_at,
            title,
            category,
            report_type,
            deal_amount_range,
            deal_value,
            currency,
            payment_commitment,
            delay_days,
            defaulted,
            notes,
            description,
            companies (id, name, cr_number),
            credits_ledger(amount),
            review_actions(action, reason, created_at)
          `)
          .eq('reporter_tenant_id', userData.tenant_id)
          .order('submitted_at', { ascending: false })

        const paymentLabels = { full: 'تم السداد', partial: 'سداد جزئي', late: 'متأخر', default: 'لم يُسدَّد', unpaid: 'لم يُسدَّد', na: 'لا ينطبق' }
        const categoryLabels = { late_payment: 'تأخير سداد', no_payment: 'عدم سداد', contract_breach: 'إخلال بالعقد', quality: 'جودة العمل', execution_delay: 'تأخير التنفيذ', dispute: 'نزاع', fraud: 'احتيال', other: 'أخرى' }

        const formatted = (reportsData || []).map(r => {
          const statusObj = {
            draft: { bg: '#EEF2FF', c: '#3730A3', label: 'مسودّة' },
            pending_review: { bg: '#FFFBEB', c: '#B45309', label: 'قيد المراجعة' },
            approved: { bg: '#ECFDF5', c: '#15803D', label: '✅ معتمد' },
            rejected: { bg: '#FEE2E2', c: '#B91C1C', label: '❌ مرفوض' }
          }[r.status] || { bg: '#F1F5F9', c: '#64748B', label: 'جديد' }

          // Calculate credits earned for approved reports
          const creditsEarned = r.status === 'approved'
            ? (r.credits_ledger?.find(c => c.amount > 0)?.amount || 10)
            : 0

          // Rejection reason lives in review_actions (action = 'reject')
          const rejectAction = (r.review_actions || [])
            .filter(a => a.action === 'reject')
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]

          const dealValue = r.deal_value != null
            ? `${Number(r.deal_value).toLocaleString('ar-SA')} ${r.currency || ''}`.trim()
            : (r.deal_amount_range ? r.deal_amount_range.replace(/^SAR\s*/, '') + ' ر.س' : '—')

          return {
            id: r.id,
            company: r.companies?.name || 'شركة مجهولة',
            companyId: r.target_company_id,
            title: r.title || '—',
            category: r.category ? (categoryLabels[r.category] || r.category) : '—',
            date: r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('ar-SA') : '—',
            value: dealValue,
            status: r.status,
            st: statusObj,
            notes: r.description || r.notes,
            rejectionReason: rejectAction?.reason || '',
            creditsEarned: creditsEarned,
            paid: r.payment_commitment ? (paymentLabels[r.payment_commitment] || r.payment_commitment) : '—',
            delay: (r.delay_days ?? 0) + ' يوم',
            due: r.defaulted ? 'نعم' : 'لا',
            period: r.dealt_at ? new Date(r.dealt_at).toLocaleDateString('ar-SA') : '—',
            approvedAt: r.approved_at ? new Date(r.approved_at).toLocaleDateString('ar-SA') : null
          }
        })

        setReports(formatted)
      } catch (err) {
        console.error('Error loading reports:', err)
      } finally {
        setLoading(false)
      }
    }

    if (user?.id) {
      loadReports()
    }
  }, [user?.id])

  const handleOpenDrawer = (report) => {
    setSelectedReport(report)
    setDrawerOpen(true)
  }

  const handleCloseDrawer = () => {
    setDrawerOpen(false)
    setSelectedReport(null)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '44px', marginBottom: '16px', animation: 'spin 2s linear infinite' }}>⏳</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#64748B' }}>جاري تحميل تقاريرك...</div>
        </div>
      </div>
    )
  }

  const filtered = filterStatus === 'all' ? reports : reports.filter(r => r.status === filterStatus)

  return (
    <div>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '9px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {['all', 'pending_review', 'approved', 'rejected'].map(s => {
          const labels = { all: 'الكل', pending_review: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض' }
          const colors = { all: { bg: '#1E2A52', c: '#fff', border: '#1E2A52' }, pending_review: { bg: '#fff', c: '#B45309', border: '#FDE68A' }, approved: { bg: '#fff', c: '#15803D', border: '#BBF7D0' }, rejected: { bg: '#fff', c: '#B91C1C', border: '#FECACA' } }
          const style = colors[s]
          const active = filterStatus === s
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              style={{
                background: active ? style.bg : '#fff',
                color: active ? style.c : '#64748B',
                border: `1.5px solid ${active ? style.border : '#E2E8F0'}`,
                borderRadius: '999px',
                padding: '8px 18px',
                fontSize: '13.5px',
                fontWeight: active ? 800 : 700,
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}>
              {labels[s]}
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ color: '#CBD5E1', marginBottom: '16px', fontSize: '44px' }}>📝</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>لا توجد تقارير</div>
            <div style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '20px' }}>ابدأ برفع التقارير الأولى عن الشركات لمساعدة المجتمع</div>
            <button
              onClick={() => window.location.href = '/add-report'}
              style={{
                background: '#16A34A', color: '#fff', border: 0, borderRadius: '11px', padding: '13px 28px',
                fontSize: '15px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit'
              }}>
              + إرسال تقرير جديد
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.2fr 1.2fr 1fr', padding: '15px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B', textAlign: 'right' }}>
              <span>الشركة المُبلَّغ عنها</span>
              <span>تاريخ الإرسال</span>
              <span>قيمة التعامل</span>
              <span>الحالة</span>
            </div>
            {filtered.map((r) => (
              <div
                key={r.id}
                onClick={() => handleOpenDrawer(r)}
                style={{
                  display: 'grid', gridTemplateColumns: '2.5fr 1.2fr 1.2fr 1fr',
                  padding: '16px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center',
                  cursor: 'pointer', background: '#fff'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}>
                <span style={{ fontSize: '14.5px', fontWeight: 700, color: '#0F172A' }}>{r.company}</span>
                <span style={{ fontSize: '14px', color: '#64748B', fontWeight: 600 }}>{r.date}</span>
                <span style={{ fontSize: '14px', color: '#334155', fontWeight: 700 }}>{(r.value || '').substring(0, 25)}{(r.value || '').length > 25 ? '…' : ''}</span>
                <span><span style={{ background: r.st.bg, color: r.st.c, borderRadius: '7px', padding: '5px 12px', fontSize: '12.5px', fontWeight: 800 }}>{r.st.label}</span></span>
              </div>
            ))}
          </>
        )}
      </div>
      {filtered.length > 0 && (
        <p style={{ fontSize: '13px', color: '#94A3B8', margin: '14px 2px 0', fontWeight: 600 }}>اضغط على أي صف لعرض التفاصيل الكاملة للتقرير.</p>
      )}

      {/* Drawer */}
      {drawerOpen && selectedReport && (
        <>
          <div
            onClick={handleCloseDrawer}
            style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,.5)' }}></div>
          <div
            style={{
              position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 81,
              width: '480px', maxWidth: '92vw', background: '#fff',
              boxShadow: '8px 0 40px rgba(0,0,0,.2)',
              overflowY: 'auto', animation: 'fadeUp .25s ease both'
            }}
            dir="rtl">
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '22px 26px', borderBottom: '1px solid #E2E8F0',
              position: 'sticky', top: 0, background: '#fff'
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: 0 }}>تفاصيل التقرير</h3>
              <button
                onClick={handleCloseDrawer}
                style={{
                  background: '#F1F5F9', border: 0, borderRadius: '9px',
                  width: '34px', height: '34px', cursor: 'pointer', color: '#64748B',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                <CloseIcon />
              </button>
            </div>
            <div style={{ padding: '26px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '22px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>الشركة المُبلَّغ عنها</div>
                  <h2 style={{ fontSize: '19px', fontWeight: 900, color: '#0F172A', margin: 0 }}>{selectedReport.company}</h2>
                </div>
                <span style={{
                  background: selectedReport.st.bg, color: selectedReport.st.c,
                  borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: 800
                }}>{selectedReport.st.label}</span>
              </div>

              {selectedReport.status === 'pending_review' && (
                <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '14px 16px', marginBottom: '22px', fontSize: '14px', color: '#92400E', fontWeight: 700 }}>
                  ⏳ التقرير قيد المراجعة — الرجاء الانتظار
                </div>
              )}

              {selectedReport.status === 'approved' && (
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '14px 16px', marginBottom: '22px', fontSize: '14px', color: '#15803D', fontWeight: 700 }}>
                  ✅ تم اعتماد تقريرك! كسبت <span style={{ fontWeight: 900 }}>{selectedReport.creditsEarned}</span> نقطة ائتمان
                </div>
              )}

              {selectedReport.status === 'rejected' && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '16px 18px', marginBottom: '22px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#B91C1C', marginBottom: selectedReport.rejectionReason ? '7px' : 0 }}>⚠ ملاحظة الإدارة (سبب الرفض)</div>
                  {selectedReport.rejectionReason && (
                    <p style={{ fontSize: '14px', color: '#7F1D1D', lineHeight: 1.7, margin: 0 }}>{selectedReport.rejectionReason}</p>
                  )}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '22px' }}>
                {[
                  { label: 'قيمة التعامل', value: selectedReport.value },
                  { label: 'تاريخ الإرسال', value: selectedReport.date },
                  { label: 'حالة السداد', value: selectedReport.paid },
                  { label: 'متوسط التأخير', value: selectedReport.delay },
                  { label: 'مبالغ مستحقة', value: selectedReport.due },
                  { label: 'فترة التعامل', value: selectedReport.period }
                ].map((item, idx) => (
                  <div key={idx} style={{ background: '#F8FAFC', borderRadius: '11px', padding: '15px' }}>
                    <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '5px' }}>{item.label}</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{item.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '8px' }}>المستندات المرفقة</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '11px 14px' }}>
                  <span style={{ fontSize: '18px' }}>📄</span>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155' }}>عقد_التعامل.pdf</span>
                </div>
              </div>

              {selectedReport.status === 'rejected' && (
                <button
                  onClick={() => { handleCloseDrawer() }}
                  style={{
                    width: '100%', background: '#16A34A', color: '#fff', border: 0, borderRadius: '11px',
                    padding: '13px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit'
                  }}>
                  🔄 إعادة الإرسال
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
