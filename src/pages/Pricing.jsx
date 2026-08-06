import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabase } from '../lib/api'
import DeferredSkeleton from '../components/DeferredSkeleton'
import { SkeletonPanel } from '../components/Skeleton'
import { CheckIcon } from '../components/icons'

/**
 * The price list, read from the plans it is a list of.
 *
 * ============================================================================
 * What this replaces
 * ============================================================================
 * Four cards written by hand in src/data/mockData.js. They said 99 ر.س where the
 * plan says 1499, 299 where it says 4999, and «مخصص» where it says 9999 — three
 * prices understated by a factor of fifteen on a public page. They advertised
 * three plans that are switched off and cannot be bought, omitted one that is
 * on, and their buttons had no onClick at all.
 *
 * None of it moved when a plan was edited in the admin panel, which is the one
 * thing this product promises about itself.
 *
 * ============================================================================
 * What is shown
 * ============================================================================
 * Whatever public_plans() returns: active, publicly listed, in price order. If
 * that is one card, the page says so plainly rather than padding itself out —
 * a plan nobody can buy is not an offer, and printing it is how the old page
 * came to be wrong.
 *
 * The bullets are assembled here from the plan's own limits and features. The
 * wording is the page's business; the numbers are never retyped.
 */

// Only the limits a buyer is choosing between. The rest — pending_reports,
// compare_items — are real and are not what anyone picks a plan for, and a card
// listing every key reads as a spec sheet rather than an offer.
const HEADLINE_LIMITS = [
  ['searches_per_month', (n) => `${n} مرة فتح تقرير شهرياً`, 'فتح تقارير الشركات بلا حد'],
  ['users', (n) => `حتى ${n} مستخدمين`, 'مستخدمون بلا حد'],
  ['watchlist_items', (n) => `${n} شركة في قوائم المراقبة`, 'قوائم مراقبة بلا حد'],
]

const money = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  // No decimals on a whole number: «1499 ر.س» not «1499.00 ر.س».
  return n % 1 === 0 ? String(n) : n.toFixed(2)
}

function bulletsFor(plan, featureLabels) {
  const out = []

  for (const [key, some, unlimited] of HEADLINE_LIMITS) {
    const raw = plan.limits?.[key]
    if (raw === undefined || raw === null) continue
    const n = Number(raw)
    if (!Number.isFinite(n)) continue
    // -1 is how every plan in this schema spells "no ceiling".
    out.push(n < 0 ? unlimited : some(n))
  }

  // Adding a company or filing a report is unlimited on every plan today, and
  // saying so is the whole pitch: the registry is built by the people using it.
  if (Number(plan.limits?.reports_per_month) < 0) out.push('إرسال التقارير بلا حد')
  if (Number(plan.limits?.companies_per_month) < 0) out.push('إضافة الشركات للسجل بلا حد')

  // Feature names come from the same catalogue the entitlement check uses, so a
  // renamed feature is renamed here too. An unknown key is skipped rather than
  // printed raw — «api_access» on a price list is a leak, not a benefit.
  for (const f of plan.features || []) {
    const label = featureLabels?.[f]
    if (label) out.push(label)
  }

  if (plan.giveToGet) {
    out.push('نقاط مقابل مساهماتك تُوسّع حدّك الشهري')
  }

  return out
}

export default function Pricing() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: res, error: e } = await getSupabase().rpc('public_plans')
        if (e) throw e
        if (alive) setData(res)
      } catch (err) {
        console.error('public_plans failed:', err)
        // Said out loud. A pricing page that quietly shows nothing looks like a
        // company with no product.
        if (alive) setError('تعذّر تحميل الباقات حالياً')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const plans = data?.plans || []
  const labels = data?.featureLabels || {}

  return (
    <main style={{ maxWidth: '1240px', margin: '0 auto', padding: '60px 28px 80px' }}>
      <div style={{ marginBottom: '46px' }}>
        <h1 style={{ fontSize: '42px', fontWeight: 900, color: '#0F172A', margin: '0 0 14px', textAlign: 'right' }}>
          باقات تناسب كل حجم أعمال
        </h1>
        <p style={{ fontSize: '18px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          ابدأ مجاناً وارتقِ متى احتجت تقارير أعمق وأدوات أقوى
        </p>
      </div>

      {loading && (
        <DeferredSkeleton>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '20px' }}>
            <SkeletonPanel rows={5} />
            <SkeletonPanel rows={5} />
            <SkeletonPanel rows={5} />
          </div>
        </DeferredSkeleton>
      )}

      {!loading && error && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '16px', padding: '26px', textAlign: 'right' }}>
          <div style={{ fontSize: '16px', fontWeight: 900, color: '#92400E', marginBottom: '8px' }}>⚠️ {error}</div>
          <p style={{ fontSize: '14.5px', color: '#334155', lineHeight: 1.9, margin: '0 0 16px' }}>
            الأسعار تُقرأ من النظام مباشرة، ولم يستجب الآن. أعد المحاولة، أو تواصل معنا وسنرسل لك التفاصيل.
          </p>
          <button onClick={() => window.location.reload()}
            style={{ background: '#0F172A', color: '#fff', border: 0, borderRadius: '10px', padding: '11px 26px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {!loading && !error && plans.length === 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '30px', textAlign: 'right' }}>
          <div style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', marginBottom: '8px' }}>
            لا توجد باقات معروضة حالياً
          </div>
          <p style={{ fontSize: '14.5px', color: '#64748B', lineHeight: 1.9, margin: '0 0 18px' }}>
            تواصل معنا وسنرتّب لك الوصول المناسب لحجم أعمالك.
          </p>
          <button onClick={() => navigate('/contact')}
            style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '12px 28px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            تواصل معنا
          </button>
        </div>
      )}

      {!loading && !error && plans.length > 0 && (
        <div style={{
          display: 'grid',
          // Sized to what came back. A four-column grid holding one card leaves
          // it stranded at the edge of an empty row.
          gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 280px), ${plans.length > 2 ? '1fr' : '360px'}))`,
          gap: '20px',
          alignItems: 'start',
          justifyContent: 'start',
        }}>
          {plans.map((p) => {
            const free = Number(p.priceMonthly) === 0
            const bullets = bulletsFor(p, labels)
            return (
              <div key={p.code} style={{
                background: '#fff',
                border: p.isDefault ? '2px solid #16A34A' : '1px solid #E2E8F0',
                borderRadius: '18px',
                padding: '30px 26px',
                position: 'relative',
                boxShadow: p.isDefault ? '0 12px 32px rgba(22,163,74,.15)' : '0 4px 12px rgba(15,23,42,.06)',
              }}>
                {p.isDefault && (
                  <div style={{ position: 'absolute', top: '-13px', insetInlineStart: '26px', background: '#16A34A', color: '#fff', fontSize: '12.5px', fontWeight: 800, padding: '6px 14px', borderRadius: '999px' }}>
                    ابدأ من هنا
                  </div>
                )}

                <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#1E2A52', margin: '0 0 6px', textAlign: 'right' }}>
                  {p.name}
                </h2>
                <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 18px', minHeight: '42px', lineHeight: 1.6, textAlign: 'right' }}>
                  {p.description || ''}
                </p>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '22px' }}>
                  <span style={{ fontSize: '36px', fontWeight: 900, color: '#0F172A' }}>
                    {free ? 'مجاناً' : money(p.priceMonthly)}
                  </span>
                  {!free && (
                    <span style={{ fontSize: '14px', color: '#64748B', fontWeight: 600 }}>ر.س/شهرياً</span>
                  )}
                </div>

                {/* These used to have no handler at all. */}
                <button
                  onClick={() => navigate(free ? '/register' : '/contact')}
                  style={{
                    width: '100%', border: 0, borderRadius: '11px', padding: '13px',
                    fontSize: '15px', fontWeight: 800, cursor: 'pointer', marginBottom: '22px',
                    background: p.isDefault ? '#16A34A' : '#1E2A52', color: '#fff',
                    transition: 'opacity .2s', fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                >
                  {free ? 'ابدأ الآن' : 'تواصل معنا'}
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
                  {bullets.map((b, j) => (
                    <div key={j} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start' }}>
                      <span style={{ color: '#16A34A', fontWeight: 900, flex: 'none', marginTop: '1px', display: 'flex', alignItems: 'center' }}>
                        <CheckIcon />
                      </span>
                      <span style={{ fontSize: '14px', color: '#334155', lineHeight: 1.5, textAlign: 'right' }}>
                        {b}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && !error && plans.length > 0 && (
        <p style={{ fontSize: '13px', color: '#94A3B8', marginTop: '28px', textAlign: 'right' }}>
          البحث عن الشركات بلا حد في كل الباقات. المحتسَب هو فتح تقرير الثقة الكامل لشركة.
        </p>
      )}
    </main>
  )
}
