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

        // Get user's reports with company data + credits earned + rejection reason
        const { data: reportsData } = await supabase
          .from('reports')
          .select(`
            id,
            target_company_id,
            status,
            submitted_at,
            approved_at,
            rejection_reason,
            title,
            description,
            type,
            companies (id, name, cr_number),
            credits_ledger(amount)
          `)
          .eq('reporter_tenant_id', userData.tenant_id)
          .order('submitted_at', { ascending: false })

        const formatted = (reportsData || []).map(r => {
          const statusObj = {
            pending_review: { bg: '#FFFBEB', c: '#B45309', label: 'قيد المراجعة' },
            approved: { bg: '#ECFDF5', c: '#15803D', label: '✅ معتمد' },
            rejected: { bg: '#FEE2E2', c: '#B91C1C', label: '❌ مرفوض' }
          }[r.status] || { bg: '#F1F5F9', c: '#64748B', label: 'جديد' }

          // Calculate credits earned for approved reports
          const creditsEarned = r.status === 'approved'
            ? (r.credits_ledger?.find(c => c.amount > 0)?.amount || 10)
            : 0

          return {
            id: r.id,
            company: r.companies?.name || 'شركة مجهولة',
            companyId: r.target_company_id,
            date: new Date(r.submitted_at).toLocaleDateString('ar-SA'),
            value: r.description || 'تقرير',
            status: r.status,
            type: r.type,
            st: statusObj,
            description: r.description,
            rejectionReason: r.rejection_reason,
            creditsEarned: creditsEarned,
            paid: '—',
            delay: '—',
            due: '—',
            period: new Date(r.submitted_at).toLocaleDateString('ar-SA'),
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
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)' }}>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'spin 2s linear infinite' }}>⏳</div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#64748B' }}>جاري تحميل تقاريرك...</div>
        </div>
      </main>
    )
  }

  const filtered = filterStatus === 'all' ? reports : reports.filter(r => r.status === filterStatus)

  return (
    <main style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)', minHeight: '100vh', padding: '28px 32px' }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0', textAlign: 'right' }}>📋 تقاريري</h1>
          <p style={{ color: '#64748B', fontSize: '14px', margin: '0 0 0 0', textAlign: 'right' }}>عرض وإدارة جميع التقارير التي قدمتها</p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexDirection: 'row-reverse' }}>
          {['all', 'pending_review', 'approved', 'rejected'].map(s => {
            const labels = { all: 'الكل', pending_review: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض' }
            const colors = { all: { bg: '#1E2A52', c: '#fff', border: '0' }, pending_review: { bg: '#FFF8E1', c: '#B45309', border: '#FDE68A' }, approved: { bg: '#F0FDF4', c: '#15803D', border: '#BBF7D0' }, rejected: { bg: '#FEF2F2', c: '#B91C1C', border: '#FECACA' } }
            const style = colors[s]
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  background: filterStatus === s ? style.bg : '#fff',
                  color: filterStatus === s ? style.c : '#64748B',
                  border: filterStatus === s ? `2px solid ${style.border || 'transparent'}` : '2px solid #E2E8F0',
                  borderRadius: '999px',
                  padding: '10px 20px',
                  fontSize: '13px',
                  fontWeight: filterStatus === s ? 800 : 600,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  if (filterStatus !== s) {
                    e.target.style.borderColor = '#D1D5DB'
                  }
                }}
                onMouseLeave={(e) => {
                  if (filterStatus !== s) {
                    e.target.style.borderColor = '#E2E8F0'
                  }
                }}>
                {labels[s]}
              </button>
            )
          })}
        </div>

        {/* Table */}
        <div style={{
          background: '#fff', border: '2px solid #E2E8F0', borderRadius: '16px',
          overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          animation: 'fadeIn 0.5s ease-out'
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '48px 32px', textAlign: 'center' }}>
              <div style={{ color: '#CBD5E1', marginBottom: '16px', fontSize: '48px' }}>📝</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>لا توجد تقارير</div>
              <div style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '20px' }}>ابدأ برفع التقارير الأولى عن الشركات لمساعدة المجتمع</div>
              <button
                onClick={() => window.location.href = '/add-report'}
                style={{
                  background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                  color: '#fff', border: 0, borderRadius: '12px', padding: '12px 28px',
                  fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-2px)'
                  e.target.style.boxShadow = '0 6px 16px rgba(22, 163, 74, 0.35)'
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)'
                  e.target.style.boxShadow = '0 4px 12px rgba(22, 163, 74, 0.25)'
                }}>
                + إرسال تقرير جديد
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.2fr 1.2fr 1fr', padding: '16px 22px', background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)', borderBottom: '2px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B', textAlign: 'right' }}>
                <span>الشركة المُبلَّغ عنها</span>
                <span>تاريخ الإرسال</span>
                <span>الوصف</span>
                <span>الحالة</span>
              </div>
              {filtered.map((r, idx) => (
                <div
                  key={r.id}
                  onClick={() => handleOpenDrawer(r)}
                  style={{
                    display: 'grid', gridTemplateColumns: '2.5fr 1.2fr 1.2fr 1fr',
                    padding: '16px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center',
                    cursor: 'pointer', transition: 'all 0.3s ease', background: idx % 2 === 0 ? '#fff' : '#FAFBFC'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#F0F9FF'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#FAFBFC'
                  }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{r.company}</span>
                  <span style={{ fontSize: '14px', color: '#64748B', fontWeight: 600 }}>{r.date}</span>
                  <span style={{ fontSize: '14px', color: '#334155', fontWeight: 600 }}>{r.value.substring(0, 25)}...</span>
                  <span style={{ background: r.st.bg, color: r.st.c, borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 800 }}>{r.st.label}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Drawer */}
      {drawerOpen && selectedReport && (
        <>
          <style>{`
            @keyframes slideIn {
              from { transform: translateX(100%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
            @keyframes fadeInOverlay {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}</style>
          <div
            onClick={handleCloseDrawer}
            style={{
              position: 'fixed', inset: 0, zIndex: 80,
              background: 'rgba(15,23,42,.5)',
              animation: 'fadeInOverlay 0.3s ease-out'
            }}></div>
          <div
            style={{
              position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 81,
              width: '480px', maxWidth: '92vw', background: '#fff',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              overflowY: 'auto', animation: 'slideIn 0.3s ease-out'
            }}
            dir="rtl">
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '22px 26px', borderBottom: '2px solid #E2E8F0',
              position: 'sticky', top: 0, background: 'linear-gradient(135deg, #fff 0%, #F9FAFB 100%)',
              flexDirection: 'row-reverse'
            }}>
              <h3 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', margin: '0 0 0 0', textAlign: 'right' }}>📋 تفاصيل التقرير</h3>
              <button
                onClick={handleCloseDrawer}
                style={{
                  background: '#F1F5F9', border: '0', borderRadius: '10px',
                  width: '38px', height: '38px', cursor: 'pointer', color: '#64748B',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#E2E8F0'
                  e.target.style.transform = 'rotate(90deg)'
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = '#F1F5F9'
                  e.target.style.transform = 'rotate(0)'
                }}>
                <CloseIcon />
              </button>
            </div>
            <div style={{ padding: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>الشركة المُبلَّغ عنها</div>
                  <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: 0 }}>{selectedReport.company}</h2>
                </div>
                <span style={{
                  background: selectedReport.st.bg, color: selectedReport.st.c,
                  borderRadius: '10px', padding: '8px 16px', fontSize: '12px',
                  fontWeight: 800
                }}>{selectedReport.st.label}</span>
              </div>

              {selectedReport.status === 'pending_review' && (
                <div style={{
                  background: 'linear-gradient(135deg, #FFF8E1 0%, #FFFBEB 100%)',
                  border: '2px solid #FDE68A', borderRadius: '12px', padding: '14px 16px',
                  marginBottom: '24px', fontSize: '14px', color: '#92400E', fontWeight: 700
                }}>
                  ⏳ التقرير قيد المراجعة — الرجاء الانتظار
                </div>
              )}

              {selectedReport.status === 'approved' && (
                <div style={{
                  background: 'linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)',
                  border: '2px solid #BBF7D0', borderRadius: '12px', padding: '14px 16px',
                  marginBottom: '24px', fontSize: '14px', color: '#15803D', fontWeight: 700
                }}>
                  ✅ تم اعتماد تقريرك! كسبت <span style={{ fontWeight: 900 }}>{selectedReport.creditsEarned}</span> نقطة ائتمان
                </div>
              )}

              {selectedReport.status === 'rejected' && (
                <div style={{
                  background: 'linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)',
                  border: '2px solid #FECACA', borderRadius: '12px', padding: '14px 16px',
                  marginBottom: '24px', fontSize: '14px', color: '#991B1B', fontWeight: 700
                }}>
                  ❌ التقرير مرفوض
                  {selectedReport.rejectionReason && (
                    <div style={{ marginTop: '10px', fontSize: '13px', fontWeight: 600, opacity: 0.9 }}>
                      <strong>السبب:</strong> {selectedReport.rejectionReason}
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                {[
                  { label: 'قيمة التعامل', value: selectedReport.value },
                  { label: 'تاريخ الإرسال', value: selectedReport.date },
                  { label: 'حالة السداد', value: selectedReport.paid },
                  { label: 'متوسط التأخير', value: selectedReport.delay },
                  { label: 'مبالغ مستحقة', value: selectedReport.due },
                  { label: 'فترة التعامل', value: selectedReport.period }
                ].map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                      borderRadius: '12px', padding: '14px',
                      border: '1px solid #E2E8F0', transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)'
                      e.currentTarget.style.borderColor = '#E0E7FF'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)'
                      e.currentTarget.style.borderColor = '#E2E8F0'
                    }}>
                    <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{item.label}</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{item.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '10px' }}>📎 المستندات المرفقة</div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                  border: '2px solid #E2E8F0', borderRadius: '12px', padding: '12px 14px',
                  color: '#64748B', transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#D1D5DB'
                  e.currentTarget.style.background = 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#E2E8F0'
                  e.currentTarget.style.background = 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)'
                }}>
                  <div style={{ flex: 'none', display: 'flex', alignItems: 'center', fontSize: '18px' }}>
                    📄
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>عقد_التعامل.pdf</span>
                </div>
              </div>

              {selectedReport.status === 'rejected' && (
                <button
                  onClick={() => {
                    handleCloseDrawer()
                    // Navigate to add-report with pre-filled data
                  }}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                    color: '#fff',
                    border: '0',
                    borderRadius: '12px',
                    padding: '14px',
                    fontSize: '14px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'translateY(-2px)'
                    e.target.style.boxShadow = '0 6px 16px rgba(22, 163, 74, 0.35)'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)'
                    e.target.style.boxShadow = '0 4px 12px rgba(22, 163, 74, 0.25)'
                  }}>
                  🔄 إعادة الإرسال
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  )
}
