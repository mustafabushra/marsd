import { useCallback, useState, useEffect } from 'react'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { StatTile, BarList, TrendLine, StatusBar, STATUS_COLOR, SERIES } from '../components/Charts'
import { SkeletonPage } from '../components/Skeleton'
import { Card } from '../ui'

/**
 * /admin/tenant-analytics — the companies on Marsad, in aggregate.
 *
 * The screen listed invented tenants — "شركة الراجحي التجارية، 45 تقريراً، إيراد
 * 4500" — against a date range fixed in the source. The revenue column was the
 * most misleading part of it: Marsad has no payment gateway, every company is on
 * the free plan, and the platform has taken nothing. A number in a revenue column
 * is read as money received.
 *
 * What is real and worth an operator's attention is who contributes. Marsad's
 * data comes from its customers, so the health of the registry is the health of
 * a handful of companies that file reports — and that is measurable today.
 */

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }
const COLS = '1.7fr 1fr 0.9fr 0.9fr 1fr 1fr'

export default function AdminTenantAnalytics() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      const supabase = getSupabase()

      // One call, and the counting happens in the database.
      //
      // This pulled seven whole tables into the browser — tenants, users,
      // reports, watchlist_items, subscriptions, plans, credits_ledger — and
      // joined and counted them here. PostgREST caps a request at 1000 rows and
      // returns 200 without saying it truncated, so every figure on this screen
      // was correct only while the tables were small: "نقاط متداولة" would have
      // become the sum of some credits, and a tenant's report count a count of
      // its recent reports, with nothing anywhere indicating it.
      //
      // A wrong number that still looks like a number is not discovered by
      // looking at the screen.
      const { data, error: rpcError } = await supabase.rpc('tenant_analytics')
      if (rpcError) throw rpcError

      setRows((data || []).map((t) => ({
        id: t.tenant_id,
        name: t.name,
        status: t.status,
        createdAt: t.created_at,
        claimed: t.claimed,
        plan: t.plan_name,
        planCode: t.plan_code,
        users: Number(t.users_active) || 0,
        reports: Number(t.reports_total) || 0,
        approved: Number(t.reports_approved) || 0,
        watchlist: Number(t.watchlist) || 0,
        credits: Number(t.credits) || 0,
        lastLogin: t.last_login,
      })))
    } catch (err) {
      setError(err.message || 'تعذّر تحميل التحليلات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const { connected, liveAt } = useLiveData(load, {
    tables: ['tenants', 'users', 'reports', 'subscriptions', 'credits_ledger', 'watchlist_items'],
  })

  if (loading) {
    return <SkeletonPage stats={4} panels={2} />
  }

  const active = rows.filter((r) => r.status === 'active')
  const contributors = rows.filter((r) => r.reports > 0)
  const dormant = active.filter((r) => r.reports === 0)

  // A month has passed since anyone on the account signed in.
  const stale = active.filter((r) => !r.lastLogin || (Date.now() - new Date(r.lastLogin)) > 30 * 86400000)

  const byPlan = (() => {
    const counts = {}
    rows.forEach((r) => { counts[r.plan] = (counts[r.plan] || 0) + 1 })
    return Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  })()

  const trend = (() => {
    const dated = rows.filter((r) => r.createdAt).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    if (dated.length < 2) return []
    const counts = {}
    dated.forEach((r) => { const k = monthKey(new Date(r.createdAt)); counts[k] = (counts[k] || 0) + 1 })
    const cursor = new Date(new Date(dated[0].createdAt).getFullYear(), new Date(dated[0].createdAt).getMonth(), 1)
    const end = new Date()
    const out = []
    let running = 0
    while (cursor <= end && out.length < 24) {
      running += counts[monthKey(cursor)] || 0
      out.push({ label: MONTHS_AR[cursor.getMonth()], value: running })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return out
  })()

  const top = (key) => [...rows]
    .filter((r) => r[key] > 0)
    .sort((a, b) => b[key] - a[key])
    .slice(0, 6)
    .map((r) => ({ label: r.name, value: r[key] }))

  return (
    <div>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px', textAlign: 'right' }}>تحليلات الشركات</h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>{rows.length} شركة مسجّلة · بيانات مرصد تأتي منها</p>
        </div>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#B91C1C', fontSize: '14px', fontWeight: 700, textAlign: 'right' }}>⚠️ {error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '14px', marginBottom: '18px' }}>
        <StatTile label="شركات نشطة" value={active.length} sub={`من ${rows.length} مسجّلة`} />
        <StatTile
          label="شركات تُساهم"
          value={contributors.length}
          sub={active.length ? `${Math.round((contributors.length / active.length) * 100)}% من النشطة` : ''}
          tone={contributors.length ? STATUS_COLOR.good : STATUS_COLOR.warning}
        />
        <StatTile label="شركات لم تُساهم بعد" value={dormant.length} sub="لم ترسل تقريراً واحداً" tone={dormant.length ? STATUS_COLOR.warning : undefined} />
        <StatTile label="بلا دخول منذ ٣٠ يوماً" value={stale.length} sub="حسابات ساكنة" tone={stale.length ? STATUS_COLOR.serious : undefined} />
        <StatTile label="مستخدمون نشطون" value={rows.reduce((s, r) => s + r.users, 0)} sub="عبر كل الشركات" />
        <StatTile label="نقاط متداولة" value={rows.reduce((s, r) => s + r.credits, 0).toLocaleString('en-US')} sub="رصيد Give-to-Get" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))', gap: '16px', marginBottom: '16px' }}>
        <StatusBar
          title="مشاركة الشركات"
          segments={[
            { label: 'تُساهم بتقارير', value: contributors.length, color: STATUS_COLOR.good, icon: '✓' },
            { label: 'نشطة بلا مساهمة', value: dormant.length, color: STATUS_COLOR.warning, icon: '⏳' },
            { label: 'غير نشطة', value: rows.length - active.length, color: STATUS_COLOR.neutral, icon: '—' },
          ]}
        />
        <TrendLine title="نمو عدد الشركات (تراكمي)" points={trend} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))', gap: '16px', marginBottom: '16px' }}>
        <BarList title="أكثر الشركات مساهمةً بالتقارير" rows={top('reports')} color={SERIES[0]} empty="لا توجد مساهمات بعد" />
        <BarList title="الشركات حسب الباقة" rows={byPlan} color={SERIES[1]} />
        <BarList title="الأكثر رصيداً من النقاط" rows={top('credits')} color={SERIES[2]} empty="لا توجد نقاط بعد" />
        <BarList title="الأكثر متابعةً لقوائم المراقبة" rows={top('watchlist')} color={SERIES[0]} empty="لا توجد قوائم مراقبة" />
      </div>

      {/* The table view. It is also the relief the palette requires: every number
          above is legible here without depending on a colour being told apart. */}
      <Card style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '14px 18px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B', textAlign: 'right' }}>
          <span>الشركة</span><span>الباقة</span><span>المستخدمون</span><span>التقارير</span><span>النقاط</span><span>آخر دخول</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontSize: '14px', fontWeight: 600 }}>لا توجد شركات</div>
        ) : [...rows].sort((a, b) => b.reports - a.reports).map((r) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: COLS, padding: '13px 18px', borderBottom: '1px solid #F1F5F9', alignItems: 'center', textAlign: 'right' }}>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
              {r.name}
              {r.status !== 'active' && <span style={{ fontSize: '11.5px', color: STATUS_COLOR.critical, fontWeight: 800 }}> · موقوفة</span>}
            </span>
            <span style={{ fontSize: '13px', color: '#334155', fontWeight: 700 }}>{r.plan}</span>
            <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 700 }}>{r.users}</span>
            <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 700 }}>
              {r.reports}
              {r.reports > 0 && <span style={{ color: '#64748B' }}> ({r.approved} معتمد)</span>}
            </span>
            <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 700 }}>{r.credits.toLocaleString('en-US')}</span>
            <span style={{ fontSize: '12.5px', color: r.lastLogin ? '#64748B' : '#CBD5E1', fontWeight: 600 }}>
              {r.lastLogin ? new Date(r.lastLogin).toLocaleDateString('en-GB') : 'لم يسجّل دخول'}
            </span>
          </div>
        ))}
      </Card>
    </div>
  )
}
