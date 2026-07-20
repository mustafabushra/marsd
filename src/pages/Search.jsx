import { useState, useEffect } from 'react'
import { searchCompanies } from '../lib/api'

export default function Search() {
  const [companies, setCompanies] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Map score to risk band and color
  function getRiskInfo(score) {
    if (score >= 70) return { label: 'مخاطر منخفضة', bg: '#ECFDF5', color: '#15803D' }
    if (score >= 40) return { label: 'مخاطر متوسطة', bg: '#FFFBEB', color: '#B45309' }
    return { label: 'مخاطر عالية', bg: '#FEE2E2', color: '#DC2626' }
  }

  // Calculate gauge gradient from score percentage
  function getGaugeGradient(score) {
    const percent = Math.min(Math.max(score, 0), 100)
    return `conic-gradient(#16A34A 0% ${percent}%, #E2E8F0 ${percent}% 100%)`
  }

  async function handleSearch() {
    setLoading(true)
    setError(null)
    try {
      const result = await searchCompanies(query)
      const formatted = result.data.map(c => {
        const trustScore = c.trust_score

        // Handle missing trust score
        if (!trustScore) {
          return {
            id: c.id,
            name: c.name,
            sector: c.sector,
            city: c.city,
            scoreText: '—',
            gaugeBg: 'conic-gradient(#E2E8F0 0% 100%)',
            riskLabel: 'بيانات غير كافية',
            bg: '#F3F4F6',
            color: '#6B7280',
            reports: 'لا توجد تقارير',
            hasData: false,
            isIncomplete: true
          }
        }

        // Use real trust score data
        const score = trustScore.score
        const risk = getRiskInfo(score)
        const reportsCount = trustScore.approvedReports || 0

        return {
          id: c.id,
          name: c.name,
          sector: c.sector,
          city: c.city,
          scoreText: score.toString(),
          gaugeBg: getGaugeGradient(score),
          riskLabel: risk.label,
          bg: risk.bg,
          color: risk.color,
          reports: `${reportsCount} ${reportsCount === 1 ? 'تقرير' : 'تقارير'}`,
          hasData: true,
          isIncomplete: false,
          trustScore
        }
      })
      setCompanies(formatted)
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء البحث')
      setCompanies([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (query.length > 0) {
      const timer = setTimeout(handleSearch, 500)
      return () => clearTimeout(timer)
    } else {
      setCompanies([])
    }
  }, [query])

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '22px 28px' }}>
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexDirection: 'row-reverse' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '11px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '0 16px', flexDirection: 'row-reverse' }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالاسم أو رقم السجل التجاري"
              style={{ flex: 1, border: 0, background: 'transparent', padding: '14px 0', fontSize: '15.5px', outline: 'none', fontFamily: 'inherit', textAlign: 'right' }}
            />
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="m21 21-4.3-4.3"></path>
            </svg>
          </div>
          <button style={{ background: '#1E2A52', color: '#fff', border: 0, borderRadius: '12px', padding: '0 30px', fontSize: '15px', fontWeight: 800, cursor: 'pointer' }}>بحث</button>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flexDirection: 'row-reverse' }}>
          <span style={{ fontSize: '13.5px', color: '#94A3B8', fontWeight: 700, padding: '8px 0' }}>تصفية:</span>
          <span style={{ background: '#EEF2FF', color: '#1E2A52', borderRadius: '999px', padding: '8px 16px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' }}>القطاع ▾</span>
          <span style={{ background: '#EEF2FF', color: '#1E2A52', borderRadius: '999px', padding: '8px 16px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' }}>المدينة ▾</span>
          <span style={{ background: '#EEF2FF', color: '#1E2A52', borderRadius: '999px', padding: '8px 16px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' }}>مستوى المخاطر ▾</span>
          <span style={{ background: '#EEF2FF', color: '#1E2A52', borderRadius: '999px', padding: '8px 16px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' }}>مؤشر الثقة ▾</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ fontSize: '14.5px', color: '#64748B', fontWeight: 700 }}>
            {loading ? 'جاري البحث...' : `${companies.length} نتائج`}
          </div>
          <button style={{ display: 'flex', alignItems: 'center', gap: '7px', background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '9px 16px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer' }}>+ إضافة شركة</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '8px 14px', fontSize: '13.5px', fontWeight: 700, color: '#B45309' }}>عمليات بحث متبقية: 128 من 200</div>
      </div>

      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', fontSize: '14px', color: '#DC2626', fontWeight: 600 }}>
          خطأ: {error}
        </div>
      )}

      {!loading && query.length > 0 && companies.length === 0 && !error && (
        <div style={{ background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px 16px', marginBottom: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#64748B', fontWeight: 600 }}>لم يتم العثور على نتائج</div>
          <div style={{ fontSize: '13px', color: '#94A3B8', marginTop: '6px' }}>حاول البحث برقم سجل تجاري أو اسم آخر</div>
        </div>
      )}

      <div style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 600, margin: '-6px 0 16px' }}>لم تجد الشركة التي تبحث عنها؟ أضفها للسجل لتتمكّن من تقييمها وإضافة تقرير عنها.</div>

      {companies.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
          {companies.map((c) => (
            <div key={c.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: '14px', marginBottom: '18px' }}>
                <div style={{ width: '78px', height: '78px', borderRadius: '50%', background: c.gaugeBg, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '58px', height: '58px', borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '21px', fontWeight: 900, color: '#1E2A52', lineHeight: 1 }}>{c.scoreText}</span>
                    <span style={{ fontSize: '9.5px', color: '#94A3B8' }}>من 100</span>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '0 0 7px', lineHeight: 1.4 }}>{c.name}</h3>
                  <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                    <span style={{ background: '#F1F5F9', color: '#475569', borderRadius: '6px', padding: '3px 9px', fontSize: '12px', fontWeight: 700 }}>{c.sector}</span>
                    <span style={{ background: '#F1F5F9', color: '#475569', borderRadius: '6px', padding: '3px 9px', fontSize: '12px', fontWeight: 700 }}>{c.city}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <span style={{ background: c.bg, color: c.color, borderRadius: '999px', padding: '6px 14px', fontSize: '13px', fontWeight: 800 }}>● {c.riskLabel}</span>
                <span style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 600 }}>{c.reports}</span>
              </div>
              {c.hasData && <button style={{ marginTop: 'auto', width: '100%', background: '#1E2A52', color: '#fff', border: 0, borderRadius: '10px', padding: '11px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>عرض التقرير</button>}
              {c.isIncomplete && <button style={{ marginTop: 'auto', width: '100%', background: '#fff', color: '#B45309', border: '1.5px solid #FDE68A', borderRadius: '10px', padding: '11px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer' }}>طلب إضافة بيانات / تقرير</button>}
            </div>
          ))}
        </div>
      )}

      <div style={{ background: '#fff', border: '1.5px dashed #CBD5E1', borderRadius: '16px', padding: '28px', marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '13px', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flex: 'none' }}>🔎</div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '3px' }}>لم تجد الشركة التي تبحث عنها؟</div>
            <div style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.6 }}>أضِفها لسجل مرصد — بعد موافقة الإدارة تصبح متاحة للجميع، ويمكنك تقييمها مباشرة.</div>
          </div>
        </div>
        <button style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '11px', padding: '13px 26px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', flex: 'none' }}>+ إضافة شركة للسجل</button>
      </div>
    </main>
  )
}
