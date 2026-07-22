import { useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { CloseIcon, FileIcon } from '../components/icons'

export default function MyReports() {
  const { user } = useUser()
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

        // Get user's reports with company data
        const { data: reportsData } = await supabase
          .from('reports')
          .select(`
            id,
            target_company_id,
            status,
            submitted_at,
            title,
            description,
            companies (id, name, cr_number)
          `)
          .eq('reporter_tenant_id', userData.tenant_id)
          .order('submitted_at', { ascending: false })

        const formatted = (reportsData || []).map(r => {
          const statusObj = {
            pending_review: { bg: '#FFFBEB', c: '#B45309', label: 'قيد المراجعة' },
            approved: { bg: '#ECFDF5', c: '#15803D', label: 'معتمد' },
            rejected: { bg: '#FEE2E2', c: '#B91C1C', label: 'مرفوض' }
          }[r.status] || { bg: '#F1F5F9', c: '#64748B', label: 'جديد' }

          return {
            id: r.id,
            company: r.companies?.name || 'شركة مجهولة',
            companyId: r.target_company_id,
            date: new Date(r.submitted_at).toLocaleDateString('ar-SA'),
            value: r.description || 'تقرير',
            status: r.status,
            st: statusObj,
            description: r.description,
            paid: '—',
            delay: '—',
            due: '—',
            period: new Date(r.submitted_at).toLocaleDateString('ar-SA')
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        جاري التحميل...
      </div>
    )
  }

  const filtered = filterStatus === 'all' ? reports : reports.filter(r => r.status === filterStatus)

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '28px 32px' }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '9px', marginBottom: '18px', flexDirection: 'row-reverse' }}>
        {['all', 'pending_review', 'approved', 'rejected'].map(s => {
          const labels = { all: 'الكل', pending_review: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض' }
          const colors = { all: { bg: '#1E2A52', c: '#fff', border: '0' }, pending_review: { bg: '#fff', c: '#B45309', border: '#FDE68A' }, approved: { bg: '#fff', c: '#15803D', border: '#BBF7D0' }, rejected: { bg: '#fff', c: '#B91C1C', border: '#FECACA' } }
          const style = colors[s]
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              style={{
                background: filterStatus === s ? style.bg : '#fff',
                color: filterStatus === s ? style.c : '#64748B',
                border: filterStatus === s ? `1.5px solid ${style.border || 'transparent'}` : '1px solid #E2E8F0',
                borderRadius: '999px',
                padding: '8px 18px',
                fontSize: '13.5px',
                fontWeight: filterStatus === s ? 800 : 600,
                cursor: 'pointer'
              }}
            >
              {labels[s]}
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center' }}>
            <div style={{ color: '#94A3B8', marginBottom: '8px' }}>📝</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>لا توجد تقارير</div>
            <div style={{ fontSize: '13px', color: '#94A3B8', marginTop: '4px' }}>ابدأ برفع التقارير الأولى عن الشركات</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.2fr 1.2fr 1fr', padding: '15px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B' }}>
              <span>الشركة المُبلَّغ عنها</span>
              <span>تاريخ الإرسال</span>
              <span>الوصف</span>
              <span>الحالة</span>
            </div>
            {filtered.map(r => (
              <div key={r.id} onClick={() => handleOpenDrawer(r)} style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.2fr 1.2fr 1fr', padding: '16px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center', cursor: 'pointer' }}>
                <span style={{ fontSize: '14.5px', fontWeight: 700, color: '#0F172A' }}>{r.company}</span>
                <span style={{ fontSize: '14px', color: '#64748B', fontWeight: 600 }}>{r.date}</span>
                <span style={{ fontSize: '14px', color: '#334155', fontWeight: 700 }}>{r.value.substring(0, 30)}</span>
                <span style={{ background: r.st.bg, color: r.st.c, borderRadius: '7px', padding: '5px 12px', fontSize: '12.5px', fontWeight: 800 }}>{r.st.label}</span>
              </div>
            ))}
          </>
        )}
      </div>

      <p style={{ fontSize: '13px', color: '#94A3B8', margin: '14px 2px 0', fontWeight: 600 }}>اضغط على أي صف لعرض التفاصيل الكاملة للتقرير.</p>

      {/* Drawer */}
      {drawerOpen && selectedReport && (
        <>
          <div onClick={handleCloseDrawer} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,.5)' }}></div>
          <div style={{ position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 81, width: '480px', maxWidth: '92vw', background: '#fff', boxShadow: '8px 0 40px rgba(0,0,0,.2)', overflowY: 'auto' }} dir="rtl">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 26px', borderBottom: '1px solid #E2E8F0', position: 'sticky', top: 0, background: '#fff', flexDirection: 'row-reverse' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 0 0', textAlign: 'right' }}>تفاصيل التقرير</h3>
              <button onClick={handleCloseDrawer} style={{ background: '#F1F5F9', border: 0, borderRadius: '9px', width: '34px', height: '34px', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CloseIcon />
              </button>
            </div>
            <div style={{ padding: '26px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '22px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>الشركة المُبلَّغ عنها</div>
                  <h2 style={{ fontSize: '19px', fontWeight: 900, color: '#0F172A', margin: 0 }}>{selectedReport.company}</h2>
                </div>
                <span style={{ background: selectedReport.st.bg, color: selectedReport.st.c, borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: 800 }}>{selectedReport.st.label}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '22px' }}>
                <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '15px' }}>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '5px' }}>قيمة التعامل</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedReport.value}</div>
                </div>
                <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '15px' }}>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '5px' }}>تاريخ الإرسال</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedReport.date}</div>
                </div>
                <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '15px' }}>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '5px' }}>حالة السداد</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedReport.paid}</div>
                </div>
                <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '15px' }}>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '5px' }}>متوسط التأخير</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedReport.delay}</div>
                </div>
                <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '15px' }}>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '5px' }}>مبالغ مستحقة</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedReport.due}</div>
                </div>
                <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '15px' }}>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '5px' }}>فترة التعامل</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{selectedReport.period}</div>
                </div>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '8px' }}>المستندات المرفقة</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '11px 14px', color: '#64748B' }}>
                  <div style={{ flex: 'none', display: 'flex', alignItems: 'center' }}>
                    <FileIcon />
                  </div>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155' }}>عقد_التعامل.pdf</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
