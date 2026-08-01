import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'

/**
 * /admin/roster — every company, and what each one is waiting on.
 *
 * The panel listed companies in several places and none answered the question
 * actually asked every day: which companies have given us their data, and which
 * are waiting on what. Answering it meant opening a company, then its documents,
 * then its audit log, and holding that in your head while doing the same for the
 * next one.
 *
 * Everything here was already stored. What was missing was one place to read it,
 * ordered by what needs chasing — open questions first, then pending documents,
 * then anything not yet approved.
 */

const REVIEW = {
  under_review:            { t: 'قيد المراجعة',        bg: '#EEF2FF', fg: '#1E40AF' },
  awaiting_verification:   { t: 'بانتظار التحقق',       bg: '#EEF2FF', fg: '#1E40AF' },
  clarification_needed:    { t: 'مطلوب توضيح',         bg: '#FFFBEB', fg: '#B45309' },
  awaiting_documents:      { t: 'بانتظار مستندات',      bg: '#FFFBEB', fg: '#B45309' },
  clarification_received:  { t: 'تم استلام التوضيح',    bg: '#ECFDF5', fg: '#15803D' },
  suspended_incomplete:    { t: 'موقوفة لنقص المعلومات', bg: '#FEF2F2', fg: '#B91C1C' },
  rejected:                { t: 'مرفوضة',              bg: '#FEF2F2', fg: '#B91C1C' },
  frozen:                  { t: 'مجمدة',               bg: '#FEF2F2', fg: '#B91C1C' },
  on_hold:                 { t: 'موقوفة مؤقتاً',        bg: '#F1F5F9', fg: '#475569' },
  approved:                { t: 'معتمدة',              bg: '#ECFDF5', fg: '#15803D' },
}

const OFFICIAL = {
  insolvency: 'تعثّر مالي', bankruptcy: 'إفلاس', liquidation: 'تصفية',
  suspended: 'إيقاف نشاط', struck_off: 'شطب السجل',
}

const CLARIFICATION_TYPES = [
  { v: 'information', t: 'معلومات ناقصة' },
  { v: 'documents', t: 'مستندات مطلوبة' },
  { v: 'correction', t: 'تصحيح بيانات' },
  { v: 'verification', t: 'تحقّق من الهوية' },
]

const DOC_OPTIONS = [
  { v: 'commercial_registration', t: 'السجل التجاري' },
  { v: 'tax_certificate', t: 'الشهادة الضريبية' },
  { v: 'national_address', t: 'العنوان الوطني' },
  { v: 'chamber_membership', t: 'عضوية الغرفة' },
  { v: 'license', t: 'ترخيص النشاط' },
  { v: 'bank_letter', t: 'خطاب بنكي' },
]

const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString('ar-SA') : '—')

export default function AdminRoster() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [filter, setFilter] = useState('needs_attention')
  // A second axis, not more tabs. The row above answers "what needs me"; this
  // answers "show me companies in state X". Ten states as tabs beside five
  // actions is fifteen buttons and no hierarchy — and folding the states into
  // the actions would hide the four that no action names.
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [asking, setAsking] = useState(null)   // the company a request is being written for
  const [form, setForm] = useState({ type: 'information', reason: '', details: '', docs: [], days: 14 })
  const [busy, setBusy] = useState(false)

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 4000) }

  const load = useCallback(async () => {
    try {
      setError('')
      const { data, error: e } = await getSupabase().rpc('company_roster')
      if (e) throw e
      setRows(data || [])
    } catch (err) {
      setError(err.message || 'تعذّر تحميل سجلّ الشركات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  const { connected, liveAt } = useLiveData(load, {
    tables: ['companies', 'company_documents', 'clarification_requests'],
  })

  const counts = useMemo(() => ({
    all: rows.length,
    needs_attention: rows.filter((r) => r.open_clarifications > 0 || r.docs_pending > 0 || r.review_status !== 'approved').length,
    no_data: rows.filter((r) => (r.completeness || 0) < 50 && r.docs_verified === 0).length,
    waiting: rows.filter((r) => ['clarification_needed', 'awaiting_documents'].includes(r.review_status)).length,
    flagged: rows.filter((r) => r.official_status && r.official_status !== 'none').length,
    untraced: rows.filter((r) => !r.registrar).length,
  }), [rows])

  const shown = useMemo(() => {
    let list = rows
    if (filter === 'needs_attention') list = list.filter((r) => r.open_clarifications > 0 || r.docs_pending > 0 || r.review_status !== 'approved')
    else if (filter === 'no_data') list = list.filter((r) => (r.completeness || 0) < 50 && r.docs_verified === 0)
    else if (filter === 'waiting') list = list.filter((r) => ['clarification_needed', 'awaiting_documents'].includes(r.review_status))
    else if (filter === 'flagged') list = list.filter((r) => r.official_status && r.official_status !== 'none')
    // Carried over from the knowledge base, which was the only screen that had
    // it: companies whose registrar cannot be traced. A record nobody can be
    // asked about is the one you cannot correct at the source.
    else if (filter === 'untraced') list = list.filter((r) => !r.registrar)
    if (status) list = list.filter((r) => r.review_status === status)
    const term = q.trim()
    if (term) list = list.filter((r) => (r.name || '').includes(term) || (r.cr_number || '').includes(term))
    return list
  }, [rows, filter, q, status])

  const sendRequest = async () => {
    if (!form.reason.trim()) { showToast('❌ سبب طلب التوضيح مطلوب'); return }
    try {
      setBusy(true)
      const { data, error: e } = await getSupabase().rpc('request_clarification', {
        p_company_id: asking.company_id,
        p_reason: form.reason.trim(),
        p_details: form.details.trim() || null,
        p_type: form.type,
        p_documents: form.docs.length ? form.docs : null,
        p_due_days: Number(form.days) || 14,
      })
      if (e) throw e
      // The function answers with its own refusal rather than throwing.
      if (!data?.ok) { showToast('❌ ' + (data?.reason || 'تعذّر الإرسال')); return }

      // Tell the company. A request nobody is told about is a file that stops
      // for a reason its owner cannot see.
      const { notifyTenant } = await import('../lib/notify')
      const { data: t } = await getSupabase()
        .from('tenants').select('id').eq('company_id', asking.company_id).maybeSingle()
      if (t?.id) {
        await notifyTenant(t.id, 'clarification_requested', {
          title: 'مطلوب توضيح على طلب شركتك',
          message: `${form.reason.trim()} — راجع «طلبات التوضيح» في ملف شركتك وأضف المعلومات أو المستندات المطلوبة لاستكمال المراجعة.`,
          meta: { company_id: asking.company_id, type: form.type },
        })
      }

      showToast('✅ أُرسل طلب التوضيح وأُوقف سير المراجعة حتى الردّ')
      setAsking(null)
      setForm({ type: 'information', reason: '', details: '', docs: [], days: 14 })
      load()
    } catch (err) {
      showToast('❌ ' + (err?.message || 'خطأ غير معروف'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', minHeight: '40vh', alignItems: 'center', color: '#64748B', fontWeight: 600 }}>جاري التحميل…</div>
  }

  // Only states that exist. An empty state as a permanent chip is a filter that
  // never returns anything, and people learn to stop pressing it.
  const statusCounts = rows.reduce((m, r) => {
    m[r.review_status] = (m[r.review_status] || 0) + 1
    return m
  }, {})

  const TABS = [
    { v: 'needs_attention', t: 'تحتاج متابعة', n: counts.needs_attention },
    { v: 'waiting', t: 'بانتظار الشركة', n: counts.waiting },
    { v: 'no_data', t: 'لم تُعطِ بياناتها', n: counts.no_data },
    { v: 'flagged', t: 'حالة رسمية', n: counts.flagged },
    { v: 'untraced', t: 'غير مُتتبَّعة', n: counts.untraced },
    { v: 'all', t: 'الكل', n: counts.all },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px' }}>سجلّ الشركات</h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
            كل شركة في السجلّ، وما تنتظره — مرتّبة بما يحتاج متابعة أولاً.
          </p>
        </div>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#B91C1C', fontSize: '14px', fontWeight: 700 }}>⚠️ {error}</div>
      )}

      <div style={{ display: 'flex', gap: '9px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.v} onClick={() => setFilter(t.v)} style={{
            padding: '9px 16px', background: filter === t.v ? '#1E2A52' : '#fff',
            color: filter === t.v ? '#fff' : '#334155',
            border: filter === t.v ? 0 : '1.5px solid #E2E8F0', borderRadius: '9px',
            fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {t.t} <span style={{ opacity: 0.7 }}>{t.n}</span>
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو السجل التجاري"
               style={{ flex: 1, minWidth: '200px', padding: '9px 14px', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit' }} />
      </div>

      {/* States, as a filter under the actions. Every state the platform can
          record appears here when a company is in it, so none of the ten is
          reachable only by scrolling the full list. */}
      {Object.keys(statusCounts).length > 1 && (
        <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
          <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#64748B' }}>الحالة:</span>
          <button onClick={() => setStatus('')} style={{
            padding: '6px 13px', borderRadius: '999px', fontSize: '12px', fontWeight: 800,
            cursor: 'pointer', fontFamily: 'inherit',
            background: status === '' ? '#334155' : '#fff', color: status === '' ? '#fff' : '#475569',
            border: status === '' ? 0 : '1.5px solid #E2E8F0',
          }}>الكل</button>
          {Object.entries(statusCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => {
              const rv = REVIEW[k] || REVIEW.approved
              const on = status === k
              return (
                <button key={k} onClick={() => setStatus(on ? '' : k)} style={{
                  padding: '6px 13px', borderRadius: '999px', fontSize: '12px', fontWeight: 800,
                  cursor: 'pointer', fontFamily: 'inherit',
                  background: on ? rv.fg : rv.bg, color: on ? '#fff' : rv.fg,
                  border: 0,
                }}>
                  {rv.t} <span style={{ opacity: 0.75 }}>{n}</span>
                </button>
              )
            })}
        </div>
      )}

      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13.5px', minWidth: '980px' }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              {['الشركة', 'حالة المراجعة', 'السبب', 'البيانات', 'مستندات', 'من سجّلها', 'آخر إجراء', ''].map((h) => (
                <th key={h} style={{ textAlign: 'right', padding: '11px 14px', fontSize: '11px', letterSpacing: '.06em', color: '#64748B', fontWeight: 800, borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={8} style={{ padding: '28px', textAlign: 'center', color: '#64748B', fontWeight: 600 }}>لا شركات في هذا التصنيف</td></tr>
            )}
            {shown.map((r) => {
              const rv = REVIEW[r.review_status] || REVIEW.approved
              return (
                <tr key={r.company_id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 800, color: '#0F172A' }}>{r.name}</div>
                    <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '3px' }}>
                      {r.cr_number || '—'} · {r.sector || 'بلا قطاع'}
                      {r.trust_score != null && ` · مؤشر ${r.trust_score}`}
                    </div>
                    {r.official_status && r.official_status !== 'none' && (
                      <div style={{ fontSize: '11.5px', color: '#B91C1C', fontWeight: 800, marginTop: '4px' }}>
                        ⚠ {OFFICIAL[r.official_status] || r.official_status}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    <span style={{ background: rv.bg, color: rv.fg, borderRadius: '999px', padding: '4px 12px', fontSize: '12px', fontWeight: 800 }}>{rv.t}</span>
                    {r.open_clarifications > 0 && (
                      <div style={{ fontSize: '11.5px', color: '#B45309', fontWeight: 800, marginTop: '5px' }}>
                        {r.open_clarifications} طلب توضيح مفتوح
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px', verticalAlign: 'top', color: '#475569', maxWidth: '220px' }}>
                    {r.review_reason || '—'}
                  </td>
                  <td style={{ padding: '12px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    <span style={{
                      fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                      color: (r.completeness || 0) >= 70 ? '#15803D' : (r.completeness || 0) >= 40 ? '#B45309' : '#B91C1C',
                    }}>{r.completeness ?? 0}%</span>
                    <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '3px' }}>
                      {r.reports_about ?? 0} تقرير
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#15803D', fontWeight: 800 }}>{r.docs_verified ?? 0}</span>
                    <span style={{ color: '#64748B' }}> موثَّق</span>
                    {r.docs_pending > 0 && (
                      <div style={{ fontSize: '11.5px', color: '#B45309', fontWeight: 800, marginTop: '3px' }}>
                        {r.docs_pending} بانتظار المراجعة
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px', verticalAlign: 'top', color: '#475569' }}>
                    {r.registrar || (r.source === 'community' ? 'مصدر غير مُتتبَّع' : 'تسجيل ذاتي')}
                    {r.claimed_by && (
                      <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '3px' }}>مالكها: {r.claimed_by}</div>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px', verticalAlign: 'top', color: '#475569', whiteSpace: 'nowrap' }}>
                    {r.last_action || '—'}
                    <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '3px' }}>
                      {fmt(r.last_action_at)}{r.last_action_by ? ` · ${r.last_action_by}` : ''}
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    <button onClick={() => navigate(`/trust-report/${r.company_id}`)}
                            style={{
                              padding: '7px 14px', border: '1.5px solid #E2E8F0', borderRadius: '8px',
                              background: '#fff', color: '#1E2A52', fontSize: '12.5px', fontWeight: 800,
                              cursor: 'pointer', fontFamily: 'inherit', marginInlineEnd: '7px',
                            }}>
                      تقرير الثقة
                    </button>
                    <button onClick={() => setAsking(r)}
                            disabled={r.open_clarifications > 0}
                            title={r.open_clarifications > 0 ? 'يوجد طلب توضيح مفتوح بالفعل' : ''}
                            style={{
                              padding: '7px 14px', border: '1.5px solid #E2E8F0', borderRadius: '8px',
                              background: '#fff', color: r.open_clarifications > 0 ? '#94A3B8' : '#1E2A52',
                              fontSize: '12.5px', fontWeight: 800,
                              cursor: r.open_clarifications > 0 ? 'default' : 'pointer', fontFamily: 'inherit',
                            }}>
                      طلب توضيح
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* The request is written before it is sent. A reason is required by the
          function and by the constraint behind it, so this asks for one rather
          than letting the send fail. */}
      {asking && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 200, padding: '20px' }}
             onClick={(e) => { if (e.target === e.currentTarget) setAsking(null) }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '26px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }}>طلب توضيح</h2>
            <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 18px' }}>
              {asking.name} — سيتوقّف سير المراجعة حتى تردّ الشركة.
            </p>

            <div style={{ display: 'grid', gap: '14px' }}>
              <label>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '7px' }}>نوع التوضيح</span>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                        style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontFamily: 'inherit', background: '#fff' }}>
                  {CLARIFICATION_TYPES.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
                </select>
              </label>

              <label>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '7px' }}>السبب *</span>
                <input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                       placeholder="مثال: رقم السجل التجاري لا يطابق الوثيقة المرفقة"
                       style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontFamily: 'inherit' }} />
                <span style={{ display: 'block', fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                  يُعرض للشركة كما تكتبه — ولا يمكن الإرسال بدونه.
                </span>
              </label>

              <label>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '7px' }}>تفاصيل ما هو مطلوب</span>
                <textarea value={form.details} onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                          rows={3} placeholder="اشرح بدقّة ما الذي يجب أن ترسله الشركة"
                          style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' }} />
              </label>

              <div>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '9px' }}>مستندات مطلوبة</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {DOC_OPTIONS.map((d) => {
                    const on = form.docs.includes(d.v)
                    return (
                      <button key={d.v} type="button"
                              onClick={() => setForm((f) => ({ ...f, docs: on ? f.docs.filter((x) => x !== d.v) : [...f.docs, d.v] }))}
                              style={{
                                padding: '7px 14px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 800,
                                border: on ? 0 : '1.5px solid #E2E8F0', background: on ? '#1E2A52' : '#fff',
                                color: on ? '#fff' : '#334155', cursor: 'pointer', fontFamily: 'inherit',
                              }}>
                        {on ? '✔ ' : ''}{d.t}
                      </button>
                    )
                  })}
                </div>
              </div>

              <label>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '7px' }}>مهلة الردّ (أيام)</span>
                <input type="number" min="0" value={form.days}
                       onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
                       style={{ width: '120px', padding: '11px 14px', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontFamily: 'inherit' }} />
              </label>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '22px', justifyContent: 'flex-start' }}>
              <button onClick={sendRequest} disabled={busy || !form.reason.trim()}
                      style={{
                        padding: '12px 26px', background: form.reason.trim() ? '#1E2A52' : '#CBD5E1',
                        color: '#fff', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800,
                        cursor: form.reason.trim() ? 'pointer' : 'default', fontFamily: 'inherit',
                      }}>
                {busy ? 'جارٍ الإرسال…' : 'إرسال الطلب وإيقاف السير'}
              </button>
              <button onClick={() => setAsking(null)}
                      style={{ padding: '12px 22px', background: '#fff', color: '#475569', border: '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', insetInlineStart: '24px', background: '#0F172A', color: '#fff', padding: '13px 22px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, zIndex: 300, maxWidth: '460px', lineHeight: 1.7 }}>{toast}</div>
      )}
    </div>
  )
}
