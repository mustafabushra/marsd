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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        جاري التحميل...
      </div>
    )
  }

  if (error || !report) {
    return (
      <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '22px 28px' }}>
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#991B1B' }}>⚠️ {error || 'لم يتم العثور على البيانات'}</div>
          <button onClick={() => navigate('/search')} style={{ marginTop: '12px', background: '#991B1B', color: '#fff', border: 0, borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>العودة للبحث</button>
        </div>
      </main>
    )
  }

  const tier = report.status === 'full' ? 'full' : report.status === 'limited' ? 'locked' : report.tier === 'preliminary' ? 'prelim' : 'none'
  const score = report.score || 0

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '22px 28px' }}>
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '30px', marginBottom: '18px' }}>
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
                background: canPerform(role, 'canAddReport') && systemStatus.subscriptionActive && systemStatus.accountActive && systemStatus.creditsBalance > 0 ? '#3B82F6' : '#D1D5DB',
                color: '#fff',
                border: 0,
                borderRadius: '10px',
                padding: '11px 18px',
                fontSize: '14px',
                fontWeight: 800,
                cursor: canPerform(role, 'canAddReport') && systemStatus.subscriptionActive ? 'pointer' : 'not-allowed',
                opacity: canPerform(role, 'canAddReport') && systemStatus.subscriptionActive ? 1 : 0.6
              }}>
              + إضافة تقرير
            </button>
            <button style={{ background: '#fff', color: '#1E2A52', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 18px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>⭐ قائمة المراقبة</button>
            <button style={{ background: '#fff', color: '#1E2A52', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 18px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>⬇ تحميل PDF</button>
          </div>
        </div>
      </div>

      {tier === 'none' && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '16px', padding: '26px', textAlign: 'center' }}>
          <div style={{ fontSize: '17px', fontWeight: 900, color: '#B45309', marginBottom: '8px' }}>⚠ بيانات غير كافية لإصدار تقييم موثوق</div>
          <p style={{ fontSize: '14.5px', color: '#92400E', margin: '0 0 0 0', lineHeight: 1.7, textAlign: 'right' }}>عدد التقارير المعتمدة الحالية (3) أقل من الحد الأدنى المطلوب (5 تقارير). ساهم بتقريرك لمساعدة المجتمع على بناء تقييم دقيق.</p>
        </div>
      )}

      {tier === 'full' && (
        <>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 0 0', textAlign: 'right' }}>تركيبة مؤشر الثقة</h3>
              <span style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 600 }}>كيف تم احتساب الدرجة</span>
            </div>
            <div style={{ display: 'flex', borderRadius: '12px', overflow: 'hidden', height: '52px' }}>
              <div style={{ width: '30%', background: '#1E2A52', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '14px' }}>البيانات الرسمية 30%</div>
              <div style={{ width: '50%', background: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '14px' }}>بيانات المجتمع 50%</div>
              <div style={{ width: '20%', background: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '14px' }}>المنصة 20%</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '18px' }}>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '20px' }}>
              <div style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 700, marginBottom: '8px' }}>الشركات التي قدّمت تقارير</div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#1E2A52' }}>18</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '20px' }}>
              <div style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 700, marginBottom: '8px' }}>عدد التقارير المعتمدة</div>
              <div style={{ fontSize: '30px', fontWeight: 900, color: '#1E2A52' }}>34</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '62px', height: '62px', borderRadius: '50%', background: 'conic-gradient(#16A34A 0% 94%,#E2E8F0 94% 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 900, color: '#15803D' }}>94%</div>
              </div>
              <div>
                <div style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 700 }}>نسبة الالتزام بالسداد</div>
                <div style={{ fontSize: '13px', color: '#16A34A', fontWeight: 800, marginTop: '3px' }}>ممتازة</div>
              </div>
            </div>
          </div>

          {/* Reports Summary */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '18px' }}>
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
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 18px 0', textAlign: 'right' }}>اتجاهات الأداء</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {trends.slice(0, 6).map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#F8FAFC', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ fontSize: '16px' }}>
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
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '12px',
                      fontWeight: 700
                    }}>
                      {item.trend_direction === 'improving' ? 'تحسّن' : item.trend_direction === 'declining' ? 'تراجع' : 'مستقر'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          {timeline.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px' }}>
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
