import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCompanyKnowledgeBase, getCompanyReportsTimeline, getCompanyTrends, getCompanyReportsSummary } from '../lib/api'
import { DocumentIcon } from '../components/icons'
import { useUserRole } from '../hooks/useUserRole'
import { useSystemStatus } from '../hooks/useSystemStatus'
import { canPerform } from '../utils/roles'

export default function TrustReport() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role } = useUserRole()
  const systemStatus = useSystemStatus()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [company, setCompany] = useState(null)
  const [report, setReport] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [trends, setTrends] = useState([])
  const [summary, setSummary] = useState([])

  useEffect(() => {
    const loadReport = async () => {
      try {
        if (!id) {
          setError('معرّف الشركة مفقود')
          setLoading(false)
          return
        }

        // Load complete company profile from Knowledge Base (single source of truth)
        const kb = await getCompanyKnowledgeBase(id)
        if (!kb) {
          setError('الشركة غير موجودة')
          setLoading(false)
          return
        }

        // Set company data from Knowledge Base
        setCompany({
          id: kb.id,
          name: kb.name,
          city: kb.city || '—',
          sector: kb.sector || '—',
          cr_number: kb.cr_number
        })

        // Build report object from Knowledge Base data
        const reportObj = {
          status: kb.total_reports_count >= 5 ? 'full' : kb.total_reports_count >= 2 ? 'preliminary' : 'limited',
          tier: kb.trust_tier || 'none',
          score: kb.trust_score || 0,
          approvedReports: kb.approved_reports_count || 0
        }
        setReport(reportObj)

        // Load Timeline, Trends, and Summary in parallel
        const [timelineData, trendsData, summaryData] = await Promise.all([
          getCompanyReportsTimeline(id, 8),
          getCompanyTrends(id),
          getCompanyReportsSummary(id),
        ])

        setTimeline(timelineData.data || [])
        setTrends(trendsData.data || [])
        setSummary(summaryData.data || [])
      } catch (err) {
        setError(err.message || 'خطأ في تحميل البيانات')
      } finally {
        setLoading(false)
      }
    }

    loadReport()
  }, [id])

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
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#64748B' }}>جاري تحميل بيانات الشركة...</div>
        </div>
      </main>
    )
  }

  if (error || !report) {
    return (
      <main style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)', minHeight: '100vh', padding: '32px 28px' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto', background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)', border: '2px solid #FECACA', borderRadius: '16px', padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#991B1B', marginBottom: '12px' }}>{error || 'لم يتم العثور على البيانات'}</div>
          <p style={{ fontSize: '14px', color: '#DC2626', marginBottom: '24px', lineHeight: '1.6' }}>قد تكون الشركة لم تعد متوفرة أو قد يكون هناك خطأ في الوصول إليها.</p>
          <button
            onClick={() => navigate('/search')}
            style={{
              background: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)',
              color: '#fff', border: 0, borderRadius: '12px', padding: '14px 28px',
              fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 12px rgba(156, 27, 27, 0.25)'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-2px)'
              e.target.style.boxShadow = '0 6px 16px rgba(156, 27, 27, 0.35)'
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)'
              e.target.style.boxShadow = '0 4px 12px rgba(156, 27, 27, 0.25)'
            }}>
            ← العودة للبحث
          </button>
        </div>
      </main>
    )
  }

  const tier = report.status === 'full' ? 'full' : report.status === 'limited' ? 'locked' : report.tier === 'preliminary' ? 'prelim' : 'none'
  const score = report.score || 0

  return (
    <main style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)', minHeight: '100vh', padding: '28px 28px' }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div style={{
        background: '#fff', border: '2px solid #E2E8F0', borderRadius: '20px', padding: '32px',
        marginBottom: '24px', boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        animation: 'fadeIn 0.6s ease-out'
      }}>
        <div style={{ display: 'flex', gap: '28px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: '66px', height: '66px', borderRadius: '16px', background: '#1E2A52', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', fontWeight: 900, flex: 'none' }}>
            {company?.name.charAt(0)}
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', margin: '0 0 0 0', textAlign: 'right' }}>{company?.name}</h1>
              <span style={{ background: '#ECFDF5', color: '#15803D', borderRadius: '7px', padding: '4px 11px', fontSize: '12.5px', fontWeight: 800 }}>● سجل نشط</span>
            </div>
            <div style={{ display: 'flex', gap: '22px', flexWrap: 'wrap', fontSize: '14px', color: '#64748B', fontWeight: 600 }}>
              <span>القطاع: {company?.sector || '—'}</span>
              <span>المدينة: {company?.city || '—'}</span>
              <span>السجل: {company?.cr_number || '—'}</span>
            </div>
          </div>

          {tier === 'none' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', background: '#F8FAFC', border: '1.5px dashed #CBD5E1', borderRadius: '16px', padding: '24px 30px', minWidth: '240px' }}>
              <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🔒</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#64748B', textAlign: 'center', lineHeight: 1.5 }}>لا توجد بيانات معتمدة كافية<br />لإصدار تقييم موثوق</div>
            </div>
          )}

          {tier === 'full' && (
            <div style={{ textAlign: 'center', flex: 'none' }}>
              <div style={{ width: '140px', height: '140px', borderRadius: '50%', background: `conic-gradient(#16A34A 0% ${Math.min(score, 100)}%,#E2E8F0 ${Math.min(score, 100)}% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '108px', height: '108px', borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '42px', fontWeight: 900, color: '#1E2A52', lineHeight: 1 }}>{Math.round(score)}</span>
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>من 100</span>
                </div>
              </div>
              <div style={{ background: '#ECFDF5', color: '#15803D', borderRadius: '999px', padding: '6px 16px', fontSize: '13.5px', fontWeight: 800, marginTop: '12px' }}>● مخاطر منخفضة</div>
            </div>
          )}

          {tier === 'prelim' && (
            <div style={{ textAlign: 'center', flex: 'none' }}>
              <div style={{ width: '140px', height: '140px', borderRadius: '50%', background: `conic-gradient(#F59E0B 0% ${Math.min(score, 100)}%,#E2E8F0 ${Math.min(score, 100)}% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '108px', height: '108px', borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '42px', fontWeight: 900, color: '#1E2A52', lineHeight: 1 }}>{Math.round(score)}</span>
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>من 100</span>
                </div>
              </div>
              <div style={{ background: '#FFFBEB', color: '#B45309', borderRadius: '999px', padding: '6px 16px', fontSize: '12.5px', fontWeight: 800, marginTop: '12px' }}>تقييم أولي — ثقة متوسطة</div>
            </div>
          )}

          {tier === 'locked' && (
            <div style={{ textAlign: 'center', flex: 'none', position: 'relative' }}>
              <div style={{ width: '140px', height: '140px', borderRadius: '50%', background: `conic-gradient(#16A34A 0% 50%,#E2E8F0 50% 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'blur(7px)' }}>
                <div style={{ width: '108px', height: '108px', borderRadius: '50%', background: '#fff' }}></div>
              </div>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '34px' }}>🔒</div>
              <div style={{ background: '#EEF2FF', color: '#3730A3', borderRadius: '999px', padding: '6px 16px', fontSize: '12.5px', fontWeight: 800, marginTop: '12px' }}>متاح في الباقة الأساسية</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '20px', marginTop: '22px', paddingTop: '22px', borderTop: '1px solid #F1F5F9', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#334155' }}>مستوى موثوقية التقرير</span>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#16A34A' }}>{report?.approvedReports || 0} تقرير معتمد</span>
            </div>
            <div style={{ height: '9px', background: '#F1F5F9', borderRadius: '6px', overflow: 'hidden' }}>
              <div style={{ width: Math.min(((report?.approvedReports || 0) / 50) * 100, 100) + '%', height: '100%', background: 'linear-gradient(90deg,#16A34A,#4ADE80)', borderRadius: '6px' }}></div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                const canAdd = canPerform(role, 'canAddReport') && systemStatus.subscriptionActive && systemStatus.accountActive && systemStatus.creditsBalance > 0
                if (canAdd) {
                  navigate('/add-report', { state: { companyId: id, companyName: company?.name } })
                }
              }}
              disabled={!canPerform(role, 'canAddReport') || !systemStatus.subscriptionActive || !systemStatus.accountActive || systemStatus.creditsBalance <= 0}
              style={{
                background: canPerform(role, 'canAddReport') && systemStatus.subscriptionActive && systemStatus.accountActive && systemStatus.creditsBalance > 0 ? 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' : '#D1D5DB',
                color: '#fff',
                border: '0',
                borderRadius: '12px',
                padding: '13px 22px',
                fontSize: '14px',
                fontWeight: 800,
                cursor: canPerform(role, 'canAddReport') && systemStatus.subscriptionActive ? 'pointer' : 'not-allowed',
                opacity: canPerform(role, 'canAddReport') && systemStatus.subscriptionActive ? 1 : 0.6,
                transition: 'all 0.3s ease',
                boxShadow: (canPerform(role, 'canAddReport') && systemStatus.subscriptionActive) ? '0 4px 12px rgba(59, 130, 246, 0.25)' : 'none'
              }}
              onMouseEnter={(e) => {
                if (canPerform(role, 'canAddReport') && systemStatus.subscriptionActive) {
                  e.target.style.transform = 'translateY(-2px)'
                  e.target.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.35)'
                }
              }}
              onMouseLeave={(e) => {
                if (canPerform(role, 'canAddReport') && systemStatus.subscriptionActive) {
                  e.target.style.transform = 'translateY(0)'
                  e.target.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.25)'
                }
              }}>
              + إضافة تقرير
            </button>
            <button style={{
              background: '#EEF2FF', color: '#3730A3', border: '2px solid #E0E7FF', borderRadius: '12px', padding: '13px 22px',
              fontSize: '14px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = '#E0E7FF'
              e.target.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.target.style.background = '#EEF2FF'
              e.target.style.transform = 'translateY(0)'
            }}>
              ⭐ قائمة المراقبة
            </button>
            <button style={{
              background: '#F0FAFF', color: '#0369A1', border: '2px solid #CFF0FF', borderRadius: '12px', padding: '13px 22px',
              fontSize: '14px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = '#E0F2FE'
              e.target.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.target.style.background = '#F0FAFF'
              e.target.style.transform = 'translateY(0)'
            }}>
              ⬇ تحميل PDF
            </button>
          </div>
        </div>
      </div>

      {tier === 'none' && (
        <div style={{
          background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
          border: '2px solid #FDE68A', borderRadius: '16px', padding: '28px', textAlign: 'center',
          boxShadow: '0 4px 16px rgba(180, 83, 9, 0.1)',
          animation: 'fadeIn 0.6s ease-out'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
          <div style={{ fontSize: '18px', fontWeight: 900, color: '#B45309', marginBottom: '12px' }}>بيانات غير كافية</div>
          <p style={{ fontSize: '14px', color: '#92400E', margin: '0 0 0 0', lineHeight: 1.7, textAlign: 'right' }}>عدد التقارير المعتمدة الحالية (3) أقل من الحد الأدنى المطلوب (5 تقارير). ساهم بتقريرك لمساعدة المجتمع على بناء تقييم دقيق.</p>
        </div>
      )}

      {tier === 'full' && (
        <>
          <div style={{
            background: '#fff', border: '2px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '20px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.06)', animation: 'fadeIn 0.6s ease-out 0.1s both'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 0 0', textAlign: 'right' }}>📊 تركيبة مؤشر الثقة</h3>
              <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600, background: '#F1F5F9', padding: '6px 12px', borderRadius: '6px' }}>كيف تم احتساب الدرجة</span>
            </div>
            <div style={{ display: 'flex', borderRadius: '12px', overflow: 'hidden', height: '52px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div style={{ width: '30%', background: 'linear-gradient(135deg, #1E2A52 0%, #293E5B 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '13px', textAlign: 'center', padding: '0 8px' }}>البيانات الرسمية 30%</div>
              <div style={{ width: '50%', background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '13px', textAlign: 'center', padding: '0 8px' }}>بيانات المجتمع 50%</div>
              <div style={{ width: '20%', background: 'linear-gradient(135deg, #64748B 0%, #475569 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '13px', textAlign: 'center', padding: '0 8px' }}>المنصة 20%</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
            {[
              { icon: '🏢', label: 'الشركات التي قدّمت تقارير', value: '18' },
              { icon: '✅', label: 'عدد التقارير المعتمدة', value: '34' },
              { icon: '📈', label: 'نسبة الالتزام بالسداد', value: '94%', highlight: true }
            ].map((stat, idx) => (
              <div
                key={idx}
                style={{
                  background: '#fff', border: '2px solid #E2E8F0', borderRadius: '14px', padding: '20px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  transition: 'all 0.3s ease',
                  animation: `fadeIn 0.6s ease-out ${0.2 + idx * 0.1}s both`
                }}
              >
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>{stat.icon}</div>
                <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, marginBottom: '8px' }}>{stat.label}</div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: '#1E2A52' }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Reports Summary */}
          <div style={{
            background: '#fff', border: '2px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '20px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.06)', animation: 'fadeIn 0.6s ease-out 0.3s both'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 18px 0', textAlign: 'right' }}>ملخص التقارير</h3>
            {summary.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                {summary.map((item, idx) => (
                  <div key={idx} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', marginBottom: '6px' }}>{item.icon}</div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: item.color, marginBottom: '4px' }}>{item.count}</div>
                    <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>{item.category}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: '#94A3B8' }}>لا توجد تقارير بعد</div>
            )}
          </div>

          {/* Trends */}
          {trends.length > 0 && (
            <div style={{
              background: '#fff', border: '2px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '20px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)', animation: 'fadeIn 0.6s ease-out 0.4s both'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 18px 0', textAlign: 'right' }}>📈 اتجاهات الأداء</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {trends.slice(0, 6).map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px',
                      background: '#F8FAFC', borderRadius: '12px', transition: 'all 0.3s ease',
                      border: '1px solid #E2E8F0'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#F1F5F9'
                      e.currentTarget.style.transform = 'translateX(-4px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#F8FAFC'
                      e.currentTarget.style.transform = 'translateX(0)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ fontSize: '18px' }}>
                        {item.trend_direction === 'improving' ? '📈' : item.trend_direction === 'declining' ? '📉' : '➡️'}
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{item.period_month}</div>
                        <div style={{ fontSize: '12px', color: '#64748B' }}>{item.avg_score}% • {item.approved_reports} تقرير</div>
                      </div>
                    </div>
                    <div style={{
                      background: item.trend_direction === 'improving' ? '#ECFDF5' : item.trend_direction === 'declining' ? '#FEE2E2' : '#F1F5F9',
                      color: item.trend_direction === 'improving' ? '#15803D' : item.trend_direction === 'declining' ? '#DC2626' : '#64748B',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 700
                    }}>
                      {item.trend_direction === 'improving' ? '✓ تحسّن' : item.trend_direction === 'declining' ? '✗ تراجع' : '→ مستقر'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          {timeline.length > 0 && (
            <div style={{
              background: '#fff', border: '2px solid #E2E8F0', borderRadius: '16px', padding: '24px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)', animation: 'fadeIn 0.6s ease-out 0.5s both'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 18px 0', textAlign: 'right' }}>آخر التقارير</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {timeline.map((report, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '14px', paddingBottom: '14px', borderBottom: idx < timeline.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', fontSize: '18px' }}>
                      {report.severity === 'دفع متأخر' ? '💳' : report.severity === 'عدم التزام' ? '⚠️' : report.severity === 'ممتاز' ? '⭐' : report.severity === 'قضايا' ? '⚔️' : '📋'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                        <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>
                          {new Date(report.created_at).toLocaleDateString('ar-SA')}
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{report.title}</div>
                      </div>
                      <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5, marginBottom: '6px' }}>
                        {report.summary}
                      </div>
                      <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>
                        من {report.reporter_company_name}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  )
}
