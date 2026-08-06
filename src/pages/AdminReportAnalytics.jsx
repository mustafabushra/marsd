import { useCallback, useState, useEffect } from 'react'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { StatTile, BarList, TrendLine, StatusBar, STATUS_COLOR, SERIES } from '../components/Charts'
import { SkeletonPage } from '../components/Skeleton'

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

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

export default function AdminReportAnalytics() {
  const [days, setDays] = useState(90)
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      const supabase = getSupabase()

      // Every figure on this card is computed by the database now.
      //
      // It used to fetch each report in the window and derive the totals, the
      // median review time, both breakdowns, the monthly trend and the two "top"
      // lists from the array. PostgREST caps a request at 1000 rows and returns
      // 200 without saying it truncated, so past that point this page would have
      // reported the shape of the most recent thousand reports as the shape of
      // all of them — with nothing on screen to suggest it.
      const { data, error: e } = await supabase.rpc('report_analytics', { p_days: days })
      if (e) throw e
      setStats(data || {})
    } catch (err) {
      setError(err.message || 'تعذّر تحميل التحليلات')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { load() }, [load])

  const { connected, liveAt } = useLiveData(load, { tables: ['reports', 'review_actions'] })

  if (loading) {
    return <SkeletonPage stats={4} panels={2} />
  }

  const n = (k) => Number(stats[k]) || 0
  const total = n('total')
  const approved = n('approved')
  const pending = n('pending')
  const rejected = n('rejected')
  const info = n('request_info')

  // Of the reports that were actually decided. Counting the queue as failures
  // would make the rate fall every time submissions rise.
  const decided = approved + rejected
  const approvalRate = decided ? Math.round((approved / decided) * 100) : null

  // Returned in hours because a review that takes an afternoon should not read
  // as "0 days"; shown in days, which is the unit the card is labelled in.
  const medianReview = stats.median_review_hours != null && approved
    ? Number(stats.median_review_hours) / 24
    : null

  const tally = (key, labels) =>
    Object.entries(stats[key] || {})
      .map(([k, v]) => ({ label: labels[k] || k, value: Number(v) }))
      .sort((a, b) => b.value - a.value)

  const topList = (key) =>
    (stats[key] || []).slice(0, 6).map((x) => ({ label: x.name || '—', value: Number(x.count) }))

  // One point per month across the window, including months with nothing in
  // them — dropping empty months would draw a flat line over a gap, and the
  // database returns only the months that have rows.
  const trend = (() => {
    const rows = stats.monthly || []
    if (!rows.length) return []
    const counts = Object.fromEntries(rows.map((m) => [m.month, Number(m.count)]))
    const [y0, m0] = rows[0].month.split('-').map(Number)
    const cursor = new Date(y0, m0 - 1, 1)
    const end = new Date()
    const out = []
    while (cursor <= end && out.length < 24) {
      const k = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      out.push({ label: MONTHS_AR[cursor.getMonth()], value: counts[k] || 0 })
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return out
  })()

  const defaults = n('defaults')
  const avgDelay = n('avg_delay')
  const totalValue = n('total_value')

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
        <StatTile label="وسيط زمن المراجعة" value={medianReview == null ? '—' : `${medianReview.toFixed(1)} يوم`} sub={`${n('reviewed')} تقريراً مُعتمداً`} />
        <StatTile label="حالات عدم السداد" value={defaults.toLocaleString('en-US')} sub={total ? `${Math.round((defaults / total) * 100)}% من التقارير` : ''} tone={defaults ? STATUS_COLOR.critical : undefined} />
        <StatTile label="متوسط التأخير" value={avgDelay ? `${avgDelay} يوم` : '—'} sub={`${n('with_delay')} تقريراً فيه تأخير`} />
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
        <BarList title="أكثر الشركات وروداً في التقارير" rows={topList('top_companies')} color={SERIES[2]} />
        <BarList title="أكثر الشركات مساهمةً" rows={topList('top_reporters')} color={SERIES[0]} />
      </div>
    </div>
  )
}
