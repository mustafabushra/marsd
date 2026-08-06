/**
 * Does this company pay on time?
 *
 * The first question a credit decision asks, so it gets its own panel rather
 * than a row inside a general "behaviour" card.
 *
 * ============================================================================
 * Why a distribution and not an average
 * ============================================================================
 * `behaviour.avg_delay` was the only delay figure on the report. An average
 * hides the shape: a company averaging fifteen days might settle every invoice
 * two weeks late, or might settle nine on time and one after five months. Those
 * are different businesses and the same number.
 *
 * Every approved report carries `delay_days` — it is filled on all fifty rows
 * in the database — so the buckets are counted from the rows the report already
 * loads. Nothing is recomputed and no new call is made.
 *
 * ============================================================================
 * Every percentage carries its sample
 * ============================================================================
 * «100% في الموعد» from a single transaction is true and misleading. The count
 * it came from is printed beside it everywhere, without exception.
 */

const BUCKETS = [
  { key: 'ontime', label: 'في الموعد', test: (d) => d <= 0, fg: '#15803D', bg: '#16A34A' },
  { key: 'short', label: '1–30 يوم', test: (d) => d > 0 && d <= 30, fg: '#B45309', bg: '#F59E0B' },
  { key: 'mid', label: '31–90 يوم', test: (d) => d > 30 && d <= 90, fg: '#C2410C', bg: '#F97316' },
  { key: 'long', label: 'أكثر من 90', test: (d) => d > 90, fg: '#B91C1C', bg: '#DC2626' },
]

const PAY_AR = {
  full: 'سُدِّد كاملاً', partial: 'سداد جزئي', late: 'سُدِّد متأخراً',
  default: 'لم يُسدَّد', unpaid: 'لم يُسدَّد', na: 'لا ينطبق',
}

const PANEL = {
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px',
  padding: '24px', marginBottom: '18px',
}

export default function PaymentBehaviour({ b, recent, delays }) {
  if (!b) return null

  const reports = Number(b.reports_approved ?? 0)
  const parties = Number(b.counterparties ?? 0)
  const onTime = Number(b.on_time_pct ?? 0)
  const defaults = Number(b.defaults ?? 0)

  // Counted from the delay values the report already has. When none arrived,
  // the chart is not drawn — an empty chart claims a distribution nobody
  // measured, which is worse than the row of dashes below it.
  const list = Array.isArray(delays) ? delays.map(Number).filter(Number.isFinite) : []
  const counts = BUCKETS.map((bk) => ({ ...bk, n: list.filter((d) => bk.test(d)).length }))
  const max = Math.max(1, ...counts.map((c) => c.n))

  return (
    <div style={PANEL}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    gap: '12px', flexWrap: 'wrap', marginBottom: '4px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: 0 }}>
          سلوك السداد
        </h3>
        {/* The sample, beside the heading, before any percentage is read. */}
        <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700 }}>
          من {reports} {reports === 1 ? 'تعامل' : 'تعامل'} · {parties} {parties === 1 ? 'طرف مقابل' : 'أطراف مقابلة'}
        </span>
      </div>
      <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 20px' }}>
        ما تقوله التقارير المعتمَدة عن الالتزام المالي.
      </p>

      <div style={{ display: 'flex', gap: '26px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: 'none', textAlign: 'center', minWidth: '150px' }}>
          <div style={{
            fontSize: '40px', fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
            color: defaults > 0 ? '#B91C1C' : onTime >= 90 ? '#15803D' : '#B45309',
          }}>
            {reports > 0 ? `${Math.round(onTime)}%` : '—'}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, marginTop: '6px' }}>
            سُدِّد في الموعد
          </div>
          <div style={{ fontSize: '11.5px', color: '#94A3B8', fontWeight: 600, marginTop: '3px' }}>
            من {reports} تعامل
          </div>
        </div>

        <div style={{ flex: 1, minWidth: '230px', display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: '10px' }}>
          {[
            { k: 'حالات التعثّر', v: reports > 0 ? defaults : null, bad: defaults > 0 },
            { k: 'متوسط التأخير', v: reports > 0 ? `${Math.round(Number(b.avg_delay ?? 0))} يوم` : null },
            { k: 'أقصى تأخير', v: reports > 0 ? `${Math.round(Number(b.max_delay ?? 0))} يوم` : null },
            { k: 'تقارير قيد المراجعة', v: b.reports_pending ?? null },
          ].map((s) => (
            <div key={s.k} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0',
                                    borderRadius: '11px', padding: '13px 15px' }}>
              <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 700 }}>{s.k}</div>
              <div style={{ fontSize: '20px', fontWeight: 900, marginTop: '5px',
                            color: s.v === null ? '#CBD5E1' : s.bad ? '#B91C1C' : '#0F172A' }}>
                {s.v === null ? '—' : s.v}
              </div>
            </div>
          ))}
        </div>
      </div>

      {list.length > 0 && (
        <div style={{ marginTop: '22px', paddingTop: '20px', borderTop: '1px solid #F1F5F9' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '13px' }}>
            توزيع أيام التأخير
            <span style={{ fontWeight: 600, color: '#94A3B8' }}> — {list.length} تعامل</span>
          </div>
          <div style={{ display: 'grid', gap: '8px' }}>
            {counts.map((c) => (
              <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700,
                               minWidth: '86px', flex: 'none' }}>
                  {c.label}
                </span>
                <div style={{ flex: 1, height: '20px', background: '#F1F5F9', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ width: `${(c.n / max) * 100}%`, height: '100%', background: c.bg,
                                borderRadius: '6px', transition: 'width 200ms' }} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 900, color: c.n ? c.fg : '#CBD5E1',
                               minWidth: '22px', textAlign: 'end', flex: 'none',
                               fontVariantNumeric: 'tabular-nums' }}>
                  {c.n}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Array.isArray(recent) && recent.length > 0 && (
        <div style={{ marginTop: '20px', paddingTop: '18px', borderTop: '1px solid #F1F5F9' }}>
          <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '11px' }}>
            آخر التعاملات المُبلَّغ عنها
          </div>
          <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
            {recent.slice(0, 5).map((r, i) => {
              const bad = r.defaulted || r.payment === 'default' || r.payment === 'unpaid'
              const late = !bad && Number(r.delay) > 0
              return (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '7px',
                  background: bad ? '#FEF2F2' : late ? '#FFFBEB' : '#ECFDF5',
                  color: bad ? '#B91C1C' : late ? '#B45309' : '#15803D',
                  borderRadius: '9px', padding: '8px 13px', fontSize: '12.5px', fontWeight: 700,
                }}>
                  {bad ? '✕' : late ? '◐' : '✓'} {PAY_AR[r.payment] || r.payment || '—'}
                  {Number(r.delay) > 0 && (
                    <span style={{ fontWeight: 600, opacity: 0.8 }}> · {r.delay} يوم</span>
                  )}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
