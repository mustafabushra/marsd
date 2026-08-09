import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '../lib/api'

/**
 * The queue, and one request opened.
 *
 * Requests were being written and nothing showed them: the first real
 * registration would arrive, sit in `company_requests` with a state, and nobody
 * would know — the same failure as before, wearing better clothes.
 *
 * ============================================================================
 * One screen, not five
 * ============================================================================
 * Everything a decision needs arrives in one call: the company as the registry
 * has it, who applied, every document with who sent it and when, the reports
 * filed against the company, its score, and the timeline. A reviewer who has to
 * open five screens to decide one thing decides it on fewer facts than they
 * meant to.
 *
 * Waiting time is on every row. It is the number a queue is actually about, and
 * it was nowhere in the product.
 */

const STATES = [
  { v: null, t: 'الكل' },
  { v: 'submitted', t: 'جديدة', tone: '#1D4ED8', bg: '#EFF6FF' },
  { v: 'resubmitted', t: 'رُدّ عليها', tone: '#7C3AED', bg: '#F5F3FF' },
  { v: 'under_review', t: 'قيد المراجعة', tone: '#B45309', bg: '#FFFBEB' },
  { v: 'clarification_needed', t: 'بانتظار الشركة', tone: '#B45309', bg: '#FFFBEB' },
  { v: 'approved', t: 'مقبولة', tone: '#15803D', bg: '#F0FDF4' },
  { v: 'rejected', t: 'مرفوضة', tone: '#B91C1C', bg: '#FEF2F2' },
]

const KINDS = {
  registration: 'تسجيل شركة',
  claim: 'مطالبة بملكية',
  data_update: 'تصحيح بيانات',
  document_review: 'مراجعة مستندات',
}

const toneOf = (s) => STATES.find((x) => x.v === s) || { t: s, tone: '#64748B', bg: '#F1F5F9' }

export default function AdminRequestQueue() {
  const [filter, setFilter] = useState('submitted')
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [open, setOpen] = useState(null)      // the request being read
  const [detail, setDetail] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const sb = getSupabase()
      const [{ data: q, error: e1 }, { data: c }] = await Promise.all([
        sb.rpc('admin_request_queue', { p_status: filter, p_limit: 100 }),
        sb.rpc('admin_request_counts'),
      ])
      if (e1) throw e1
      setRows(q || [])
      setCounts(Object.fromEntries((c || []).map((x) => [x.status, x.n])))
    } catch (e) {
      setError(e.message || 'تعذّر تحميل الطلبات')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const openRequest = async (id) => {
    setOpen(id)
    setDetail(null)
    setNote('')
    try {
      const { data, error: e } = await getSupabase().rpc('admin_request_detail', { p_request_id: id })
      if (e) throw e
      setDetail(data)
    } catch (e) {
      setError(e.message || 'تعذّر فتح الطلب')
      setOpen(null)
    }
  }

  /** Decide, or ask for something. Both go through the database's own moves. */
  const act = async (what) => {
    if (what !== 'approve' && !note.trim()) {
      setError(what === 'clarify' ? 'اكتب ما المطلوب من الشركة' : 'سبب الرفض مطلوب')
      return
    }

    setBusy(true)
    setError('')
    try {
      const sb = getSupabase()
      const { error: e } = what === 'clarify'
        ? await sb.rpc('request_company_clarification', { p_request_id: open, p_note: note.trim() })
        : await sb.rpc('decide_company_request', {
          p_request_id: open,
          p_approve: what === 'approve',
          p_reason: note.trim() || null,
        })

      if (e) throw e
      setOpen(null)
      setDetail(null)
      await load()
    } catch (e) {
      setError(e.message || 'تعذّر تنفيذ الإجراء')
    } finally {
      setBusy(false)
    }
  }

  const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px', marginBottom: '14px' }
  const label = { fontSize: '12px', fontWeight: 800, color: '#64748B', marginBottom: '8px' }

  // --- One request, whole -------------------------------------------------------
  if (open) {
    const d = detail
    const co = d?.company
    const req = d?.request
    const required = d?.required_documents || []
    const docs = d?.documents || []

    return (
      <div style={{ maxWidth: '980px', margin: '0 auto' }}>
        <button onClick={() => { setOpen(null); setDetail(null) }}
                style={{ background: 'none', border: 0, color: '#64748B', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', marginBottom: '14px' }}>
          → رجوع للطلبات
        </button>

        {!d ? (
          <div style={{ ...card, color: '#94A3B8' }}>جاري التحميل…</div>
        ) : (
          <>
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px' }}>
                    {co?.name}
                  </h1>
                  <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.9 }}>
                    سجل {co?.cr_number}
                    {co?.unified_number ? ` · موحّد ${co.unified_number}` : ''}
                    {co?.city ? ` · ${co.city}` : ''}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ background: toneOf(req?.status).bg, color: toneOf(req?.status).tone, borderRadius: '999px', padding: '5px 13px', fontSize: '12.5px', fontWeight: 800 }}>
                    {toneOf(req?.status).t}
                  </span>
                  <span style={{ background: '#F1F5F9', color: '#475569', borderRadius: '999px', padding: '5px 13px', fontSize: '12.5px', fontWeight: 800 }}>
                    {KINDS[req?.kind] || req?.kind}
                  </span>
                  {/* Which claim is in front of the reviewer. A company the
                      Ministry published and one somebody typed are different
                      things to be deciding about. */}
                  {co?.from_registry && (
                    <span style={{ background: '#EFF6FF', color: '#1D4ED8', borderRadius: '999px', padding: '5px 13px', fontSize: '12.5px', fontWeight: 800 }}>
                      🏛 من السجل التجاري
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* --- Documents --- */}
            <div style={card}>
              <div style={label}>المستندات — {docs.length} من {required.length} مطلوبة</div>
              {docs.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#94A3B8' }}>لا مستندات</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {docs.map((x) => (
                    <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: '11px', padding: '11px 13px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '11px' }}>
                      <span style={{ flex: 'none' }}>{x.status === 'verified' ? '✅' : x.status === 'rejected' ? '❌' : '📄'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>
                          {x.label || x.doc_type}
                        </div>
                        {/* Who sent it and when. Stored since the documents work
                            landed and shown nowhere until now. */}
                        <div style={{ fontSize: '12px', color: '#64748B', lineHeight: 1.8 }}>
                          {x.file_name}
                          {x.uploaded_by ? ` · ${x.uploaded_by}` : ''}
                          {x.uploaded_at ? ` · ${String(x.uploaded_at).slice(0, 10)}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* --- The account --- */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div style={card}>
                <div style={label}>الحساب</div>
                <div style={{ fontSize: '13px', color: '#334155', lineHeight: 2 }}>
                  {d.tenant?.name || '—'}
                  <br />
                  {d.tenant?.email || ''}
                </div>
                {(d.users || []).map((u) => (
                  <div key={u.email} style={{ fontSize: '12.5px', color: '#64748B', marginTop: '6px' }}>
                    {u.email} · {u.role}
                  </div>
                ))}
              </div>

              <div style={card}>
                <div style={label}>مؤشّر الثقة والتقارير</div>
                <div style={{ fontSize: '13px', color: '#334155', lineHeight: 2 }}>
                  الدرجة: {d.trust_score?.score ?? '—'}
                  <br />
                  التقارير: {(d.reports || []).length}
                  <br />
                  الاشتراك: {d.subscription?.plan || '—'}
                </div>
              </div>
            </div>

            {/* --- Timeline --- */}
            <div style={card}>
              <div style={label}>الخطّ الزمني</div>
              {(d.timeline || []).map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: '11px', paddingBottom: '11px', fontSize: '13px', color: '#334155', lineHeight: 1.9 }}>
                  <span style={{ color: '#94A3B8', flex: 'none', fontSize: '12px' }}>
                    {String(e.at).slice(0, 16).replace('T', ' ')}
                  </span>
                  <span>
                    <b>{e.event}</b>
                    {e.actor ? ` · ${e.actor}` : ''}
                    {e.note ? <div style={{ color: '#B45309' }}>{e.note}</div> : null}
                  </span>
                </div>
              ))}
            </div>

            {/* --- The decision --- */}
            {!['approved', 'rejected', 'withdrawn'].includes(req?.status) && (
              <div style={card}>
                <div style={label}>القرار</div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="سبب الرفض، أو ما المطلوب من الشركة"
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1.5px solid #E2E8F0', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical', marginBottom: '12px' }}
                />
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button onClick={() => act('approve')} disabled={busy}
                          style={{ minHeight: '44px', padding: '0 22px', background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                    قبول
                  </button>
                  <button onClick={() => act('clarify')} disabled={busy}
                          style={{ minHeight: '44px', padding: '0 22px', background: '#fff', color: '#B45309', border: '1.5px solid #FDE68A', borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                    طلب توضيح
                  </button>
                  <button onClick={() => act('reject')} disabled={busy}
                          style={{ minHeight: '44px', padding: '0 22px', background: '#fff', color: '#B91C1C', border: '1.5px solid #FECACA', borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                    رفض
                  </button>
                </div>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '10px', lineHeight: 1.9 }}>
                  الرفض وطلب التوضيح يحتاجان سبباً — قرار لا يستطيع أحد التصرّف
                  حياله سيعود إليك ثانية.
                </div>
              </div>
            )}

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: '12px', padding: '13px', fontSize: '13.5px', fontWeight: 700 }}>
                {error}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // --- The queue ------------------------------------------------------------------
  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px' }}>
        طلبات الشركات
      </h1>
      <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 18px', lineHeight: 1.9 }}>
        التسجيل والمطالبة والتصحيح — كل طلب بحالته ومستنداته، والمدّة التي انتظرها.
      </p>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
        {STATES.map((s) => {
          const on = filter === s.v
          const n = s.v ? counts[s.v] : Object.values(counts).reduce((a, b) => a + b, 0)
          return (
            <button key={s.t} onClick={() => setFilter(s.v)}
                    style={{
                      minHeight: '40px', padding: '0 15px', borderRadius: '999px',
                      border: on ? 0 : '1.5px solid #E2E8F0',
                      background: on ? '#1E2A52' : '#fff',
                      color: on ? '#fff' : '#475569',
                      fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                    }}>
              {s.t}{n ? ` (${n})` : ''}
            </button>
          )
        })}
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: '12px', padding: '13px', marginBottom: '14px', fontSize: '13.5px', fontWeight: 700 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ ...card, color: '#94A3B8' }}>جاري التحميل…</div>
      ) : rows.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: '#94A3B8', padding: '40px' }}>
          لا طلبات في هذه الحالة
        </div>
      ) : (
        rows.map((r) => (
          <div key={r.id} onClick={() => openRequest(r.id)}
               style={{ ...card, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{r.company_name}</div>
              <div style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.9 }}>
                سجل {r.cr_number} · {KINDS[r.kind] || r.kind}
                {r.tenant_name ? ` · ${r.tenant_name}` : ''}
              </div>
              {r.last_note && (
                <div style={{ fontSize: '12px', color: '#B45309', marginTop: '3px' }}>{r.last_note}</div>
              )}
            </div>

            <span style={{
              background: r.documents_ready >= r.documents_total ? '#F0FDF4' : '#FFFBEB',
              color: r.documents_ready >= r.documents_total ? '#15803D' : '#B45309',
              borderRadius: '999px', padding: '5px 12px', fontSize: '12px', fontWeight: 800, flex: 'none',
            }}>
              {r.documents_ready}/{r.documents_total} مستند
            </span>

            {/* What a queue is actually about, and it was nowhere in the product. */}
            {r.submitted_at && (
              <span style={{ fontSize: '12.5px', color: r.waiting_days > 3 ? '#B91C1C' : '#64748B', fontWeight: 800, flex: 'none' }}>
                {r.waiting_days === 0 ? 'اليوم' : `منذ ${r.waiting_days} يوم`}
              </span>
            )}

            <span style={{ background: toneOf(r.status).bg, color: toneOf(r.status).tone, borderRadius: '999px', padding: '5px 13px', fontSize: '12.5px', fontWeight: 800, flex: 'none' }}>
              {toneOf(r.status).t}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
