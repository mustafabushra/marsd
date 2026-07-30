import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabase } from '../lib/api'

/**
 * What the company's record is missing, and what each gap is worth.
 *
 * A permanent "أكمل ملفك" banner is ignored inside a week — people learn to skip
 * a bar that says the same thing every day. What is not ignored is a number
 * attached to an action, so every gap here carries the points it would actually
 * add, read from the same rules the score itself uses. An operator who changes a
 * weight changes what the company is told in the same moment.
 *
 * It disappears at 100%. A card that stays after there is nothing left to do is
 * the thing that teaches people to stop reading cards.
 */
export default function ProfileCompletion() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: d } = await getSupabase().rpc('company_profile_completion')
        if (alive) setData(d || null)
      } catch (err) {
        console.warn('Profile completion warning:', err)
      }
    })()
    return () => { alive = false }
  }, [])

  if (!data?.has_company) return null

  const pct = Number(data.percent) || 0
  const gaps = data.gaps || []
  const points = Number(data.points_available) || 0
  const official = data.official_status || {}
  const flagged = official.status && official.status !== 'none'

  // Nothing left to say.
  if (!gaps.length && !flagged) return null

  const OFFICIAL_AR = {
    insolvency: 'تعثّر مالي', bankruptcy: 'إفلاس', liquidation: 'تصفية',
    suspended: 'إيقاف نشاط', struck_off: 'شطب السجل',
  }

  // The biggest wins first: a company reads three lines, not twelve.
  const top = [...gaps].sort((a, b) => Number(b.points) - Number(a.points)).slice(0, 4)

  return (
    <div style={{ marginBottom: '18px' }}>
      {flagged && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '16px 18px', marginBottom: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: 900, color: '#B91C1C', marginBottom: '6px' }}>
            حالة رسمية مسجَّلة على شركتك: {OFFICIAL_AR[official.status] || official.status}
          </div>
          <div style={{ fontSize: '13px', color: '#7F1D1D', lineHeight: 1.8 }}>
            {official.note || 'سجّلتها إدارة مرصد.'} وهي تظهر في تقرير ثقتك للمشتركين.
            إن كانت غير صحيحة، تواصل مع إدارة مرصد بالمستندات المُثبِتة.
          </div>
        </div>
      )}

      {gaps.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: 0 }}>أكمل ملف شركتك</h3>
            <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#15803D', fontVariantNumeric: 'tabular-nums' }}>
              +{points % 1 === 0 ? points : points.toFixed(1)} نقطة متاحة في مؤشرك
            </div>
          </div>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 14px' }}>
            كل بند أدناه يرفع مؤشر ثقتك بالرقم المذكور بجانبه — ومؤشرك هو ما يراه من يفكّر في التعامل معك.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ flex: 1, height: '9px', background: '#F1F5F9', borderRadius: '5px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct >= 70 ? '#16A34A' : pct >= 40 ? '#F59E0B' : '#DC2626', borderRadius: '5px' }}></div>
            </div>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#334155', fontVariantNumeric: 'tabular-nums' }}>
              {data.completed}/{data.total}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {top.map((g) => (
              <button key={g.key} onClick={() => navigate('/profile')}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
                        background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px',
                        padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right', width: '100%',
                      }}>
                <span>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{g.label}</span>
                  {g.hint && <span style={{ display: 'block', fontSize: '12px', color: '#94A3B8', marginTop: '3px' }}>{g.hint}</span>}
                </span>
                <span style={{ fontSize: '13.5px', fontWeight: 900, color: '#15803D', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  +{Number(g.points) % 1 === 0 ? Number(g.points) : Number(g.points).toFixed(1)}
                </span>
              </button>
            ))}
          </div>

          {gaps.length > top.length && (
            <div style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 600, marginTop: '12px' }}>
              و{gaps.length - top.length} بنداً آخر في صفحة الملف
            </div>
          )}
        </div>
      )}
    </div>
  )
}
