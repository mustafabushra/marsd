import { useCallback, useState, useEffect } from 'react'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { StatTile, BarList, TrendLine, StatusBar, STATUS_COLOR, SERIES } from '../components/Charts'

/**
 * /admin/report-analytics — what the reports say, in aggregate.
 *
 * The screen held a stats object typed into the source and a date range fixed
 * at 2026-07-01 to 2026-07-15. Nothing moved when the range changed, because
 * nothing was read; the numbers had been chosen to look plausible.
 *
 * The figures here are the ones the platform's own decisions turn on: how much
 * of what is submitted survives review, what companies are being reported for,
 * and whether they pay. The last is the trust score's input, so this is also
 * where the model can be seen to be describing something real.
 */

const RANGES = [
  { id: 30, label: 'آخر ٣٠ يوماً' },
  { id: 90, label: 'آخر ٩٠ يوماً' },
  { id: 365, label: 'آخر سنة' },
  { id: 0, label: 'كل الفترات' },
]

const CATEGORY_LABEL = {
  late_payment: 'تأخير سداد', no_payment: 'عدم سداد', contract_breach: 'إخلال بالعقد',
  quality: 'جودة العمل', execution_delay: 'تأخير التنفيذ', dispute: 'نزاع',
  fraud: 'احتيال', other: 'أخرى',
}

const PAYMENT_LABEL = {
  full: 'سُدِّد كاملاً', partial: 'سداد جزئي', late: 'سُدِّد متأخراً',
  default: 'لم يُسدَّد', unpaid: 'لم يُسدَّد', na: 'لا ينطبق',
}

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

export default function AdminReportAnalytics() {
  const [days, setDays] = useState(90)
  const [reports, setReports] = useState([])
  const [names, setNames] = useState({ companies: {}, tenants: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      const supabase = getSupabase()

      let q = supabase
        .from('reports')
        .select('id, status, category, payment_commitment, delay_days, defaulted, deal_value, created_at, approved_at, reporter_tenant_id, target_company_id')
      if (days > 0) {
        q = q.gte('created_at', new Date(Date.now() - days * 86400000).toISOString())
      }
      const { data, error: e } = await q.order('created_at', { ascending: true })
      if (e) throw e

      const rows = data || []
      setReports(rows)

      // Names for the two "top" lists, fetched only for the ids in view.
      const companyIds = [...new Set(rows.map((r) => r.target_company_id).filter(Boolean))]
      const tenantIds = [...new Set(rows.map((r) => r.reporter_tenant_id).filter(Boolean))]

      const [{ data: cos }, { data: tens }] = await Promise.all([
        companyIds.length ? supabase.from('companies').select('id, name').in('id', companyIds) : { data: [] },
        tenantIds.length ? supabase.from('tenants').select('id, name').in('id', tenantIds) : { data: [] },
      ])

      setNames({
        companies: Object.fromEntries((cos || []).map((c) => [c.id, c.name])),
        tenants: Object.fromEntries((tens || []).map((t) => [t.id, t.name])),
      })
    } catch (err) {
      setError(err.message || 'تعذّر تحميل التحليلات')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  const { connected, liveAt } = useLiveData(load, { tables: ['reports', 'review_actions'] })

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: '#64748B', fontWeight: 600 }}>جاري التحميل...</div>
  }

  const total = reports.length
  const by = (s) => reports.filter((r) => r.status === s).length
  const approved = by('approved')
  const pending = by('pending_review')
  const rejected = by('rejected')
  const info = by('request_info')

  // Of the reports that were actually decided. Counting the queue as failures
  // would make the rate fall every time submissions rise.
  const decided = approved + rejected
  const approvalRate = decided ? Math.round((approved / decided) * 100) : null

  const reviewTimes = reports
    .filter((r) => r.approved_at && r.created_at)
    .map((r) => (new Date(r.approved_at) - new Date(r.created_at)) / 86400000)
  const medianReview = reviewTimes.length
    ? reviewTimes.sort((a, b) => a - b)[Math.floor(reviewTimes.length / 2)]
    : null

  const tally = (key, labels) => {
    const counts = {}
    reports.forEach((r) => { if (r[key]) counts[r[key]] = (counts[r[key]] || 0) + 1 })
    return Object.entries(counts)
      .map(([k, v]) => ({ label: labels[k] || k, value: v }))
      .sort((a, b) => b.value - a.value)
  }

  const topBy = (key, dict) => {
    const counts = {}
    reports.forEach((r) => { if (r[key]) counts[r[key]] = (counts[r[key]] || 0) + 1 })
    return Object.entries(counts)
      .map(([id, v]) => ({ label: dict[id] || '—', value: v }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)
  }

  // One point per month across the window, including months with nothing in
  // them — dropping empty months would draw a flat line over a gap.
  const trend = (() => {
    if (!reports.length) return []
    const counts = {}
    reports.forEach((r) => { const k = monthKey(new Date(r.created_at)); counts[k] = (counts[k] || 0) + 1 })
    const first = new Date(reports[0].created_at)
    const cursor = new Date(first.getFullYear(), first.getMonth(), 1)
    const end = new Date()
    const out = []
    while (cursor <= end && out.length < 24) {
      const k = monthKey(cursor)
      out.push({ label: MONTHS_AR[cursor.getMonth()], value: counts[k] || 0 })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return out
  })()

  const defaults = reports.filter((r) => r.defaulted).length
  const withDelay = reports.filter((r) => r.delay_days != null && r.delay_days > 0)
  const avgDelay = withDelay.length
    ? Math.round(withDelay.reduce((s, r) => s + r.delay_days, 0) / withDelay.length)
    : 0
  const totalValue = reports.reduce((s, r) => s + Number(r.deal_value || 0), 0)

  return (
    <div>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px', textAlign: 'right' }}>تحليلات التقارير</h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>{total} تقريراً في الفترة المختارة</p>
        </div>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#B91C1C', fontSize: '14px', fontWeight: 700, textAlign: 'right' }}>⚠️ {error}</div>
      )}

      {/* Filters in one row above the charts. */}
      <div style={{ display: 'flex', gap: '9px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {RANGES.map((r) => (
          <button key={r.id} onClick={() => setDays(r.id)} style={{ padding: '9px 18px', background: days === r.id ? '#1E2A52' : '#fff', color: days === r.id ? '#fff' : '#334155', border: days === r.id ? 0 : '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            {r.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '14px', marginBottom: '18px' }}>
        <StatTile label="إجمالي التقارير" value={total.toLocaleString('en-US')} sub={`${pending + info} بانتظار المراجعة`} />
        <StatTile
          label="نسبة الاعتماد"
          value={approvalRate == null ? '—' : `${approvalRate}%`}
          sub={approvalRate == null ? 'لم يُبتّ في شيء بعد' : `من ${decided} تقريراً بُتّ فيها`}
          tone={approvalRate == null ? undefined : approvalRate >= 70 ? STATUS_COLOR.good : STATUS_COLOR.warning}
        />
        <StatTile label="وسيط زمن المراجعة" value={medianReview == null ? '—' : `${medianReview.toFixed(1)} يوم`} sub={`${reviewTimes.length} تقريراً مُعتمداً`} />
        <StatTile label="حالات عدم السداد" value={defaults.toLocaleString('en-US')} sub={total ? `${Math.round((defaults / total) * 100)}% من التقارير` : ''} tone={defaults ? STATUS_COLOR.critical : undefined} />
        <StatTile label="متوسط التأخير" value={avgDelay ? `${avgDelay} يوم` : '—'} sub={`${withDelay.length} تقريراً فيه تأخير`} />
        <StatTile label="قيمة التعاملات" value={totalValue ? `${(totalValue / 1000).toFixed(0)} ألف` : '—'} sub="ريال سعودي" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))', gap: '16px', marginBottom: '16px' }}>
        <StatusBar
          title="حالة التقارير"
          segments={[
            { label: 'معتمد', value: approved, color: STATUS_COLOR.good, icon: '✓' },
            { label: 'قيد المراجعة', value: pending, color: STATUS_COLOR.warning, icon: '⏳' },
            { label: 'مطلوب توضيح', value: info, color: STATUS_COLOR.serious, icon: '!' },
            { label: 'مرفوض', value: rejected, color: STATUS_COLOR.critical, icon: '✕' },
          ]}
        />
        <TrendLine title="التقارير المُقدَّمة شهرياً" points={trend} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))', gap: '16px' }}>
        <BarList title="أسباب التقارير" rows={tally('category', CATEGORY_LABEL)} color={SERIES[0]} />
        <BarList title="سلوك السداد" rows={tally('payment_commitment', PAYMENT_LABEL)} color={SERIES[1]} />
        <BarList title="أكثر الشركات وروداً في التقارير" rows={topBy('target_company_id', names.companies)} color={SERIES[2]} />
        <BarList title="أكثر الشركات مساهمةً" rows={topBy('reporter_tenant_id', names.tenants)} color={SERIES[0]} />
      </div>
    </div>
  )
}
