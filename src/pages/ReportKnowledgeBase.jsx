import { useCallback, useState, useEffect } from 'react'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'

/**
 * /admin/knowledge-base/reports — the approved-report archive, and who filed each one.
 *
 * The screen carried a banner saying the reporting company is hidden "حفاظاً على
 * خصوصية المساهمين". That rule is right and stays right — for other companies. A
 * company that can identify its accuser can retaliate, and the contributions
 * Marsad runs on would stop, which is why /reports-about-us withholds it from
 * the subject of a report.
 *
 * It is the wrong rule for Marsad's own archive. This screen is behind the admin
 * route and its data comes from a function that refuses anyone who is not a
 * platform admin. Withholding the reporter here does not protect a contributor
 * from anything — it only means that when a claim turns out to be false, nobody
 * can find out who made it or what else they filed. On a platform that publishes
 * adverse claims about named businesses, that is the record that matters most.
 *
 * The archive also now says whether a report was contested. Listing a claim
 * without noting that its subject objected and won makes this a repository of
 * claims rather than of findings.
 */

const COLS = '1fr 1.7fr 1.3fr 1.2fr 1.1fr 1fr'

const CATEGORY_LABEL = {
  late_payment: 'تأخير سداد', no_payment: 'عدم سداد', contract_breach: 'إخلال بالعقد',
  quality: 'جودة العمل', execution_delay: 'تأخير التنفيذ', dispute: 'نزاع',
  fraud: 'احتيال', other: 'أخرى',
}

const DISPUTE = {
  upheld:   { label: '⚠ سُحب بعد اعتراض', bg: '#FEF2F2', c: '#B91C1C' },
  open:     { label: '⏳ عليه اعتراض', bg: '#FFFBEB', c: '#B45309' },
  rejected: { label: '✓ صمد أمام اعتراض', bg: '#ECFDF5', c: '#15803D' },
}

export default function ReportKnowledgeBase() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [onlyDisputed, setOnlyDisputed] = useState(false)

  const load = useCallback(async () => {
    try {
      setError('')
      const { data, error: e } = await getSupabase().rpc('kb_reports', { p_limit: 500 })
      if (e) throw e
      setReports((data || []).filter((r) => r.status === 'approved'))
    } catch (err) {
      setError(err.message || 'تعذّر تحميل الأرشيف')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const { connected, liveAt } = useLiveData(load, { tables: ['reports', 'disputes'] })

  const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0)
  const thisMonth = reports.filter((r) => r.approved_at && new Date(r.approved_at) >= startMonth).length
  const disputed = reports.filter((r) => r.disputed).length
  const overturned = reports.filter((r) => r.dispute_status === 'upheld').length

  // How concentrated the archive is. One company filing most of it is not
  // necessarily wrong, but it is worth an operator knowing.
  const byReporter = {}
  reports.forEach((r) => { if (r.reporter_name) byReporter[r.reporter_name] = (byReporter[r.reporter_name] || 0) + 1 })
  const topReporter = Object.entries(byReporter).sort((a, b) => b[1] - a[1])[0]

  const q = query.trim()
  const filtered = reports.filter((r) => {
    if (onlyDisputed && !r.disputed) return false
    if (!q) return true
    return (r.target_company || '').includes(q) || (r.reporter_name || '').includes(q)
  })

  const kpis = [
    { label: 'إجمالي التقارير المعتمدة', value: reports.length.toLocaleString('en-US'), color: '#1E2A52' },
    { label: 'معتمدة هذا الشهر', value: thisMonth.toLocaleString('en-US'), color: '#16A34A' },
    { label: 'عليها اعتراض', value: disputed.toLocaleString('en-US'), color: disputed ? '#B45309' : '#64748B' },
    {
      label: 'سُحبت بعد اعتراض',
      value: overturned.toLocaleString('en-US'),
      color: overturned ? '#B91C1C' : '#64748B',
    },
  ]

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: '#64748B', fontWeight: 600 }}>جاري تحميل الأرشيف...</div>

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '14px', marginBottom: '18px' }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px 20px', textAlign: 'right' }}>
            <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 700, marginBottom: '8px' }}>{k.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '12px', padding: '14px 18px', marginBottom: '18px', display: 'flex', gap: '11px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '18px' }}>🛡</span>
        <span style={{ fontSize: '13.5px', color: '#3730A3', fontWeight: 700, flex: 1, lineHeight: 1.9 }}>
          أرشيف إدارة مرصد — تظهر فيه الشركة المُبلِّغة لتتبّع أي تقرير خاطئ. الشركة المُبلَّغ عنها لا ترى هذه الهوية إطلاقاً.
        </span>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#B91C1C', fontSize: '14px', fontWeight: 700, textAlign: 'right' }}>⚠️ {error}</div>
      )}

      {topReporter && reports.length >= 5 && topReporter[1] / reports.length > 0.5 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '13px 18px', marginBottom: '16px', fontSize: '13.5px', color: '#92400E', fontWeight: 700, textAlign: 'right', lineHeight: 1.9 }}>
          ⚠️ «{topReporter[0]}» قدّمت {topReporter[1]} من {reports.length} تقريراً في الأرشيف ({Math.round((topReporter[1] / reports.length) * 100)}%) — تركّز يستحق المراجعة.
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '260px', display: 'flex', alignItems: 'center', gap: '11px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '11px', padding: '0 14px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث بالشركة المُبلَّغ عنها أو الشركة المُبلِّغة" style={{ flex: 1, border: 0, background: 'transparent', padding: '12px 0', fontSize: '14.5px', outline: 'none', textAlign: 'right', fontFamily: 'inherit' }} />
        </div>
        <button
          onClick={() => setOnlyDisputed((v) => !v)}
          style={{ padding: '11px 18px', background: onlyDisputed ? '#1E2A52' : '#fff', color: onlyDisputed ? '#fff' : '#334155', border: onlyDisputed ? 0 : '1.5px solid #E2E8F0', borderRadius: '11px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          المُعترَض عليها فقط
        </button>
        <span style={{ alignSelf: 'center', fontSize: '13px', color: '#64748B', fontWeight: 700 }}>{filtered.length} تقرير</span>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '14px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '12.5px', fontWeight: 800, color: '#64748B', textAlign: 'right' }}>
          <span>المعرّف</span><span>الشركة المُبلَّغ عنها</span><span>الشركة المُبلِّغة</span><span>السبب</span><span>الاعتماد</span><span>الاعتراض</span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontSize: '14px' }}>
            {onlyDisputed ? 'لا توجد تقارير مُعترَض عليها' : 'لا توجد تقارير معتمدة بعد'}
          </div>
        ) : filtered.map((r) => {
          const d = r.dispute_status && DISPUTE[r.dispute_status]
          return (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: COLS, padding: '13px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center', textAlign: 'right' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#1E2A52', fontFamily: 'monospace' }}>RPT-{String(r.id).slice(0, 8)}</span>
              <div>
                <div style={{ fontSize: '14px', color: '#0F172A', fontWeight: 700 }}>{r.target_company || '—'}</div>
                {r.target_sector && <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>{r.target_sector}</div>}
              </div>
              <div>
                <div style={{ fontSize: '13px', color: '#334155', fontWeight: 700 }}>{r.reporter_name || 'غير مُتتبَّع'}</div>
                {r.reporter_cr && <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600, direction: 'ltr', textAlign: 'right' }}>{r.reporter_cr}</div>}
              </div>
              <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>{CATEGORY_LABEL[r.category] || r.category || '—'}</span>
              <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>{r.approved_at ? new Date(r.approved_at).toLocaleDateString('en-GB') : '—'}</span>
              <span>
                {d ? (
                  <span style={{ background: d.bg, color: d.c, borderRadius: '7px', padding: '4px 10px', fontSize: '11.5px', fontWeight: 800 }}>{d.label}</span>
                ) : (
                  <span style={{ fontSize: '12px', color: '#CBD5E1', fontWeight: 700 }}>—</span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
