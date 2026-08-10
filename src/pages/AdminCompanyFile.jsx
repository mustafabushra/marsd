import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { SkeletonPage } from '../components/Skeleton'

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

// The words the request workflow uses, in Arabic, in one place. A screen that
// spells a status differently from the queue is a screen that describes a
// different system.
const REQUEST_KIND = {
  registration: 'تسجيل شركة',
  claim: 'مطالبة بملكية',
  data_update: 'تصحيح بيانات',
  document_review: 'مراجعة مستندات',
}

const REQUEST_STATE = {
  draft: 'مسودّة',
  submitted: 'جديد',
  under_review: 'قيد المراجعة',
  clarification_needed: 'بانتظار الشركة',
  resubmitted: 'رُدّ عليه',
  approved: 'مقبول',
  rejected: 'مرفوض',
  withdrawn: 'مسحوب',
}

const TABS = [
  { v: 'overview', t: 'نظرة عامة' },
  { v: 'data', t: 'البيانات الأساسية' },
  { v: 'documents', t: 'المستندات' },
  { v: 'account', t: 'الحساب والطلبات' },
  { v: 'reports', t: 'التقارير' },
  { v: 'clarifications', t: 'طلبات التوضيح' },
  { v: 'score', t: 'مؤشر الثقة' },
  { v: 'activity', t: 'سجل النشاط' },
]

// Exactly the fields admin_update_company accepts. approved, verified, status,
// review_status and official_status are absent on purpose — each has its own
// guarded flow, and a general-purpose form is the wrong place to change what a
// company is allowed to be.
const EDITABLE = [
  { k: 'name', t: 'اسم الشركة', req: true },
  { k: 'commercial_name', t: 'الاسم التجاري' },
  { k: 'name_en', t: 'الاسم بالإنجليزية' },
  { k: 'cr_number', t: 'السجل التجاري', hint: '١٠ أرقام' },
  { k: 'unified_number', t: 'الرقم الموحّد' },
  { k: 'tax_id', t: 'الرقم الضريبي' },
  { k: 'license_number', t: 'رقم الترخيص' },
  { k: 'entity_type', t: 'نوع الكيان' },
  { k: 'enterprise_size', t: 'حجم المنشأة' },
  { k: 'sector', t: 'القطاع' },
  { k: 'main_activity', t: 'النشاط الرئيسي' },
  { k: 'sub_activities', t: 'أنشطة فرعية' },
  { k: 'city', t: 'المدينة' },
  { k: 'region', t: 'المنطقة' },
  { k: 'national_address', t: 'العنوان الوطني' },
  { k: 'phone', t: 'الهاتف' },
  { k: 'official_email', t: 'البريد الرسمي' },
  { k: 'website', t: 'الموقع', hint: 'يبدأ بـ https://' },
  { k: 'founding_date', t: 'تاريخ التأسيس', type: 'date' },
  { k: 'founded_year', t: 'سنة التأسيس', type: 'number' },
  { k: 'keywords', t: 'كلمات للبحث' },
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
  // Who sent each file, and everything about this company that lives outside
  // the company row: the account, its users, the subscription, the requests.
  const [sent, setSent] = useState([])
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  // The file could show that a company needed a clarification and offered no way
  // to ask for one — you read the problem here and went to another screen to act
  // on it. A control room you can only read from is a report.
  const [asking, setAsking] = useState(false)
  const [form, setForm] = useState({ type: 'information', reason: '', details: '', docs: [], days: 14 })
  const [statusForm, setStatusForm] = useState(null)
  // Reading a wrong sector and being unable to fix it is the same dead end as
  // reading a needed clarification and being unable to ask for one.
  const [editForm, setEditForm] = useState(null)

  const load = useCallback(async () => {
    try {
      setError('')
      const sb = getSupabase()
      // One round of calls, all of them RPCs written for earlier screens — so no
      // figure here can disagree with the same figure shown elsewhere.
      const [a, b, c, d, e, f] = await Promise.all([
        sb.rpc('company_review_file', { p_company_id: id }),
        sb.rpc('company_report_full', { p_company_id: id }),
        sb.rpc('company_document_checklist', { p_company_id: id }),
        sb.rpc('company_score_history', { p_company_id: id, p_limit: 24 }),
        sb.rpc('admin_company_documents', { p_company_id: id }),
        sb.rpc('admin_company_context', { p_company_id: id }),
      ])
      setFile(a.data || null)
      setFull(b.data || null)
      setDocs(Array.isArray(c.data) ? c.data : [])
      setHistory(Array.isArray(d.data) ? d.data : [])
      setSent(Array.isArray(e.data) ? e.data : [])
      setContext(f.data || null)
    } catch (err) {
      setError(err.message || 'تعذّر تحميل ملف الشركة')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])
  useLiveData(load, { tables: ['companies', 'company_documents', 'clarification_requests', 'reports'] })

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 4000) }

  const askClarification = async () => {
    if (!form.reason.trim()) { showToast('❌ السبب مطلوب'); return }
    try {
      setBusy(true)
      const { data, error: e } = await getSupabase().rpc('request_clarification', {
        p_company_id: id, p_reason: form.reason.trim(),
        p_details: form.details.trim() || null, p_type: form.type,
        p_documents: form.docs.length ? form.docs : null,
        p_due_days: Number(form.days) || 14,
      })
      if (e) throw e
      if (!data?.ok) { showToast('❌ ' + (data?.reason || 'تعذّر الإرسال')); return }

      // The tenant comes back with the request. It used to be looked up here and
      // notified `if (t?.id)` — so for a company nobody owned, the request was
      // created and the notification silently skipped. The function now refuses
      // that case outright, and hands back who to tell, so there is no branch
      // left in which a request is filed and nobody hears about it.
      const { notifyTenant } = await import('../lib/notify')
      await notifyTenant(data.tenant_id, 'clarification_requested', {
        title: 'مطلوب توضيح على طلب شركتك',
        message: `${form.reason.trim()} — راجع «طلبات التوضيح» في ملف شركتك.`,
        meta: { company_id: id },
      })
      showToast('✅ أُرسل الطلب وأُوقف سير المراجعة')
      setAsking(false)
      setForm({ type: 'information', reason: '', details: '', docs: [], days: 14 })
      load()
    } catch (err) { showToast('❌ ' + (err?.message || 'خطأ')) } finally { setBusy(false) }
  }

  // The form is filled from the table and not from company_review_file: that RPC
  // returns a presentation of the company (age in years, "مسجّلة ضريبياً: نعم"),
  // and an editor has to round-trip the stored values themselves.
  const openEdit = async () => {
    try {
      setBusy(true)
      const { data, error: e } = await getSupabase()
        .from('companies')
        .select(EDITABLE.map((f) => f.k).join(','))
        .eq('id', id).single()
      if (e) throw e
      const values = Object.fromEntries(EDITABLE.map((f) => [f.k, data[f.k] ?? '']))
      // Kept separately so the save can send only what the administrator
      // actually changed.
      setEditForm({ values, original: { ...values }, reason: '' })
    } catch (err) { showToast('❌ ' + (err?.message || 'تعذّر فتح البيانات')) } finally { setBusy(false) }
  }

  const saveEdit = async () => {
    try {
      setBusy(true)
      // Only what moved. The RPC treats an absent key as "leave it" and a null
      // as "clear it", so sending the whole form would rewrite untouched fields
      // and fill the audit log with changes nobody made.
      const patch = {}
      for (const f of EDITABLE) {
        const now = String(editForm.values[f.k] ?? '').trim()
        const was = String(editForm.original?.[f.k] ?? '')
        if (now !== was) patch[f.k] = now === '' ? null : now
      }
      if (!Object.keys(patch).length) { showToast('لا يوجد تغيير'); return }

      const { data, error: e } = await getSupabase().rpc('admin_update_company', {
        p_company_id: id, p_patch: patch, p_reason: editForm.reason.trim(),
      })
      if (e) throw e
      showToast(`✅ حُفظ ${data?.count || 0} حقل`)
      setEditForm(null)
      load()
    } catch (err) { showToast('❌ ' + (err?.message || 'تعذّر الحفظ')) } finally { setBusy(false) }
  }

  // The guard refuses a non-approved state with no reason and refuses leaving
  // clarification_needed at all, so both are asked for here rather than letting
  // the save fail with a database message.
  const saveStatus = async () => {
    if (!statusForm?.status) return
    if (statusForm.status !== 'approved' && !statusForm.reason.trim()) {
      showToast('❌ الحالة تحتاج سبباً يُعرض على الشركة'); return
    }
    try {
      setBusy(true)
      const { data, error: e } = await getSupabase().from('companies')
        .update({ review_status: statusForm.status, review_reason: statusForm.reason.trim() || null })
        .eq('id', id).select('id')
      if (e) throw e
      if (!data?.length) throw new Error('لم تُحفظ الحالة — تحقّق من صلاحيتك')
      showToast('✅ حُفظت الحالة')
      setStatusForm(null)
      load()
    } catch (err) { showToast('❌ ' + (err?.message || 'خطأ')) } finally { setBusy(false) }
  }

  if (loading) {
    return <SkeletonPage stats={0} panels={3} />
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
            <button onClick={() => setAsking(true)}
                    disabled={openClar.length > 0}
                    title={openClar.length > 0 ? 'يوجد طلب توضيح مفتوح' : ''}
                    style={{ marginTop: '10px', display: 'block', width: '100%', padding: '8px 14px', border: 0, borderRadius: '8px',
                             background: openClar.length > 0 ? '#CBD5E1' : '#B45309', color: '#fff',
                             fontSize: '12.5px', fontWeight: 800,
                             cursor: openClar.length > 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              طلب توضيح
            </button>
            <button onClick={() => setStatusForm({ status: file.review_status, reason: file.review_reason || '' })}
                    style={{ marginTop: '7px', display: 'block', width: '100%', padding: '8px 14px', border: '1.5px solid #E2E8F0', borderRadius: '8px',
                             background: '#fff', color: '#1E2A52', fontSize: '12.5px', fontWeight: 800,
                             cursor: 'pointer', fontFamily: 'inherit' }}>
              تغيير الحالة
            </button>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h2 style={{ ...h3, margin: 0 }}>البيانات الأساسية</h2>
            <button onClick={openEdit} disabled={busy}
                    style={{ padding: '8px 16px', borderRadius: '9px', border: '1.5px solid #E2E8F0', background: '#fff', color: '#1E2A52', fontSize: '12.5px', fontWeight: 800, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              ✎ تصحيح البيانات
            </button>
          </div>
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
                    {/* Who sent it, and when. Stored on every row since the
                        documents work landed, and shown on no screen — so «who
                        gave us this» was a question only the database could
                        answer. */}
                    {(() => {
                      const s = sent.find((x) => x.doc_type === d.doc_type)
                      if (!s) return null
                      return (
                        <div style={{ fontSize: '11.5px', color: '#1D4ED8', marginTop: '3px' }}>
                          سلّمه {s.uploaded_by_tenant || s.uploaded_by || '—'} · {fmt(s.uploaded_at)}
                          {s.versions > 1 ? ` · النسخة ${s.versions}` : ''}
                        </div>
                      )
                    })()}
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

      {tab === 'account' && (
        <>
          {/* Where this record came from.
              A company the Ministry published and one somebody typed are
              different claims, and a reviewer should not have to guess which is
              in front of them. */}
          <div style={card}>
            <h2 style={h3}>المصدر</h2>
            <div style={{ fontSize: '13.5px', color: '#334155', lineHeight: 2.1 }}>
              {context?.origin?.from_registry
                ? '🏛 من السجل التجاري — وزارة التجارة'
                : 'أُدخلت يدوياً'}
              {context?.origin?.snapshot ? ` · ${context.origin.snapshot}` : ''}
              <br />
              {context?.origin?.verified
                ? `موثّقة — ${context.origin.verification_source || 'مصدر غير مسمّى'}`
                : 'غير موثّقة'}
            </div>
          </div>

          <div style={card}>
            <h2 style={h3}>الحساب</h2>
            {context?.tenant ? (
              <>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                  {context.tenant.name}
                </div>
                <div style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.9 }}>
                  {context.tenant.email}
                  {context.tenant.phone ? ` · ${context.tenant.phone}` : ''}
                  {` · ${context.tenant.status}`}
                </div>

                <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {(context.users || []).map((u) => (
                    <div key={u.email} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '13px' }}>
                      <span style={{ color: '#0F172A', fontWeight: 700 }}>{u.email}</span>
                      <span style={{ color: '#64748B', flex: 'none' }}>{u.role}</span>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '14px', fontSize: '13px', color: '#334155' }}>
                  الاشتراك: <b>{context.subscription?.plan || '—'}</b>
                  {context.subscription?.status ? ` · ${context.subscription.status}` : ''}
                </div>
              </>
            ) : (
              /* A company with no account is the normal case for a registry
                 record nobody has claimed — said plainly rather than shown as an
                 empty panel somebody reads as a loading failure. */
              <div style={{ fontSize: '13.5px', color: '#64748B', lineHeight: 1.9 }}>
                لا حساب مرتبط بهذه الشركة — لم يُطالب بها أحد بعد.
              </div>
            )}
          </div>

          <div style={card}>
            <h2 style={h3}>الطلبات</h2>
            {(context?.requests || []).length === 0 ? (
              <div style={{ fontSize: '13.5px', color: '#64748B' }}>لا طلبات</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {context.requests.map((r) => (
                  <div key={r.id}
                       onClick={() => navigate('/admin/company-requests')}
                       style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center', padding: '12px 14px', border: '1px solid #E2E8F0', borderRadius: '10px', cursor: 'pointer' }}>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>
                        {REQUEST_KIND[r.kind] || r.kind}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '3px' }}>
                        {r.submitted_at ? `أُرسل ${fmt(r.submitted_at)}` : 'لم يُرسل بعد'}
                        {r.reviewed_at ? ` · وقرّر ${fmt(r.reviewed_at)}` : ''}
                      </div>
                      {r.decision_reason && (
                        <div style={{ fontSize: '11.5px', color: '#B45309', marginTop: '3px' }}>
                          {r.decision_reason}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#334155', whiteSpace: 'nowrap' }}>
                      {REQUEST_STATE[r.status] || r.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
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

      {asking && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 200, padding: '20px' }}
             onClick={(e) => { if (e.target === e.currentTarget) setAsking(false) }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }}>طلب توضيح</h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px' }}>
              {file.name} — سيتوقّف سير المراجعة حتى تردّ الشركة.
            </p>
            <div style={{ display: 'grid', gap: '12px' }}>
              <label>
                <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>نوع التوضيح</span>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                        style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit', background: '#fff' }}>
                  <option value="information">معلومات ناقصة</option>
                  <option value="documents">مستندات مطلوبة</option>
                  <option value="correction">تصحيح بيانات</option>
                  <option value="verification">تحقّق من الهوية</option>
                </select>
              </label>
              <label>
                <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>السبب *</span>
                <input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                       placeholder="يُعرض للشركة كما تكتبه"
                       style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit' }} />
              </label>
              <label>
                <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>التفاصيل</span>
                <textarea value={form.details} onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))} rows={3}
                          style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit', resize: 'vertical' }} />
              </label>
              <div>
                <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '8px' }}>مستندات مطلوبة</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                  {docs.map((d) => {
                    const on = form.docs.includes(d.doc_type)
                    return (
                      <button key={d.doc_type} type="button"
                              onClick={() => setForm((f) => ({ ...f, docs: on ? f.docs.filter((x) => x !== d.doc_type) : [...f.docs, d.doc_type] }))}
                              style={{ padding: '6px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 800,
                                       border: on ? 0 : '1.5px solid #E2E8F0', background: on ? '#1E2A52' : '#fff',
                                       color: on ? '#fff' : '#334155', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {on ? '✔ ' : ''}{d.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <label>
                <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>مهلة الردّ (أيام)</span>
                <input type="number" min="0" value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
                       style={{ width: '110px', padding: '10px 13px', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '9px', marginTop: '18px' }}>
              <button onClick={askClarification} disabled={busy || !form.reason.trim()}
                      style={{ padding: '11px 22px', background: form.reason.trim() ? '#1E2A52' : '#CBD5E1', color: '#fff', border: 0, borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: form.reason.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                {busy ? 'جارٍ الإرسال…' : 'إرسال وإيقاف السير'}
              </button>
              <button onClick={() => setAsking(false)}
                      style={{ padding: '11px 20px', background: '#fff', color: '#475569', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {editForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 200, padding: '20px' }}
             onClick={(e) => { if (e.target === e.currentTarget) setEditForm(null) }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '760px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }}>تصحيح بيانات الشركة</h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 18px', lineHeight: 1.7 }}>
              يُحفظ التغيير في سجل الشركة باسمك وبالسبب الذي تكتبه. حالة الاعتماد والتوثيق
              والمراجعة لا تُغيَّر من هنا — لكلٍّ منها مسارها.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '13px' }}>
              {EDITABLE.map((f) => {
                const changed = String(editForm.values[f.k] ?? '') !== String(editForm.original[f.k] ?? '')
                return (
                  <label key={f.k}>
                    <span style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: changed ? '#B45309' : '#334155', marginBottom: '5px' }}>
                      {f.t}{f.req && <span style={{ color: '#B91C1C' }}> *</span>}
                      {f.hint && <span style={{ fontWeight: 600, color: '#94A3B8' }}> · {f.hint}</span>}
                      {changed && <span style={{ fontWeight: 700 }}> · مُعدّل</span>}
                    </span>
                    <input type={f.type || 'text'}
                           value={editForm.values[f.k] ?? ''}
                           onChange={(e) => setEditForm((s) => ({ ...s, values: { ...s.values, [f.k]: e.target.value } }))}
                           dir={f.k === 'website' || f.k === 'official_email' || f.k === 'name_en' ? 'ltr' : 'rtl'}
                           style={{ width: '100%', padding: '9px 12px', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit',
                                    border: `1.5px solid ${changed ? '#FCD34D' : '#E2E8F0'}`,
                                    background: changed ? '#FFFBEB' : '#fff' }} />
                  </label>
                )
              })}
            </div>

            <label style={{ display: 'block', marginTop: '18px' }}>
              <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                سبب التصحيح <span style={{ color: '#B91C1C' }}>*</span>
              </span>
              <input value={editForm.reason}
                     onChange={(e) => setEditForm((s) => ({ ...s, reason: e.target.value }))}
                     placeholder="مثال: تصحيح رقم السجل التجاري بناءً على شهادة السجل المرفوعة"
                     style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit' }} />
            </label>

            <div style={{ display: 'flex', gap: '9px', marginTop: '18px', alignItems: 'center' }}>
              <button onClick={saveEdit} disabled={busy || !editForm.reason.trim()}
                      style={{ padding: '11px 22px', background: editForm.reason.trim() ? '#1E2A52' : '#CBD5E1', color: '#fff', border: 0, borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: editForm.reason.trim() && !busy ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                {busy ? 'جارٍ الحفظ…' : 'حفظ التصحيح'}
              </button>
              <button onClick={() => setEditForm(null)}
                      style={{ padding: '11px 20px', background: '#fff', color: '#475569', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
              <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700 }}>
                {EDITABLE.filter((f) => String(editForm.values[f.k] ?? '') !== String(editForm.original[f.k] ?? '')).length} حقل مُعدّل
              </span>
            </div>
          </div>
        </div>
      )}

      {statusForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 200, padding: '20px' }}
             onClick={(e) => { if (e.target === e.currentTarget) setStatusForm(null) }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '460px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px' }}>تغيير حالة المراجعة</h2>
            <div style={{ display: 'grid', gap: '12px' }}>
              <label>
                <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>الحالة</span>
                <select value={statusForm.status} onChange={(e) => setStatusForm((f) => ({ ...f, status: e.target.value }))}
                        style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit', background: '#fff' }}>
                  {Object.entries(REVIEW).map(([k, v]) => <option key={k} value={k}>{v.t}</option>)}
                </select>
              </label>
              <label>
                <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                  السبب {statusForm.status !== 'approved' && <span style={{ color: '#B91C1C' }}>*</span>}
                </span>
                <input value={statusForm.reason} onChange={(e) => setStatusForm((f) => ({ ...f, reason: e.target.value }))}
                       placeholder="يُعرض للشركة"
                       style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '9px', marginTop: '18px' }}>
              <button onClick={saveStatus} disabled={busy}
                      style={{ padding: '11px 22px', background: '#1E2A52', color: '#fff', border: 0, borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                {busy ? 'جارٍ الحفظ…' : 'حفظ'}
              </button>
              <button onClick={() => setStatusForm(null)}
                      style={{ padding: '11px 20px', background: '#fff', color: '#475569', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', insetInlineStart: '24px', background: '#0F172A', color: '#fff', padding: '13px 22px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, zIndex: 300 }}>{toast}</div>
      )}

    </div>
  )
}
