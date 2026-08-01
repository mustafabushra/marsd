import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'

/**
 * /admin/company/:id — one company, everything about it.
 *
 * The panel had three company lists and six queues, and understanding a single
 * company meant opening seven screens and holding the result in your head while
 * you did it again for the next one. The instinct was to merge the lists; that
 * was wrong, and reading them showed why — they answer different questions with
 * different columns, and one table carrying all of it is twenty-five columns
 * nobody can read.
 *
 * The duplication was never the lists. It was that a company had no page. The
 * lists stay as different ways in; this is what they lead to.
 *
 * Every tab is fed by an RPC that already existed, written for the screens that
 * came before it — so nothing here computes anything a different screen might
 * compute differently.
 */

const REVIEW = {
  under_review:           { t: 'قيد المراجعة',        bg: '#EEF2FF', fg: '#1E40AF' },
  awaiting_verification:  { t: 'بانتظار التحقق',       bg: '#EEF2FF', fg: '#1E40AF' },
  clarification_needed:   { t: 'مطلوب توضيح',         bg: '#FFFBEB', fg: '#B45309' },
  awaiting_documents:     { t: 'بانتظار مستندات',      bg: '#FFFBEB', fg: '#B45309' },
  clarification_received: { t: 'تم استلام التوضيح',    bg: '#ECFDF5', fg: '#15803D' },
  suspended_incomplete:   { t: 'موقوفة لنقص المعلومات', bg: '#FEF2F2', fg: '#B91C1C' },
  rejected:               { t: 'مرفوضة',              bg: '#FEF2F2', fg: '#B91C1C' },
  frozen:                 { t: 'مجمدة',               bg: '#FEF2F2', fg: '#B91C1C' },
  on_hold:                { t: 'موقوفة مؤقتاً',        bg: '#F1F5F9', fg: '#475569' },
  approved:               { t: 'معتمدة',              bg: '#ECFDF5', fg: '#15803D' },
}

const DOC_STATE = {
  verified: { t: '✅ معتمد', fg: '#15803D' },
  pending:  { t: '⏳ قيد المراجعة', fg: '#B45309' },
  missing:  { t: '❌ مفقود', fg: '#64748B' },
  expired:  { t: '⚠ منتهٍ', fg: '#B91C1C' },
  rejected: { t: '✕ مرفوض', fg: '#B91C1C' },
  reupload_required: { t: '🔄 إعادة رفع', fg: '#B45309' },
}

const TABS = [
  { v: 'overview', t: 'نظرة عامة' },
  { v: 'data', t: 'البيانات الأساسية' },
  { v: 'documents', t: 'المستندات' },
  { v: 'reports', t: 'التقارير' },
  { v: 'clarifications', t: 'طلبات التوضيح' },
  { v: 'score', t: 'مؤشر الثقة' },
  { v: 'activity', t: 'سجل النشاط' },
]

const fmt = (d) => (d ? new Date(d).toLocaleDateString('ar-SA') : '—')
const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '20px' }
const h3 = { fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: '0 0 14px' }
const lbl = { fontSize: '11.5px', color: '#64748B', fontWeight: 700 }
const val = { fontSize: '14px', color: '#0F172A', fontWeight: 700, marginTop: '3px' }

function Field({ k, v }) {
  if (v == null || v === '') return null
  return <div><div style={lbl}>{k}</div><div style={val}>{v}</div></div>
}

function Stat({ k, v, sub }) {
  return (
    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '11px', padding: '14px' }}>
      <div style={lbl}>{k}</div>
      <div style={{ fontSize: '21px', fontWeight: 900, color: '#1E2A52', lineHeight: 1, marginTop: '7px', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
      {sub && <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600, marginTop: '6px' }}>{sub}</div>}
    </div>
  )
}

const Grid = ({ children, min = 150 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))`, gap: '13px' }}>{children}</div>
)

export default function AdminCompanyFile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [file, setFile] = useState(null)
  const [full, setFull] = useState(null)
  const [docs, setDocs] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setError('')
      const sb = getSupabase()
      // One round of calls, all of them RPCs written for earlier screens — so no
      // figure here can disagree with the same figure shown elsewhere.
      const [a, b, c, d] = await Promise.all([
        sb.rpc('company_review_file', { p_company_id: id }),
        sb.rpc('company_report_full', { p_company_id: id }),
        sb.rpc('company_document_checklist', { p_company_id: id }),
        sb.rpc('company_score_history', { p_company_id: id, p_limit: 24 }),
      ])
      setFile(a.data || null)
      setFull(b.data || null)
      setDocs(Array.isArray(c.data) ? c.data : [])
      setHistory(Array.isArray(d.data) ? d.data : [])
    } catch (err) {
      setError(err.message || 'تعذّر تحميل ملف الشركة')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])
  useLiveData(load, { tables: ['companies', 'company_documents', 'clarification_requests', 'reports'] })

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', minHeight: '40vh', alignItems: 'center', color: '#64748B', fontWeight: 600 }}>جاري التحميل…</div>
  }

  if (error || !file?.company_id) {
    return (
      <div style={card}>
        <h1 style={{ fontSize: '19px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px' }}>ملف الشركة</h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>{error || 'الشركة غير موجودة، أو ليست ضمن صلاحيتك.'}</p>
      </div>
    )
  }

  const ident = full?.identity || {}
  const beh = full?.behaviour || {}
  const q = full?.quality || {}
  const rv = REVIEW[file.review_status] || REVIEW.approved
  const openClar = (file.clarifications || []).filter((c) => c.status === 'open')

  return (
    <div>
      {/* Header — the identity and the state, on every tab. */}
      <div style={{ ...card, marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ minWidth: '220px', flex: 1 }}>
            <button onClick={() => navigate('/admin/roster')}
                    style={{ background: 'none', border: 0, color: '#64748B', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginBottom: '8px' }}>
              ‹ رجوع لسجلّ الشركات
            </button>
            <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', margin: '0 0 10px' }}>{file.name}</h1>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ background: rv.bg, color: rv.fg, borderRadius: '999px', padding: '5px 14px', fontSize: '12.5px', fontWeight: 800 }}>{rv.t}</span>
              {ident.verified && <span style={{ background: '#ECFDF5', color: '#15803D', borderRadius: '999px', padding: '5px 12px', fontSize: '12.5px', fontWeight: 800 }}>✔ موثّقة</span>}
              {ident.official_status?.status && ident.official_status.status !== 'none' && (
                <span style={{ background: '#FEF2F2', color: '#B91C1C', borderRadius: '999px', padding: '5px 12px', fontSize: '12.5px', fontWeight: 800 }}>
                  ⚠ {ident.official_status.status}
                </span>
              )}
            </div>
            {file.review_reason && (
              <div style={{ fontSize: '13px', color: '#B45309', fontWeight: 700, marginTop: '10px' }}>
                السبب: {file.review_reason}
                {file.review_by && <span style={{ color: '#64748B', fontWeight: 600 }}> — {file.review_by} · {fmt(file.review_at)}</span>}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'center', flex: 'none' }}>
            <div style={{ fontSize: '36px', fontWeight: 900, color: '#1E2A52', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {full?.market?.rank != null ? Math.round(history[history.length - 1]?.score ?? 0) || '—' : '—'}
            </div>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, marginTop: '4px' }}>مؤشر الثقة</div>
            <button onClick={() => navigate(`/trust-report/${id}`)}
                    style={{ marginTop: '10px', padding: '7px 14px', border: '1.5px solid #E2E8F0', borderRadius: '8px', background: '#fff', color: '#1E2A52', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              التقرير الكامل
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {TABS.map((t) => {
          const badge = t.v === 'clarifications' ? openClar.length
            : t.v === 'documents' ? docs.filter((d) => d.state === 'pending').length : 0
          return (
            <button key={t.v} onClick={() => setTab(t.v)} style={{
              padding: '9px 16px', borderRadius: '9px', fontSize: '13px', fontWeight: 800,
              cursor: 'pointer', fontFamily: 'inherit',
              background: tab === t.v ? '#1E2A52' : '#fff',
              color: tab === t.v ? '#fff' : '#334155',
              border: tab === t.v ? 0 : '1.5px solid #E2E8F0',
            }}>
              {t.t}
              {badge > 0 && (
                <span style={{ background: '#DC2626', color: '#fff', borderRadius: '999px', padding: '1px 7px', fontSize: '11px', marginInlineStart: '7px' }}>{badge}</span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={card}>
            <h2 style={h3}>السلوك التجاري</h2>
            <Grid>
              <Stat k="تقارير معتمدة" v={beh.reports_approved ?? 0} sub={`من ${beh.reports_total ?? 0}`} />
              <Stat k="نسبة السداد الكامل" v={beh.on_time_pct == null ? '—' : `${beh.on_time_pct}%`} />
              <Stat k="متوسط التأخير" v={`${beh.avg_delay ?? 0} يوم`} sub={`أعلى ${beh.max_delay ?? 0}`} />
              <Stat k="حالات عدم السداد" v={beh.defaults ?? 0} />
              <Stat k="جهات مُبلِّغة" v={beh.counterparties ?? 0} sub="مستقلّة" />
              <Stat k="قيد المراجعة" v={beh.reports_pending ?? 0} sub={`${beh.reports_rejected ?? 0} مرفوض`} />
            </Grid>
          </div>
          <div style={card}>
            <h2 style={h3}>جودة السجلّ</h2>
            <Grid>
              <Stat k="اكتمال البيانات" v={`${q.profile_completeness ?? 0}%`} />
              <Stat k="مستندات موثّقة" v={q.documents ?? 0} sub={`${docs.filter((d) => d.state === 'pending').length} بانتظار المراجعة`} />
              <Stat k="آخر تقرير" v={fmt(q.last_report_at)} />
              <Stat k="اعتراضات قائمة" v={q.disputes_open ?? 0} />
            </Grid>
          </div>
        </div>
      )}

      {tab === 'data' && (
        <div style={card}>
          <h2 style={h3}>البيانات الأساسية</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '18px' }}>
            <Field k="اسم الشركة" v={ident.name} />
            <Field k="السجل التجاري" v={ident.cr_number} />
            <Field k="حالة السجل" v={ident.cr_status} />
            <Field k="انتهاء السجل" v={ident.cr_expiry && fmt(ident.cr_expiry)} />
            <Field k="نوع الكيان" v={ident.entity_type} />
            <Field k="القطاع" v={ident.sector} />
            <Field k="المدينة" v={ident.city} />
            <Field k="الحجم" v={ident.enterprise_size} />
            <Field k="تأسست" v={ident.founded && String(ident.founded).slice(0, 4)} />
            <Field k="عمر الشركة" v={ident.age_years != null && `${ident.age_years} سنة`} />
            <Field k="مسجّلة ضريبياً" v={ident.has_tax_id ? 'نعم' : null} />
            <Field k="التوثيق" v={ident.verified ? `موثّقة · ${fmt(ident.verified_at)}` : 'غير موثّقة'} />
          </div>
          {ident.official_status?.status && ident.official_status.status !== 'none' && (
            <div style={{ marginTop: '18px', padding: '14px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '11px' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 900, color: '#B91C1C' }}>حالة رسمية: {ident.official_status.status}</div>
              {ident.official_status.note && <div style={{ fontSize: '13px', color: '#7F1D1D', marginTop: '5px' }}>{ident.official_status.note}</div>}
              <div style={{ fontSize: '12px', color: '#B91C1C', opacity: 0.8, marginTop: '5px' }}>{fmt(ident.official_status.at)}</div>
            </div>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div style={card}>
          <h2 style={h3}>المستندات</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {docs.map((d) => {
              const st = DOC_STATE[d.state] || DOC_STATE.missing
              return (
                <div key={d.doc_type} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center', padding: '12px 14px', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                      {d.label}{d.required && <span style={{ color: '#B91C1C', marginRight: '4px' }}>*</span>}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '3px' }}>
                      {d.file_name || 'لم يُرفع'}{d.expires_at && ` · ينتهي ${fmt(d.expires_at)}`}
                    </div>
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: st.fg, whiteSpace: 'nowrap' }}>{st.t}</span>
                </div>
              )
            })}
          </div>
          <button onClick={() => navigate('/admin/documents')}
                  style={{ marginTop: '16px', padding: '10px 20px', border: '1.5px solid #E2E8F0', borderRadius: '9px', background: '#fff', color: '#1E2A52', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            فتح طابور التوثيق
          </button>
        </div>
      )}

      {tab === 'reports' && (
        <div style={card}>
          <h2 style={h3}>التقارير عن هذه الشركة</h2>
          {(full?.recent || []).length === 0 ? (
            <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>لا تقارير معتمدة بعد.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(full.recent || []).map((r, i) => {
                const ok = r.payment === 'full' && !r.defaulted
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', background: ok ? '#F0FDF4' : '#FFFBEB', borderRadius: '9px', padding: '11px 14px' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 800, color: ok ? '#15803D' : '#B45309' }}>
                      {ok ? '✔' : '!'} {r.payment}{r.delay > 0 ? ` — تأخير ${r.delay} يوم` : ''}{r.defaulted ? ' — تعثّر' : ''}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>{fmt(r.at)}</span>
                  </div>
                )
              })}
            </div>
          )}
          {(full?.sources || []).length > 0 && (
            <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', marginBottom: '10px' }}>مصادر التقارير</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {full.sources.map((s) => (
                  <span key={s.sector} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '999px', padding: '5px 13px', fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>
                    {s.sector} · {s.count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'clarifications' && (
        <div style={card}>
          <h2 style={h3}>طلبات التوضيح</h2>
          {(file.clarifications || []).length === 0 ? (
            <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>لا طلبات توضيح على هذه الشركة.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {file.clarifications.map((c) => (
                <div key={c.id} style={{ border: '1px solid #E2E8F0', borderRadius: '11px', padding: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    <span style={{ fontSize: '14.5px', fontWeight: 900, color: '#0F172A' }}>{c.reason}</span>
                    <span style={{ fontSize: '12.5px', fontWeight: 800, color: c.status === 'open' ? '#B45309' : '#15803D' }}>
                      {c.status === 'open' ? 'بانتظار الشركة' : c.status === 'answered' ? 'وصل الردّ' : c.status}
                    </span>
                  </div>
                  {c.details && <p style={{ fontSize: '13.5px', color: '#334155', margin: '0 0 10px' }}>{c.details}</p>}
                  <div style={{ fontSize: '12px', color: '#64748B', marginBottom: (c.messages || []).length ? '10px' : 0 }}>
                    طُلب {fmt(c.requested_at)}{c.due_at && ` · المهلة ${fmt(c.due_at)}`}
                  </div>
                  {(c.messages || []).map((m, i) => (
                    <div key={i} style={{ background: m.from_marsad ? '#F8FAFC' : '#EEF2FF', borderRadius: '9px', padding: '10px 13px', marginBottom: '6px' }}>
                      <div style={{ fontSize: '11.5px', fontWeight: 800, color: m.from_marsad ? '#64748B' : '#1E40AF', marginBottom: '3px' }}>
                        {m.from_marsad ? 'إدارة مرصد' : 'الشركة'} · {fmt(m.at)}
                      </div>
                      <div style={{ fontSize: '13.5px', color: '#334155', whiteSpace: 'pre-wrap' }}>{m.body}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'score' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={card}>
            <h2 style={h3}>موضعها في السوق</h2>
            <Grid>
              <Stat k="متوسط القطاع" v={full?.market?.sector_avg ?? '—'} sub={ident.sector || ''} />
              <Stat k="الترتيب" v={full?.market?.rank ?? '—'} sub={`من ${full?.market?.rated_total ?? 0} مصنّفة`} />
            </Grid>
          </div>
          <div style={card}>
            <h2 style={h3}>تاريخ المؤشر</h2>
            {history.length < 2 ? (
              <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
                {history.length ? `قياس واحد — سُجّل ${fmt(history[0].recorded_at)}` : 'لا قياسات بعد.'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {[...history].reverse().map((h, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', background: '#F8FAFC', borderRadius: '9px', padding: '10px 13px' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{h.score}</span>
                    <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>
                      {h.approved_reports} تقرير · {fmt(h.recorded_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div style={card}>
          <h2 style={h3}>سجل النشاط</h2>
          {(file.timeline || []).length === 0 ? (
            <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>لا نشاط مسجّل.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {file.timeline.map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '11px 13px', background: '#F8FAFC', borderRadius: '9px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155' }}>
                    {t.action}
                    {t.from && t.to && <span style={{ color: '#64748B' }}> · {t.from} ← {t.to}</span>}
                    {t.reason && <span style={{ display: 'block', fontSize: '12px', color: '#64748B', marginTop: '3px' }}>{t.reason}</span>}
                  </span>
                  <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {t.actor || '—'} · {fmt(t.at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
