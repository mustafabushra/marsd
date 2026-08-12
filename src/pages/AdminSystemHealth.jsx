import { useCallback, useState, useEffect } from 'react'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import DeferredSkeleton from '../components/DeferredSkeleton'
import { SkeletonPage } from '../components/Skeleton'
import { LiveBadge } from '../components/LiveBadge'
import { StatTile, STATUS_COLOR } from '../components/Charts'
import { Card } from '../ui'

/**
 * /admin/system-health — what is actually true about the platform right now.
 *
 * The screen reported a cache hit rate of 94.2%, a queue of 1,247 jobs and
 * 542GB of 1TB storage used. Marsad has no cache, no job queue and no storage it
 * manages: three systems that do not exist, all reported healthy, on the one
 * page an operator would open to find out whether something is wrong. Watching
 * it was watching nothing, and felt like watching something.
 *
 * What can be measured is whether the data is internally consistent — a company
 * carrying a score with no reports behind it, a tenant with no administrator, a
 * company over the limit its plan allows. Each is a real fault with a real fix,
 * and none of them is visible from any single screen.
 *
 * Every number here comes from platform_health(), which reads pg_catalog and is
 * restricted to platform admins.
 */

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }

// Each fault names what is wrong and what to do, because a count on its own
// tells an operator there is a problem and not what kind.
const FAULTS = [
  { key: 'scored_high_risk_without_evidence', label: 'شركات مصنّفة «مخاطر مرتفعة» بلا تقارير', severity: 'critical',
    fix: 'تصنيف شركة بلا دليل مخاطرة قانونية — أعد احتساب الدرجات من صفحة درجة الثقة.' },
  { key: 'scores_without_reports', label: 'درجات ثقة بلا تقارير معتمدة', severity: 'serious',
    fix: 'أعد احتساب الدرجات من صفحة درجة الثقة.' },
  { key: 'stale_scores', label: 'درجات لا تطابق عدد تقاريرها', severity: 'serious',
    fix: 'أعد احتساب الدرجات — التقارير تغيّرت بعد آخر احتساب.' },
  { key: 'over_watchlist_limit', label: 'شركات تجاوزت حد قوائم المراقبة', severity: 'warning',
    fix: 'سابقة لتفعيل الحد — احذف الزائد أو ارفع الباقة.' },
  { key: 'tenants_without_admin', label: 'شركات بلا مدير نشط', severity: 'serious',
    fix: 'لا أحد يستطيع إدارة المستخدمين فيها — عيّن مديراً من إدارة المستخدمين.' },
  { key: 'tenants_without_subscription', label: 'شركات نشطة بلا اشتراك', severity: 'warning',
    fix: 'تُعامَل بالباقة الافتراضية — أنشئ لها اشتراكاً من صفحة الاشتراكات.' },
  { key: 'users_without_tenant', label: 'مستخدمون بلا شركة', severity: 'warning',
    fix: 'حساب لا يصل شيئاً — اربطه بشركة أو أوقفه.' },
  { key: 'orphan_reports', label: 'تقارير عن شركات محذوفة', severity: 'critical',
    fix: 'تقرير بلا هدف — يجب حذفه أو إعادة ربطه.' },
]

const SEVERITY = {
  critical: { color: STATUS_COLOR.critical, bg: '#FEF2F2', border: '#FECACA', icon: '✕' },
  serious:  { color: STATUS_COLOR.serious,  bg: '#FFF7ED', border: '#FED7AA', icon: '!' },
  warning:  { color: '#B45309',             bg: '#FFFBEB', border: '#FDE68A', icon: '⚠' },
}

const ago = (iso) => {
  if (!iso) return null
  const mins = Math.floor((Date.now() - new Date(iso)) / 60000)
  if (mins < 1) return 'الآن'
  if (mins < 60) return `قبل ${mins} دقيقة`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `قبل ${hrs} ساعة`
  return `قبل ${Math.floor(hrs / 24)} يوماً`
}

export default function AdminSystemHealth() {
  const [health, setHealth] = useState(null)
  const [latency, setLatency] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      const t0 = performance.now()
      const { data, error: e } = await getSupabase().rpc('platform_health')
      setLatency(Math.round(performance.now() - t0))
      if (e) throw e
      setHealth(data)
    } catch (err) {
      setError(err.message || 'تعذّر قراءة حالة النظام')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Subscribed to the tables whose contents these checks are about, so a fault
  // appearing shows up without anyone reloading.
  const { connected, liveAt } = useLiveData(load, {
    tables: ['reports', 'trust_scores', 'users', 'tenants', 'subscriptions'],
  })

  if (loading) {
    return (
      <DeferredSkeleton>
        <SkeletonPage stats={4} panels={2} />
      </DeferredSkeleton>
    )
  }

  if (error || !health) {
    return (
      <Card style={{ padding: '30px', textAlign: 'right' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', margin: '0 0 10px' }}>حالة النظام</h1>
        <div style={{ padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#B91C1C', fontSize: '14px', fontWeight: 700 }}>
          ⚠️ {error || 'لا توجد بيانات'}
        </div>
      </Card>
    )
  }

  const { access, schema, volume, activity, faults } = health
  const found = FAULTS.map((f) => ({ ...f, count: Number(faults?.[f.key] || 0) })).filter((f) => f.count > 0)
  const worst = found.some((f) => f.severity === 'critical') ? 'critical'
    : found.some((f) => f.severity === 'serious') ? 'serious'
    : found.length ? 'warning' : 'good'

  const openTables = access?.without_rls || []

  return (
    <div>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px', textAlign: 'right' }}>حالة النظام</h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
            فُحص {ago(health.checked_at)} · زمن الاستجابة {latency} م.ث
          </p>
        </div>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      {/* The headline. Icon and words, never colour alone. */}
      <div style={{
        ...card,
        padding: '20px 24px',
        marginBottom: '18px',
        background: worst === 'good' ? '#F0FDF4' : SEVERITY[worst].bg,
        border: `1px solid ${worst === 'good' ? '#BBF7D0' : SEVERITY[worst].border}`,
        display: 'flex', alignItems: 'center', gap: '14px', flexDirection: 'row-reverse', textAlign: 'right',
      }}>
        <span style={{ fontSize: '26px' }}>{worst === 'good' ? '✓' : SEVERITY[worst].icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '16px', fontWeight: 900, color: worst === 'good' ? STATUS_COLOR.good : SEVERITY[worst].color }}>
            {worst === 'good' ? 'البيانات متّسقة — لا أعطال' : `${found.length} عطل يحتاج انتباهاً`}
          </div>
          <div style={{ fontSize: '13px', color: '#52514e', fontWeight: 600, marginTop: '3px' }}>
            {found.length ? found.map((f) => f.label).join(' · ') : 'كل فحوص الاتساق تمرّ'}
          </div>
        </div>
      </div>

      {found.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '11px', marginBottom: '18px' }}>
          {found.map((f) => {
            const s = SEVERITY[f.severity]
            return (
              <div key={f.key} style={{ ...card, padding: '15px 18px', borderRight: `4px solid ${s.color}`, textAlign: 'right' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                    <span aria-hidden style={{ color: s.color }}>{s.icon}</span> {f.label}
                  </span>
                  <span style={{ fontSize: '15px', fontWeight: 900, color: s.color }}>{f.count}</span>
                </div>
                <p style={{ fontSize: '13px', color: '#52514e', margin: '6px 0 0', fontWeight: 600, lineHeight: 1.8 }}>{f.fix}</p>
              </div>
            )
          })}
        </div>
      )}

      <h2 style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: '0 0 12px', textAlign: 'right' }}>الحماية والبنية</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '14px', marginBottom: '18px' }}>
        <StatTile
          label="جداول محميّة بـ RLS"
          value={`${access.rls_enabled} / ${access.tables}`}
          sub={openTables.length ? `مكشوف: ${openTables.join('، ')}` : 'كل الجداول مغلقة'}
          tone={openTables.length ? STATUS_COLOR.critical : STATUS_COLOR.good}
        />
        <StatTile label="جداول البث اللحظي" value={access.realtime_tables} sub="تُحدِّث الشاشات بلا تحديث صفحة" />
        <StatTile label="ترحيلات مُطبَّقة" value={schema.migrations_applied} sub={schema.last_migration} />
        <StatTile label="تقارير بانتظار المراجعة" value={activity.pending_review} sub={`${activity.reports_last_7d} تقريراً في ٧ أيام`} tone={activity.pending_review > 20 ? STATUS_COLOR.warning : undefined} />
      </div>

      <h2 style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: '0 0 12px', textAlign: 'right' }}>حجم البيانات</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '14px', marginBottom: '18px' }}>
        {[
          ['شركات', volume.companies], ['حسابات شركات', volume.tenants], ['مستخدمون', volume.users],
          ['تقارير', volume.reports], ['درجات ثقة', volume.trust_scores], ['إشعارات', volume.notifications],
          ['سجلات تدقيق', volume.audit_logs],
        ].map(([label, value]) => <StatTile key={label} label={label} value={Number(value).toLocaleString('en-US')} />)}
      </div>

      <h2 style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: '0 0 12px', textAlign: 'right' }}>آخر نشاط</h2>
      <Card style={{ overflow: 'hidden' }}>
        {[
          ['آخر تقرير', activity.last_report],
          ['آخر تسجيل دخول', activity.last_login],
          ['آخر إجراء إداري', activity.last_audit],
          ['آخر احتساب لدرجات الثقة', activity.last_score_computed],
        ].map(([label, iso], i, arr) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: i < arr.length - 1 ? '1px solid #F1F5F9' : 'none', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>{label}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: iso ? '#52514e' : '#CBD5E1' }}>
              {iso ? `${new Date(iso).toLocaleString('en-GB')} — ${ago(iso)}` : 'لم يُسجَّل قط'}
            </span>
          </div>
        ))}
      </Card>
    </div>
  )
}
