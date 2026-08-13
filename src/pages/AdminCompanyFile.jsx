import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { SkeletonPage } from '../components/Skeleton'
import DocumentViewer from '../components/DocumentViewer'
// Field and TabError stay local for now: this screen's Field drops empty values
// rather than printing «—», and TabError is an inline note, not a block. The
// primitive learned hideEmpty so the next screen need not fork it; renaming
// twenty call sites here is its own pass.
import { Card, SectionTitle, EmptyState } from '../ui'

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

// `full` و`late` كانت تُطبع كما هي في صفّ التقرير — نفس عطل أنواع المستندات:
// قيمة عمود مقيَّد تُعرض بالإنجليزية للمراجع لأن لا خريطة لها.
const PAYMENT = {
  full: 'سُدِّد كاملاً', partial: 'سداد جزئي', late: 'سُدِّد متأخراً',
  default: 'لم يُسدَّد', unpaid: 'لم يُسدَّد', na: 'لا ينطبق',
}
const CATEGORY = {
  late_payment: 'تأخير سداد', no_payment: 'عدم سداد', contract_breach: 'إخلال بالعقد',
  quality: 'جودة العمل', execution_delay: 'تأخير التنفيذ', dispute: 'نزاع',
  fraud: 'احتيال', other: 'أخرى',
}
const REPORT_STATE = {
  approved:       { t: 'منشور',            fg: '#15803D', bg: '#F0FDF4', bd: '#BBF7D0' },
  pending_review: { t: 'بانتظار المراجعة', fg: '#B45309', bg: '#FFFBEB', bd: '#FDE68A' },
  request_info:   { t: 'بانتظار معلومات',  fg: '#1E2A52', bg: '#EEF2F8', bd: '#CBD5E1' },
  rejected:       { t: 'مسحوب / غير مقبول', fg: '#B91C1C', bg: '#FEF2F2', bd: '#FECACA' },
  cancelled:      { t: 'ملغى',             fg: '#64748B', bg: '#F8FAFC', bd: '#E2E8F0' },
  draft:          { t: 'مسودّة',            fg: '#64748B', bg: '#F8FAFC', bd: '#E2E8F0' },
}

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

// Where a company stands in Marsad. Separate from `official_status`, which is
// where it stands at the Ministry — the header shows both, never merged.
const MARSAD_STATE = {
  pending:   { t: 'بانتظار الاعتماد', bg: '#FFFBEB', fg: '#B45309' },
  active:    { t: 'نشطة',             bg: '#ECFDF5', fg: '#15803D' },
  approved:  { t: 'نشطة',             bg: '#ECFDF5', fg: '#15803D' },
  rejected:  { t: 'مرفوضة',           bg: '#FEF2F2', fg: '#B91C1C' },
  suspended: { t: 'معلّقة',            bg: '#FEF2F2', fg: '#B91C1C' },
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
  { v: 'disputes', t: 'الاعتراضات' },
  { v: 'score', t: 'مؤشر الثقة' },
  { v: 'timeline', t: 'الخطّ الزمني' },
  { v: 'audit', t: 'سجل التدقيق' },
  { v: 'activity', t: 'سجل النشاط' },
]

// The three tabs added last load on demand and own their own state. The rest of
// this page arrives in one call; these do not join it, because a company with
// 252 audit rows should not pay for them on a page nobody opened that tab on —
// and a failing audit query must not blank the documents beside it.
function useLazyTab (active, fn, deps) {
  const [state, set] = useState({ data: null, loading: false, error: '', loaded: false })

  const load = useCallback(async () => {
    set((x) => ({ ...x, loading: true, error: '' }))
    try {
      const data = await fn(getSupabase())
      set({ data, loading: false, error: '', loaded: true })
    } catch (e) {
      set({ data: null, loading: false, error: e.message || 'تعذّر التحميل', loaded: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => { if (active) load() }, [active, load])
  return { ...state, reload: load }
}

/** Skeleton rows, so a tab does not jump when its data lands. */
function TabSkeleton ({ n = 4 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{
          height: '52px', background: '#F1F5F9', borderRadius: '8px', marginBottom: '10px',
        }} />
      ))}
    </div>
  )
}

function TabError ({ what, message, onRetry }) {
  return (
    <div role="alert" style={{ fontSize: '13.5px', color: '#B45309', lineHeight: 1.9 }}>
      تعذّر تحميل {what}
      <div style={{ color: '#94A3B8', fontSize: '12.5px' }}>{String(message).slice(0, 140)}</div>
      <button onClick={onRetry} style={{
        marginTop: '10px', minHeight: '36px', padding: '0 16px', background: '#fff',
        border: '1.5px solid #E2E8F0', borderRadius: '8px', fontSize: '13px',
        fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: '#334155',
      }}>إعادة المحاولة</button>
    </div>
  )
}

const relTime = (t) => {
  if (!t) return '—'
  const m = Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 60000))
  if (m < 1) return 'الآن'
  if (m < 60) return `منذ ${m} دقيقة`
  const h = Math.round(m / 60)
  if (h < 24) return `منذ ${h} ساعة`
  return `منذ ${Math.round(h / 24)} يوم`
}

/** Today / yesterday / the date — the timeline's own grouping. */
const dayLabel = (t) => {
  const d = new Date(t)
  const today = new Date()
  const y = new Date(today); y.setDate(y.getDate() - 1)
  const same = (a, b) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'اليوم'
  if (same(d, y)) return 'أمس'
  return d.toLocaleDateString('ar-SA-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' })
}

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

// أرقام لاتينية.
//
// 'ar-SA' يجرّ معه التقويم الهجري والأرقام الهندية، فيظهر التاريخ ٢٠٢٦/٨/١٣
// بينما مؤشر الثقة 87 وأيام التأخير 14 لاتينية في السطر نفسه. رقمان بنظامين
// في شاشة واحدة يُقرآن كأنهما من مصدرين. اللاحقة u-nu-latn تُبقي اللغة عربية
// وتوحّد الأرقام.
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : '—')
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
  const [auditPage, setAuditPage] = useState(0)
  const [auditOpen, setAuditOpen] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [deciding, setDeciding] = useState(null)
  const [decideReason, setDecideReason] = useState('')

  const disputes = useLazyTab(tab === 'disputes', async (sb) => {
    const { data, error } = await sb.rpc('admin_company_disputes', { p_company_id: id })
    if (error) throw error
    return data
  }, [id, tab === 'disputes'])

  const timeline = useLazyTab(tab === 'timeline', async (sb) => {
    const { data, error } = await sb.rpc('admin_company_timeline', { p_company_id: id, p_limit: 80 })
    if (error) throw error
    return data || []
  }, [id, tab === 'timeline'])

  const claims = useLazyTab(tab === 'account', async (sb) => {
    const { data, error } = await sb.rpc('admin_company_claims', { p_company_id: id })
    if (error) throw error
    return data || []
  }, [id, tab === 'account'])

  const audit = useLazyTab(tab === 'audit', async (sb) => {
    const { data, error } = await sb.rpc('admin_company_audit',
      { p_company_id: id, p_limit: 25, p_offset: auditPage * 25 })
    if (error) throw error
    return data || []
  }, [id, tab === 'audit', auditPage])

  const [statusForm, setStatusForm] = useState(null)
  // التقارير كاملةً للإدارة.
  //
  // company_report_full().recent يعطي {at, delay, payment, defaulted} فقط —
  // بلا معرّف ولا تصنيف ولا قيمة ولا حالة. يكفي للتقرير العلني، ولا يكفي
  // لشاشة يُتَّخذ فيها قرار: لا يمكن سحب تقرير لا تعرف معرّفه. وهي دالة
  // يقرأها التقرير العلني أيضاً، فتوسيعها تُسرّب معرّفات التقارير لكل من
  // يفتحه. القراءة هنا مباشرة، وهذه شاشة إدارة.
  const [reportRows, setReportRows] = useState([])
  const [withdrawing, setWithdrawing] = useState(null)
  // Reading a wrong sector and being unable to fix it is the same dead end as
  // reading a needed clarification and being unable to ask for one.
  const [editForm, setEditForm] = useState(null)

  const load = useCallback(async () => {
    try {
      setError('')
      const sb = getSupabase()
      // One round of calls, all of them RPCs written for earlier screens — so no
      // figure here can disagree with the same figure shown elsewhere.
      const [a, b, c, d, e, f, g] = await Promise.all([
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
      setReportRows(Array.isArray(g.data) ? g.data : [])
    } catch (err) {
      setError(err.message || 'تعذّر تحميل ملف الشركة')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])
  useLiveData(load, { tables: ['companies', 'company_documents', 'clarification_requests', 'reports'] })

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 4000) }

  /**
   * سحب تقرير منشور.
   *
   * القاعدة تتحقّق من الصلاحية ومن أن التقرير منشور ومن أن السبب غير فارغ،
   * وتُعيد احتساب مؤشر الثقة في نفس المعاملة. الفحص هنا مجاملة لتفادي رحلة
   * ذهاب وإياب، والقرار هناك.
   */
  const withdrawReport = async (row) => {
    const why = (withdrawing?.reason || '').trim()
    if (!why) { showToast('❌ سبب السحب مطلوب'); return }
    try {
      setWithdrawing((w) => ({ ...w, busy: true }))
      const { error: e } = await getSupabase().rpc('withdraw_report', {
        p_report_id: row.id, p_reason: why,
      })
      if (e) throw e
      setWithdrawing(null)
      showToast('✅ سُحب التقرير وأُعيد احتساب مؤشر الثقة')
      load()
    } catch (err) {
      setWithdrawing((w) => ({ ...w, busy: false }))
      showToast('❌ ' + (err?.message || 'تعذّر سحب التقرير'))
    }
  }

  /**
   * Verify or reject a document without leaving the file.
   *
   * Through `review_document`, which is the same call /admin/documents makes —
   * the permission check, the trust-score recompute and the audit entry all
   * live inside it. A second implementation here would be a second place for
   * the rules to drift, and the rule that matters is the one the database
   * enforces.
   *
   * A rejection carries a reason because the company is shown it and has to
   * know what to send instead.
   */
  /**
   * Registration and the verification badge, decided here.
   *
   * Both go through functions added for this — decide_company_registration and
   * set_company_verification. The screens they came from wrote to `companies`
   * from the browser and then inserted their own audit row afterwards, in a
   * separate try that logged a warning and carried on when it failed; a company
   * could change state with nobody recorded as having changed it. In the
   * function the write, the audit entry and the notification are one
   * transaction behind one permission check, and the permission is checked by
   * the database rather than by which screen you managed to open.
   */
  const runDecision = async (fn, args, okMsg) => {
    try {
      setBusy(true)
      const { error: e } = await getSupabase().rpc(fn, args)
      if (e) throw e
      showToast(okMsg)
      setDeciding(null)
      setDecideReason('')
      load()
    } catch (err) {
      showToast('❌ ' + (err?.message || 'تعذّر حفظ القرار'))
    } finally { setBusy(false) }
  }

  const decideRegistration = (approve, reason) => runDecision(
    'decide_company_registration',
    { p_company_id: id, p_approve: approve, p_reason: reason?.trim() || null },
    approve ? '✅ قُبل التسجيل وأُبلغت الشركة' : '✅ رُفض التسجيل وأُبلغت الشركة',
  )

  const setVerification = (verified, reason) => runDecision(
    'set_company_verification',
    { p_company_id: id, p_verified: verified, p_reason: reason?.trim() || null },
    verified ? '✅ وُثّقت الشركة' : '✅ سُحب التوثيق',
  )

  const decideClaim = (claimId, approve, reason) => runDecision(
    'decide_claim_request',
    { p_claim_id: claimId, p_approve: approve, p_reason: reason?.trim() || null },
    approve ? '✅ قُبلت الملكية وأُبلغ مقدّم الطلب' : '✅ رُفض الطلب وأُبلغ مقدّمه',
  )

  const resolveDispute = (disputeId, upheld, note) => runDecision(
    'resolve_dispute',
    { p_dispute_id: disputeId, p_upheld: upheld, p_note: note?.trim() || null },
    upheld ? '✅ قُبل الاعتراض' : '✅ رُفض الاعتراض',
  )

  const reviewDoc = async (documentId, approve, reason) => {
    try {
      setBusy(true)
      const { error: e } = await getSupabase().rpc('review_document', {
        p_document_id: documentId,
        p_approve: approve,
        p_reason: reason?.trim() || null,
      })
      if (e) throw e
      showToast(approve ? '✅ وُثّق المستند' : '✅ رُفض المستند وأُبلغت الشركة')
      setRejecting(null)
      setRejectReason('')
      load()
    } catch (err) {
      showToast('❌ ' + (err?.message || 'تعذّر حفظ القرار'))
    } finally { setBusy(false) }
  }

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
      <Card>
        <h1 style={{ fontSize: '19px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px' }}>ملف الشركة</h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>{error || 'الشركة غير موجودة، أو ليست ضمن صلاحيتك.'}</p>
      </Card>
    )
  }

  const ident = full?.identity || {}
  const beh = full?.behaviour || {}
  const q = full?.quality || {}
  // `companies.status` is the state of a company in Marsad. This read
  // `review_status` with `|| REVIEW.approved` behind it, so a company whose
  // registration was still new displayed «معتمدة» — a deprecated column saying
  // yes on behalf of the one that says pending. `review_status` is derived from
  // `status` by trigger now and is on its way out; the badge stops asking it.
  const rv = MARSAD_STATE[file.status] || MARSAD_STATE.pending
  const openClar = (file.clarifications || []).filter((c) => c.status === 'open')

  return (
    <div>
      {/* Header — the identity and the state, on every tab. */}
      <Card style={{ marginBottom: '16px' }}>
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
      </Card>

      {/* A real tablist. The labels here repeat names that also exist in the
          navigation — «الاعتراضات» is both a tab and a sidebar entry — so a test
          that matches by accessible name alone clicks the wrong one and leaves
          the page. Giving the row its role makes the tabs addressable as tabs. */}
      <div role="tablist" aria-label="أقسام ملفّ الشركة"
        style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {TABS.map((t) => {
          const badge = t.v === 'clarifications' ? openClar.length
            : t.v === 'documents' ? docs.filter((d) => d.state === 'pending').length : 0
          return (
            <button key={t.v} role="tab" aria-selected={tab === t.v}
              onClick={() => setTab(t.v)} style={{
              padding: '9px 16px', borderRadius: '9px', fontSize: '13px', fontWeight: 800,
              cursor: 'pointer', fontFamily: 'inherit',
              background: tab === t.v ? '#1E2A52' : '#fff',
              color: tab === t.v ? '#fff' : '#334155',
              border: tab === t.v ? 0 : '1.5px solid #E2E8F0',
            }}>
              {t.t}
              {/* aria-hidden because the count is a visual cue, not part of the
                  tab's name. Without it the accessible name of the documents
                  tab is «المستندات1» — a screen reader reads the digit as part
                  of the word, and an exact-name locator stops matching the
                  moment a badge appears. That is a race, not a constant: the
                  tab is named one thing before the counts land and another
                  after, so a test passes or fails on how fast the data
                  arrives. The number is in the tab's own panel either way. */}
              {badge > 0 && (
                <span aria-hidden="true" style={{ background: '#DC2626', color: '#fff', borderRadius: '999px', padding: '1px 7px', fontSize: '11px', marginInlineStart: '7px' }}>{badge}</span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* The two decisions that used to live on two other screens.
              Approving a registration was on /admin/company-approval and the
              badge on /admin/company-verification, so deciding either meant
              leaving the one page that shows the documents, the reports and
              the history the decision rests on. The queues still exist and are
              still how the work is found; this is where it is done. */}
          <Card>
            <SectionTitle>القرارات</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ ...lbl, minWidth: '78px' }}>التسجيل</span>
                <span style={{ background: rv.bg, color: rv.fg, borderRadius: '999px', padding: '4px 12px', fontSize: '12.5px', fontWeight: 800 }}>{rv.t}</span>
                {file.status === 'pending' && (
                  <>
                    <button onClick={() => decideRegistration(true)} disabled={busy} style={{
                      padding: '7px 16px', borderRadius: '8px', border: 0,
                      background: busy ? '#86EFAC' : '#15803D', color: '#fff',
                      fontSize: '12.5px', fontWeight: 800,
                      cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
                    }}>قبول التسجيل</button>
                    <button onClick={() => setDeciding({
                      title: 'رفض التسجيل',
                      placeholder: 'ما الذي ينقص التسجيل، وما المطلوب لإعادة التقديم؟',
                      run: (why) => decideRegistration(false, why),
                    })} disabled={busy} style={{
                      padding: '7px 16px', borderRadius: '8px', border: '1.5px solid #FECACA',
                      background: '#fff', color: '#B91C1C', fontSize: '12.5px', fontWeight: 800,
                      cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
                    }}>رفض التسجيل</button>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid #F1F5F9', paddingTop: '14px' }}>
                <span style={{ ...lbl, minWidth: '78px' }}>التوثيق</span>
                <span style={{
                  background: ident.verified ? '#ECFDF5' : '#F1F5F9',
                  color: ident.verified ? '#15803D' : '#475569',
                  borderRadius: '999px', padding: '4px 12px', fontSize: '12.5px', fontWeight: 800,
                }}>{ident.verified ? `موثّقة · ${fmt(ident.verified_at)}` : 'غير موثّقة'}</span>
                {ident.verified ? (
                  <button onClick={() => setDeciding({
                    title: 'سحب التوثيق',
                    placeholder: 'لماذا لم تعد الشركة مستوفية لشروط التوثيق؟',
                    run: (why) => setVerification(false, why),
                  })} disabled={busy} style={{
                    padding: '7px 16px', borderRadius: '8px', border: '1.5px solid #FECACA',
                    background: '#fff', color: '#B91C1C', fontSize: '12.5px', fontWeight: 800,
                    cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
                  }}>سحب التوثيق</button>
                ) : (
                  <button onClick={() => setVerification(true)} disabled={busy} style={{
                    padding: '7px 16px', borderRadius: '8px', border: 0,
                    background: busy ? '#86EFAC' : '#15803D', color: '#fff',
                    fontSize: '12.5px', fontWeight: 800,
                    cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
                  }}>توثيق الشركة</button>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <SectionTitle>السلوك التجاري</SectionTitle>
            <Grid>
              <Stat k="تقارير معتمدة" v={beh.reports_approved ?? 0} sub={`من ${beh.reports_total ?? 0}`} />
              <Stat k="نسبة السداد الكامل" v={beh.on_time_pct == null ? '—' : `${beh.on_time_pct}%`} />
              <Stat k="متوسط التأخير" v={`${beh.avg_delay ?? 0} يوم`} sub={`أعلى ${beh.max_delay ?? 0}`} />
              <Stat k="حالات عدم السداد" v={beh.defaults ?? 0} />
              <Stat k="جهات مُبلِّغة" v={beh.counterparties ?? 0} sub="مستقلّة" />
              <Stat k="قيد المراجعة" v={beh.reports_pending ?? 0} sub={`${beh.reports_rejected ?? 0} مرفوض`} />
            </Grid>
          </Card>
          <Card>
            <SectionTitle>جودة السجلّ</SectionTitle>
            <Grid>
              <Stat k="اكتمال البيانات" v={`${q.profile_completeness ?? 0}%`} />
              <Stat k="مستندات موثّقة" v={q.documents ?? 0} sub={`${docs.filter((d) => d.state === 'pending').length} بانتظار المراجعة`} />
              <Stat k="آخر تقرير" v={fmt(q.last_report_at)} />
              <Stat k="اعتراضات قائمة" v={q.disputes_open ?? 0} />
            </Grid>
          </Card>
        </div>
      )}

      {tab === 'data' && (
        <Card>
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
        </Card>
      )}

      {tab === 'documents' && (
        <Card>
          <SectionTitle>المستندات</SectionTitle>
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
                  {/* The document and the decision about it, together.
                      Verifying used to mean downloading the file, reading it in
                      another window, coming back, and clicking a button on a row
                      whose contents you were now recalling from memory.
                      Everything that makes a verification worth anything — does
                      the name match, is the number the one on file, has it
                      expired — was being done against a window that is not this
                      one. */}
                  {(() => {
                    const s = sent.find((x) => x.doc_type === d.doc_type)
                    return (
                      <div style={{ display: 'flex', gap: '7px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: st.fg, whiteSpace: 'nowrap' }}>{st.t}</span>
                        {s?.file_url && (
                          <>
                            <button onClick={() => setViewing({ key: s.file_url, name: s.file_name, title: d.label })}
                              style={{
                                padding: '6px 13px', borderRadius: '8px', border: '1.5px solid #E2E8F0',
                                background: '#fff', color: '#1E2A52', fontSize: '12.5px', fontWeight: 800,
                                cursor: 'pointer', fontFamily: 'inherit',
                              }}>عرض المستند</button>
                            {s.status !== 'verified' && (
                              <button onClick={() => reviewDoc(s.id, true)} disabled={busy}
                                style={{
                                  padding: '6px 13px', borderRadius: '8px', border: 0,
                                  background: busy ? '#86EFAC' : '#15803D', color: '#fff',
                                  fontSize: '12.5px', fontWeight: 800,
                                  cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
                                }}>توثيق</button>
                            )}
                            {s.status !== 'rejected' && (
                              <button onClick={() => setRejecting({ id: s.id, label: d.label })} disabled={busy}
                                style={{
                                  padding: '6px 13px', borderRadius: '8px', border: '1.5px solid #FECACA',
                                  background: '#fff', color: '#B91C1C', fontSize: '12.5px', fontWeight: 800,
                                  cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
                                }}>رفض</button>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
          <button onClick={() => navigate('/admin/documents')}
                  style={{ marginTop: '16px', padding: '10px 20px', border: '1.5px solid #E2E8F0', borderRadius: '9px', background: '#fff', color: '#1E2A52', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            طابور التوثيق لكل الشركات
          </button>
        </Card>
      )}

      {tab === 'account' && (
        <>
          {/* Who is asking to own this company.
              The claims queue is its own screen and stays one — it is how the
              work is found across every company. This is the one screen where
              «who says this is theirs» is a question about the company in front
              of you, and the evidence for answering it is on this page. */}
          <Card style={{ marginBottom: '16px' }}>
            <SectionTitle>طلبات الملكية</SectionTitle>
            {claims.loading ? <TabSkeleton n={2} />
              : claims.error ? <TabError what="طلبات الملكية" message={claims.error} onRetry={claims.reload} />
                : !claims.data?.length ? (
                  <div style={{ fontSize: '14px', color: '#64748B', lineHeight: 2 }}>
                    <b style={{ color: '#0F172A' }}>لا طلبات ملكية</b>
                    <div>لم يطلب أحد ملكية هذه الشركة.</div>
                  </div>
                ) : claims.data.map((cl, i) => (
                  <div key={cl.id} style={{ borderTop: i ? '1px solid #F1F5F9' : 0, padding: '13px 0' }}>
                    <div style={{ display: 'flex', gap: '9px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{
                        background: cl.status === 'pending' ? '#FEF3C7' : cl.status === 'approved' ? '#ECFDF5' : '#F1F5F9',
                        color: cl.status === 'pending' ? '#B45309' : cl.status === 'approved' ? '#15803D' : '#475569',
                        borderRadius: '999px', padding: '3px 11px', fontSize: '11.5px', fontWeight: 800,
                      }}>{cl.status === 'pending' ? 'بانتظار القرار' : cl.status === 'approved' ? 'مقبول' : 'مرفوض'}</span>
                      <b style={{ fontSize: '14px', color: '#0F172A' }}>{cl.user_name || cl.user_email || '—'}</b>
                      <span style={{ fontSize: '12px', color: '#94A3B8' }}>{fmt(cl.created_at)}</span>
                    </div>
                    {cl.user_name && cl.user_email && (
                      <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '3px' }}>{cl.user_email}</div>
                    )}
                    {cl.rejection_reason && (
                      <div style={{ fontSize: '12.5px', color: '#B91C1C', marginTop: '4px', lineHeight: 1.9 }}>
                        السبب: {cl.rejection_reason}
                      </div>
                    )}
                    {cl.status === 'pending' && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                        <button onClick={() => decideClaim(cl.id, true)} disabled={busy} style={{
                          padding: '7px 16px', borderRadius: '8px', border: 0,
                          background: busy ? '#86EFAC' : '#15803D', color: '#fff',
                          fontSize: '12.5px', fontWeight: 800,
                          cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
                        }}>قبول الملكية</button>
                        <button onClick={() => setDeciding({
                          title: 'رفض طلب الملكية',
                          note: 'سيُعرض السبب على مقدّم الطلب.',
                          placeholder: 'ما الذي ينقص لإثبات الملكية؟',
                          run: (why) => decideClaim(cl.id, false, why),
                        })} disabled={busy} style={{
                          padding: '7px 16px', borderRadius: '8px', border: '1.5px solid #FECACA',
                          background: '#fff', color: '#B91C1C', fontSize: '12.5px', fontWeight: 800,
                          cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
                        }}>رفض</button>
                      </div>
                    )}
                  </div>
                ))}
          </Card>

          {/* Where this record came from.
              A company the Ministry published and one somebody typed are
              different claims, and a reviewer should not have to guess which is
              in front of them. */}
          <Card>
            <SectionTitle>المصدر</SectionTitle>
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
          </Card>

          <Card>
            <SectionTitle>الحساب</SectionTitle>
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
          </Card>

          <Card>
            <SectionTitle>الطلبات</SectionTitle>
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
          </Card>
        </>
      )}


      {tab === 'reports' && (
        <Card>
          <SectionTitle>التقارير عن هذه الشركة</SectionTitle>
          {/* كل التقارير، لا المنشورة وحدها — ومعها حالتها.
              الصفّ كان سطراً واحداً بلا تصنيف ولا قيمة ولا حالة، ويُطبع فيه
              payment بالإنجليزية. ومَن يقرّر السحب يحتاج أن يرى ما يسحبه. */}
          {reportRows.length === 0 ? (
            <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>لا تقارير عن هذه الشركة.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {reportRows.map((r) => {
                const st = REPORT_STATE[r.status] || REPORT_STATE.draft
                const bad = r.defaulted || (r.delay_days > 0) || ['default', 'unpaid'].includes(r.payment_commitment)
                const isOpen = withdrawing?.id === r.id
                return (
                  <div key={r.id} style={{ border: `1px solid ${st.bd}`, background: st.bg, borderRadius: '11px', padding: '13px 15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A' }}>
                        {bad ? '!' : '✔'} {CATEGORY[r.category] || r.category || 'تقرير تعامل'}
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: st.fg, background: '#fff', border: `1px solid ${st.bd}`, borderRadius: '999px', padding: '2px 10px' }}>
                        {st.t}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '10px', marginTop: '11px' }}>
                      {[
                        ['السداد', PAYMENT[r.payment_commitment] || r.payment_commitment],
                        ['التأخير', r.delay_days != null ? `${r.delay_days} يوم` : null],
                        ['تعثّر', r.defaulted ? 'نعم' : 'لا'],
                        ['قيمة التعامل', r.deal_value ? `${Number(r.deal_value).toLocaleString('en-US')} ${r.currency || 'ر.س'}` : null],
                        ['تاريخ التعامل', r.dealt_at ? fmt(r.dealt_at) : null],
                        [r.status === 'approved' ? 'نُشر' : 'أُنشئ', fmt(r.approved_at || r.created_at)],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700 }}>{k}</div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: v ? '#334155' : '#CBD5E1' }}>{v || '—'}</div>
                        </div>
                      ))}
                    </div>

                    {r.status === 'rejected' && r.rejection_reason && (
                      <div style={{ fontSize: '12.5px', color: '#B91C1C', fontWeight: 700, marginTop: '10px' }}>
                        سبب السحب: {r.rejection_reason}
                      </div>
                    )}

                    {/* السحب للمنشور وحده — غير المنشور يُرفض من مسار المراجعة. */}
                    {r.status === 'approved' && (
                      isOpen ? (
                        <div style={{ marginTop: '12px' }}>
                          <input
                            autoFocus
                            value={withdrawing.reason || ''}
                            onChange={(e) => setWithdrawing((w) => ({ ...w, reason: e.target.value }))}
                            placeholder="سبب السحب — مكرّر، أو عن شركة خطأ، أو لم يثبت التعامل"
                            style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #FECACA', borderRadius: '9px', padding: '10px 13px', fontSize: '13.5px', fontFamily: 'inherit', textAlign: 'right' }}
                          />
                          <div style={{ fontSize: '11.5px', color: '#64748B', margin: '7px 2px', lineHeight: 1.8 }}>
                            السحب يُنزل التقرير من تقرير الثقة فوراً ويُعيد احتساب المؤشر، ويُسجَّل باسمك في سجلّ التدقيق.
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexDirection: 'row-reverse' }}>
                            <button onClick={() => withdrawReport(r)} disabled={withdrawing.busy}
                                    style={{ padding: '9px 18px', background: '#B91C1C', color: '#fff', border: 0, borderRadius: '9px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                              {withdrawing.busy ? 'جارٍ السحب…' : 'تأكيد السحب'}
                            </button>
                            <button onClick={() => setWithdrawing(null)} disabled={withdrawing.busy}
                                    style={{ padding: '9px 18px', background: '#fff', color: '#334155', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                              إلغاء
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setWithdrawing({ id: r.id, reason: '' })}
                                style={{ marginTop: '11px', padding: '8px 16px', background: '#fff', color: '#B91C1C', border: '1.5px solid #FECACA', borderRadius: '9px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                          سحب التقرير
                        </button>
                      )
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {(full?.sources || []).length > 0 && (
            <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0F172A', marginBottom: '10px' }}>مصادر التقارير</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {/* «غير محدّد · 2» تقرأ كأنها عطل، وهي بيانات صحيحة: قطاع
                    الجهة المُبلِّغة غير مسجَّل. تُقال كما هي. */}
                {full.sources.map((s) => (
                  <span key={s.sector} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '999px', padding: '5px 13px', fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>
                    {s.sector === 'غير محدّد' ? 'قطاع غير مسجَّل' : s.sector} — {s.count} تقرير
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {tab === 'clarifications' && (
        <Card>
          <SectionTitle>طلبات التوضيح</SectionTitle>
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
        </Card>
      )}

      {tab === 'score' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Card>
            <SectionTitle>موضعها في السوق</SectionTitle>
            <Grid>
              <Stat k="متوسط القطاع" v={full?.market?.sector_avg ?? '—'} sub={ident.sector || ''} />
              <Stat k="الترتيب" v={full?.market?.rank ?? '—'} sub={`من ${full?.market?.rated_total ?? 0} مصنّفة`} />
            </Grid>
          </Card>
          <Card>
            <SectionTitle>تاريخ المؤشر</SectionTitle>
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
          </Card>
        </div>
      )}

      {/* ===== Disputes ===== */}
      {tab === 'disputes' && (
        <Card>
          <SectionTitle>الاعتراضات</SectionTitle>
          {disputes.loading ? <TabSkeleton />
            : disputes.error ? <TabError what="الاعتراضات" message={disputes.error} onRetry={disputes.reload} />
              : !disputes.data?.items?.length ? (
                <div style={{ fontSize: '14px', color: '#64748B', lineHeight: 2 }}>
                  <b style={{ color: '#0F172A' }}>لا توجد اعتراضات</b>
                  <div>لم تُسجَّل أي اعتراضات على هذه الشركة حتى الآن.</div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    {[
                      ['مفتوحة', disputes.data.summary.open, '#B91C1C', '#FEF2F2'],
                      ['قُبلت', disputes.data.summary.upheld, '#15803D', '#F0FDF4'],
                      ['رُفضت', disputes.data.summary.rejected, '#475569', '#F8FAFC'],
                      ['سُحبت', disputes.data.summary.withdrawn, '#475569', '#F8FAFC'],
                    ].map((row) => (
                      <span key={row[0]} style={{
                        background: row[3], color: row[2], borderRadius: '999px', padding: '5px 13px',
                        fontSize: '12.5px', fontWeight: 800,
                      }}>{row[0]} {row[1]}</span>
                    ))}
                  </div>

                  {disputes.data.items.map((d) => (
                    <div key={d.id} style={{
                      padding: '13px 0', borderTop: '1px solid #F1F5F9',
                      display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
                    }}>
                      <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                        <div style={{
                          fontSize: '12.5px', fontWeight: 800,
                          color: d.status === 'open' ? '#B91C1C' : '#475569',
                        }}>
                          {d.status === 'open' ? '🔴' : '•'} {d.status_label}
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginTop: '3px' }}>
                          اعتراض على تقرير{d.report_title ? ' — ' + d.report_title : ''}
                        </div>
                        <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '3px', lineHeight: 1.9 }}>
                          {d.reason}
                          <div>
                            {d.raised_by ? d.raised_by + ' · ' : ''}أُنشئ {fmt(d.created_at)} · آخر تحديث {relTime(d.updated_at)}
                          </div>
                          {d.resolution_note && <div style={{ color: '#15803D' }}>القرار: {d.resolution_note}</div>}
                        </div>
                        {/* Decided here, through resolve_dispute — the same
                            call /admin/disputes makes. An open objection is
                            about a report on this company, and this is the page
                            that shows the report. */}
                        {d.status === 'open' && (
                          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                            <button onClick={() => setDeciding({
                              title: 'قبول الاعتراض',
                              note: 'سيُعرض القرار على الشركة وصاحب التقرير.',
                              placeholder: 'على أي أساس قُبل الاعتراض؟',
                              run: (why) => resolveDispute(d.id, true, why),
                            })} disabled={busy} style={{
                              padding: '7px 16px', borderRadius: '8px', border: 0,
                              background: busy ? '#86EFAC' : '#15803D', color: '#fff',
                              fontSize: '12.5px', fontWeight: 800,
                              cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
                            }}>قبول الاعتراض</button>
                            <button onClick={() => setDeciding({
                              title: 'رفض الاعتراض',
                              note: 'سيُعرض القرار على الشركة.',
                              placeholder: 'لماذا يبقى التقرير كما هو؟',
                              run: (why) => resolveDispute(d.id, false, why),
                            })} disabled={busy} style={{
                              padding: '7px 16px', borderRadius: '8px', border: '1.5px solid #FECACA',
                              background: '#fff', color: '#B91C1C', fontSize: '12.5px', fontWeight: 800,
                              cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit',
                            }}>رفض الاعتراض</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
        </Card>
      )}

      {/* ===== Timeline — the story, not the columns ===== */}
      {tab === 'timeline' && (
        <Card>
          <SectionTitle>الخطّ الزمني</SectionTitle>
          {timeline.loading ? <TabSkeleton n={6} />
            : timeline.error ? <TabError what="الخطّ الزمني" message={timeline.error} onRetry={timeline.reload} />
              : !timeline.data?.length ? (
                <div style={{ fontSize: '14px', color: '#64748B', lineHeight: 2 }}>
                  <b style={{ color: '#0F172A' }}>لا يوجد نشاط بعد</b>
                  <div>ستظهر هنا الأحداث المهمّة المرتبطة بهذه الشركة.</div>
                </div>
              ) : timeline.data.map((e, i) => {
                const showDay = i === 0 || dayLabel(e.at) !== dayLabel(timeline.data[i - 1].at)
                return (
                  <div key={i}>
                    {showDay && (
                      <div style={{
                        fontSize: '12.5px', fontWeight: 800, color: '#94A3B8',
                        margin: i ? '18px 0 6px' : '0 0 6px',
                      }}>{dayLabel(e.at)}</div>
                    )}
                    <div style={{ display: 'flex', gap: '11px', padding: '9px 0' }}>
                      <span style={{ flex: 'none', fontSize: '15px' }}>{e.icon}</span>
                      <span style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{e.title}</div>
                        {e.detail && (
                          <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.9 }}>{e.detail}</div>
                        )}
                        <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                          {String(e.at).slice(11, 16)}{e.actor ? ' · ' + e.actor : ''}
                        </div>
                      </span>
                    </div>
                  </div>
                )
              })}
        </Card>
      )}

      {/* ===== Audit — raw on purpose ===== */}
      {tab === 'audit' && (
        <Card>
          <h2 style={{ ...h3, marginBottom: '4px' }}>سجل التدقيق</h2>
          <p style={{ fontSize: '12.5px', color: '#94A3B8', margin: '0 0 14px' }}>
            من غيّر أي حقل، ومن أي قيمة إلى أي قيمة، ولماذا. القيم كما كُتبت.
          </p>
          {audit.loading ? <TabSkeleton n={5} />
            : audit.error ? <TabError what="سجل التدقيق" message={audit.error} onRetry={audit.reload} />
              : !audit.data?.length ? (
                <div style={{ fontSize: '14px', color: '#64748B' }}>لا توجد تغييرات مسجّلة.</div>
              ) : (
                <>
                  {audit.data.map((r) => (
                    <button key={r.id} onClick={() => setAuditOpen(r)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'right', padding: '13px 0',
                        borderTop: '1px solid #F1F5F9', background: 'none', border: 0,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      <div style={{ fontSize: '12px', color: '#94A3B8' }}>{fmt(r.at)}</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                        {r.actor || 'النظام'}
                        <span style={{ fontWeight: 400, color: '#64748B' }}> · {r.action_ar}</span>
                      </div>
                      {(r.changes || []).slice(0, 3).map((c, j) => (
                        <div key={j} style={{ fontSize: '12.5px', color: '#334155', marginTop: '3px' }}>
                          <code style={{ color: '#64748B' }}>{c.field}</code>
                          {' '}
                          <span style={{ color: '#B91C1C' }}>{JSON.stringify(c.before)}</span>
                          {' ← '}
                          <span style={{ color: '#15803D' }}>{JSON.stringify(c.after)}</span>
                        </div>
                      ))}
                      {(r.changes || []).length > 3 && (
                        <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '3px' }}>
                          و{r.changes.length - 3} حقلاً آخر
                        </div>
                      )}
                      {r.reason && (
                        <div style={{ fontSize: '12.5px', color: '#B45309', marginTop: '3px' }}>
                          السبب: {r.reason}
                        </div>
                      )}
                    </button>
                  ))}

                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: '10px', marginTop: '16px', flexWrap: 'wrap',
                  }}>
                    <span style={{ fontSize: '12.5px', color: '#64748B' }}>
                      {auditPage * 25 + 1}–{auditPage * 25 + audit.data.length} من {audit.data[0]?.total ?? 0}
                    </span>
                    <span style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => setAuditPage((n) => Math.max(0, n - 1))}
                        disabled={auditPage === 0}
                        style={{
                          minHeight: '36px', padding: '0 14px', background: '#fff', color: '#334155',
                          border: '1.5px solid #E2E8F0', borderRadius: '8px', fontSize: '13px',
                          fontWeight: 700, fontFamily: 'inherit',
                          cursor: auditPage === 0 ? 'not-allowed' : 'pointer',
                        }}>السابق</button>
                      <button onClick={() => setAuditPage((n) => n + 1)}
                        disabled={(auditPage + 1) * 25 >= Number(audit.data[0]?.total ?? 0)}
                        style={{
                          minHeight: '36px', padding: '0 14px', background: '#fff', color: '#334155',
                          border: '1.5px solid #E2E8F0', borderRadius: '8px', fontSize: '13px',
                          fontWeight: 700, fontFamily: 'inherit',
                          cursor: (auditPage + 1) * 25 >= Number(audit.data[0]?.total ?? 0) ? 'not-allowed' : 'pointer',
                        }}>التالي</button>
                    </span>
                  </div>
                </>
              )}
        </Card>
      )}

      {/* ===== Audit detail — a drawer, not a page ===== */}
      {auditOpen && (
        <div role="dialog" aria-modal="true" aria-label="تفاصيل التغيير"
          onClick={(ev) => ev.target === ev.currentTarget && setAuditOpen(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 60,
            display: 'flex', justifyContent: 'flex-start',
          }}>
          <div style={{
            background: '#fff', width: 'min(460px, 100%)', height: '100%',
            overflowY: 'auto', padding: '24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                تفاصيل التغيير
              </h2>
              <button onClick={() => setAuditOpen(null)} aria-label="إغلاق"
                style={{ background: 'none', border: 0, fontSize: '20px', cursor: 'pointer', color: '#64748B' }}>×</button>
            </div>

            <dl style={{ margin: '18px 0 0', fontSize: '13.5px', lineHeight: 2.2 }}>
              {[
                ['الفاعل', auditOpen.actor || 'النظام'],
                ['الدور', auditOpen.actor_role || '—'],
                ['التاريخ والوقت', fmt(auditOpen.at)],
                ['العملية', auditOpen.action_ar],
                ['المفتاح الخام', auditOpen.action],
                ['السبب', auditOpen.reason || 'لم يُسجَّل'],
              ].map((row) => (
                <div key={row[0]} style={{
                  display: 'flex', justifyContent: 'space-between', gap: '12px',
                  borderBottom: '1px solid #F1F5F9',
                }}>
                  <dt style={{ color: '#64748B' }}>{row[0]}</dt>
                  <dd style={{
                    margin: 0, fontWeight: 700, color: '#0F172A', textAlign: 'left',
                    minWidth: 0, wordBreak: 'break-word',
                  }}>{row[1]}</dd>
                </div>
              ))}
            </dl>

            <div style={{ ...lbl, marginTop: '20px' }}>الحقول المتغيّرة</div>
            {/* Raw, deliberately. A value that has been translated is a value
                that cannot be used as evidence. */}
            {(auditOpen.changes || []).length === 0
              ? <div style={{ fontSize: '13px', color: '#94A3B8' }}>لا حقول متغيّرة مسجّلة.</div>
              : auditOpen.changes.map((c, i) => (
                <div key={i} style={{
                  border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px', marginBottom: '10px',
                }}>
                  <code style={{ fontSize: '12.5px', color: '#334155', fontWeight: 700 }}>{c.field}</code>
                  <div style={{ fontSize: '12.5px', marginTop: '6px', wordBreak: 'break-word' }}>
                    <div style={{ color: '#94A3B8' }}>قبل</div>
                    <div style={{ color: '#B91C1C' }}>{String(JSON.stringify(c.before) ?? '—').slice(0, 400)}</div>
                    <div style={{ color: '#94A3B8', marginTop: '6px' }}>بعد</div>
                    <div style={{ color: '#15803D' }}>{String(JSON.stringify(c.after) ?? '—').slice(0, 400)}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <Card>
          <SectionTitle>سجل النشاط</SectionTitle>
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
        </Card>
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

      {/* Rejecting says why. The company is shown this line and has to know
          what to send instead, so «مرفوض» on its own is not a decision it can
          act on. */}
      {rejecting && (
        <div role="dialog" aria-modal="true" aria-label="سبب الرفض"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setRejecting(null) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 150,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
          }}>
          <Card style={{ width: 'min(500px, 100%)' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px' }}>رفض المستند</h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 14px', lineHeight: 1.9 }}>
              {rejecting.label} — سيُعرض السبب على الشركة.
            </p>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              rows={4} placeholder="ما الخطأ في المستند، وما المطلوب بدلاً منه؟"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '11px 13px',
                border: '1.5px solid #E2E8F0', borderRadius: '10px', background: '#F8FAFC',
                fontSize: '14px', fontFamily: 'inherit', lineHeight: 1.9, resize: 'vertical',
              }} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
              <button onClick={() => reviewDoc(rejecting.id, false, rejectReason)}
                disabled={busy || rejectReason.trim().length < 5}
                style={{
                  padding: '10px 20px', borderRadius: '9px', border: 0,
                  background: rejectReason.trim().length < 5 || busy ? '#CBD5E1' : '#B91C1C',
                  color: '#fff', fontSize: '13px', fontWeight: 800,
                  cursor: rejectReason.trim().length < 5 || busy ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}>تأكيد الرفض</button>
              <button onClick={() => { setRejecting(null); setRejectReason('') }} disabled={busy}
                style={{
                  padding: '10px 20px', borderRadius: '9px', border: '1.5px solid #E2E8F0',
                  background: '#fff', color: '#1E2A52', fontSize: '13px', fontWeight: 800,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>إلغاء</button>
            </div>
          </Card>
        </div>
      )}

      {/* Refusing a registration or taking a badge back is shown to the company
          and has to say why. Same shape as the document rejection above,
          because it is the same act. */}
      {deciding && (
        <div role="dialog" aria-modal="true" aria-label="سبب القرار"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setDeciding(null) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 150,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
          }}>
          <Card style={{ width: 'min(500px, 100%)' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px' }}>
              {deciding.title}
            </h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 14px', lineHeight: 1.9 }}>
              {deciding.note || 'سيُعرض السبب على الشركة.'}
            </p>
            <textarea value={decideReason} onChange={(e) => setDecideReason(e.target.value)}
              rows={4}
              placeholder={deciding.placeholder}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '11px 13px',
                border: '1.5px solid #E2E8F0', borderRadius: '10px', background: '#F8FAFC',
                fontSize: '14px', fontFamily: 'inherit', lineHeight: 1.9, resize: 'vertical',
              }} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
              <button
                onClick={() => deciding.run(decideReason)}
                disabled={busy || decideReason.trim().length < 5}
                style={{
                  padding: '10px 20px', borderRadius: '9px', border: 0,
                  background: decideReason.trim().length < 5 || busy ? '#CBD5E1' : '#B91C1C',
                  color: '#fff', fontSize: '13px', fontWeight: 800,
                  cursor: decideReason.trim().length < 5 || busy ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}>تأكيد</button>
              <button onClick={() => { setDeciding(null); setDecideReason('') }} disabled={busy}
                style={{
                  padding: '10px 20px', borderRadius: '9px', border: '1.5px solid #E2E8F0',
                  background: '#fff', color: '#1E2A52', fontSize: '13px', fontWeight: 800,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>إلغاء</button>
            </div>
          </Card>
        </div>
      )}

      <DocumentViewer
        open={!!viewing}
        docKey={viewing?.key}
        fileName={viewing?.name}
        title={viewing?.title}
        onClose={() => setViewing(null)}
      />

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', insetInlineStart: '24px', background: '#0F172A', color: '#fff', padding: '13px 22px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, zIndex: 300 }}>{toast}</div>
      )}

    </div>
  )
}
