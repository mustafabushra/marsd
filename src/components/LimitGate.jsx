import { useNavigate } from 'react-router-dom'
import { SkeletonPage } from './Skeleton'

/**
 * What a user sees when a plan limit stops them.
 *
 * A gate that simply hides a control teaches nothing: the feature looks broken
 * or absent rather than unavailable on this plan, and the user has no idea what
 * would change that. Every gate in the app renders through here so the answer is
 * always the same three things — what stopped you, what your plan allows, and
 * the one action that lifts it.
 *
 * On Give-to-Get that action is contributing data, not paying, so the wording
 * follows the plan rather than always pushing an upgrade.
 */

const S = {
  card: {
    background: '#FFFBEB',
    border: '1px solid #FDE68A',
    borderRadius: '14px',
    padding: '22px 24px',
    textAlign: 'center',
  },
  title: { fontSize: '16px', fontWeight: 900, color: '#92400E', margin: '0 0 8px' },
  body: { fontSize: '14px', color: '#78350F', lineHeight: 1.9, margin: '0 0 18px' },
  actions: { display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' },
  primary: {
    background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px',
    padding: '11px 24px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
  },
  secondary: {
    background: '#fff', color: '#92400E', border: '1px solid #FDE68A', borderRadius: '10px',
    padding: '11px 24px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
  },
}

export function LimitReached({ title, detail, giveToGet, contributeTo = '/add-company' }) {
  const navigate = useNavigate()

  return (
    <div style={S.card}>
      <h2 style={S.title}>⚠️ {title}</h2>
      <p style={S.body}>{detail}</p>
      <div style={S.actions}>
        {giveToGet && (
          <button style={S.primary} onClick={() => navigate(contributeTo)}>
            اكسب رصيداً بالمساهمة
          </button>
        )}
        <button style={giveToGet ? S.secondary : S.primary} onClick={() => navigate('/subscription')}>
          {giveToGet ? 'عرض الباقات' : 'ترقية الباقة'}
        </button>
      </div>
    </div>
  )
}

/** The plan does not include this feature at all. */
export function FeatureLocked({ feature, featureName }) {
  const navigate = useNavigate()

  return (
    <div style={S.card}>
      <h2 style={S.title}>🔒 {featureName || feature} غير متاحة في باقتك</h2>
      <p style={S.body}>
        هذه الميزة تأتي مع الباقات المدفوعة. اطّلع على ما تشمله كل باقة واختر ما يناسب حجم عملك.
      </p>
      <div style={S.actions}>
        <button style={S.primary} onClick={() => navigate('/subscription')}>عرض الباقات</button>
      </div>
    </div>
  )
}

/**
 * Wraps a screen whose whole content depends on the plan including a feature.
 *
 * Every gate on this platform was written as `if (!loading && !can(x)) return
 * <Locked/>`, which reads correctly and behaves backwards. While the plan is
 * still being fetched, `loading` is true, so the condition is false, so the
 * component falls through and renders the feature. Comparison showed a free
 * member the full comparison table for as long as the lookup took — Clerk, then
 * a query for the tenant, then the plan itself — and then replaced it with a
 * lock. The user reported it as the screen locking ten seconds after opening,
 * which is exactly what it did.
 *
 * A permission that cannot yet be established is not a permission. This waits
 * rather than guessing, which is the same rule useUserRole follows when it
 * returns null instead of falling back to a role.
 *
 * Written as a component rather than a convention so the next screen inherits
 * the behaviour instead of having to remember it.
 */
export function FeatureGate({ loading, allowed, feature, featureName, children }) {
  if (loading) {
    return (
      <SkeletonPage stats={0} panels={2} />
    )
  }

  if (!allowed) {
    return (
      <div style={{ maxWidth: '620px', margin: '40px auto' }}>
        <FeatureLocked feature={feature} featureName={featureName} />
      </div>
    )
  }

  return children
}

/**
 * The running count next to a gated action.
 *
 * Shown before the limit bites, not after: someone on their ninth of ten
 * searches should be able to see that, rather than discover the ceiling by
 * hitting it.
 */
export function UsageMeter({ label, used, ceiling, credits = 0, giveToGet = false }) {
  if (ceiling === Infinity || ceiling === -1) return null

  // One number, two buckets. The plan's allowance resets every month; earned
  // points never do. They are shown added together because that is what the
  // limit check actually uses — remaining() has always been
  // (ceiling - used) + credits — and showing them as two unrelated figures made
  // a balance of 43 look like 43 lookups nobody could spend.
  const total = ceiling + (giveToGet ? credits : 0)
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 100
  const left = Math.max(0, total - used)
  const low = left <= Math.max(1, Math.round(total * 0.15))

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '13px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px', gap: '10px' }}>
        <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>{label}</span>
        <span style={{ fontSize: '12.5px', fontWeight: 800, color: low ? '#B91C1C' : '#64748B' }}>
          بقي {left} من {total}
        </span>
      </div>
      <div style={{ height: '7px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: low ? '#DC2626' : '#16A34A', transition: 'width .3s' }} />
      </div>
      {giveToGet && credits > 0 && (
        <div style={{ fontSize: '12px', color: '#15803D', fontWeight: 700, marginTop: '7px' }}>
          {ceiling} من باقتك · {credits} من نقاط مساهماتك
          <span style={{ color: '#64748B', fontWeight: 600 }}> — حصة الباقة تتجدّد كل شهر، والنقاط تبقى</span>
        </div>
      )}
    </div>
  )
}
