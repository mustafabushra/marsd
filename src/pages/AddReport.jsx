import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { Search as SearchIcon, Send } from 'lucide-react'
import { getSupabase, trustScoreOf } from '../lib/api'
import { useEntitlements } from '../hooks/useEntitlements'
import { UNLIMITED } from '../lib/entitlements'

const STEPS = [
  { n: 1, label: 'اختيار الشركة' },
  { n: 2, label: 'تفاصيل التعامل' },
  { n: 3, label: 'تأثير التقرير' },
  { n: 4, label: 'مراجعة وإرسال' },
]

const REPORT_TYPES = [
  { v: 'positive', t: 'إيجابي', color: '#16A34A', bg: '#F0FDF4' },
  { v: 'negative', t: 'سلبي', color: '#DC2626', bg: '#FEF2F2' },
  { v: 'warning', t: 'تحذيري', color: '#B45309', bg: '#FFFBEB' },
]
const CATEGORIES = [
  { v: 'late_payment', t: 'تأخير سداد' },
  { v: 'no_payment', t: 'عدم سداد' },
  { v: 'contract_breach', t: 'إخلال بالعقد' },
  { v: 'quality', t: 'جودة العمل' },
  { v: 'execution_delay', t: 'تأخير التنفيذ' },
  { v: 'dispute', t: 'نزاع' },
  { v: 'fraud', t: 'احتيال' },
  { v: 'other', t: 'أخرى' },
]
const RELATIONSHIPS = [
  { v: 'client', t: 'عميل' },
  { v: 'supplier', t: 'مورد' },
  { v: 'contractor', t: 'مقاول' },
  { v: 'subcontractor', t: 'مقاول باطن' },
  { v: 'partner', t: 'شريك' },
  { v: 'investor', t: 'مستثمر' },
  { v: 'other', t: 'أخرى' },
]
const PAYMENT_STATUS = [
  { v: 'full', t: 'تم السداد' },
  { v: 'partial', t: 'سداد جزئي' },
  { v: 'unpaid', t: 'لم يتم السداد' },
  { v: 'na', t: 'لا ينطبق' },
]
const RECOMMEND = [
  { v: 'yes', t: 'نعم', color: '#16A34A' },
  { v: 'maybe', t: 'ربما', color: '#B45309' },
  { v: 'no', t: 'لا', color: '#DC2626' },
]
const RATING_DIMS = [
  { k: 'commitment', t: 'الالتزام' },
  { k: 'quality', t: 'جودة العمل' },
  { k: 'communication', t: 'التواصل' },
  { k: 'speed', t: 'سرعة التنفيذ' },
  { k: 'professionalism', t: 'الاحترافية' },
  { k: 'payment', t: 'السداد' },
]

const EMPTY_FORM = {
  companyId: '',
  reportType: 'negative',
  category: '',
  title: '',
  description: '',
  relationshipType: '',
  fromDate: '',
  toDate: '',
  dealValue: '',
  currency: 'SAR',
  hasContract: false,
  contractNumber: '',
  invoiceNumber: '',
  paymentStatus: 'full',
  delayDays: '',
  ratings: { commitment: 0, quality: 0, communication: 0, speed: 0, professionalism: 0, payment: 0 },
  wouldRecommend: 'yes',
  hasDispute: false,
  hasLegalCase: false,
  isSettled: false,
  isAnonymous: false,
  declaration: false,
}

export default function AddReport() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useUser()
  const { entitlements, limitOf, refresh: refreshEntitlements } = useEntitlements()
  const prefill = location.state || {}

  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ ...EMPTY_FORM, companyId: prefill.companyId || '' })
  const [companies, setCompanies] = useState([])
  const [companiesLoading, setCompaniesLoading] = useState(true)
  const [companySearch, setCompanySearch] = useState(prefill.companyName || '')
  const [companyInfo, setCompanyInfo] = useState(null)
  const [ownCompanyId, setOwnCompanyId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => { fetchCompanies() }, [])
  useEffect(() => { if (form.companyId) loadCompanyInfo(form.companyId) }, [form.companyId])

  // A company cannot report on itself — resolve the reporter's own company
  useEffect(() => {
    const loadOwn = async () => {
      if (!user?.id) return
      try {
        const supabase = getSupabase()
        const { data: u } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
        if (!u?.tenant_id) return
        const { data: t } = await supabase.from('tenants').select('company_id').eq('id', u.tenant_id).single()
        if (t?.company_id) setOwnCompanyId(t.company_id)
      } catch (e) { /* non-blocking */ }
    }
    loadOwn()
  }, [user?.id])

  const fetchCompanies = async () => {
    try {
      // Companies available for reporting = approved and not suspended (registry-published)
      const supabase = getSupabase()
      const { data } = await supabase
        .from('companies')
        .select('id, name, cr_number, sector, city, trust_scores ( score )')
        .eq('approved', true)
        .neq('status', 'suspended')
        .order('name', { ascending: true })
        .limit(1000)
      setCompanies((data || []).map(c => ({
        id: c.id, name: c.name, sector: c.sector, city: c.city, cr: c.cr_number, score: trustScoreOf(c)?.score ?? null,
      })))
    } catch (err) {
      console.error('Failed to fetch companies:', err)
    } finally {
      setCompaniesLoading(false)
    }
  }

  const loadCompanyInfo = async (id) => {
    try {
      const supabase = getSupabase()
      const { data } = await supabase.from('companies')
        .select('name, cr_number, cr_status, verified')
        .eq('id', id).single()
      setCompanyInfo(data || null)
    } catch (e) { setCompanyInfo(null) }
  }

  const setField = (name, value) => setForm(prev => ({ ...prev, [name]: value }))
  const setRating = (k, v) => setForm(prev => ({ ...prev, ratings: { ...prev.ratings, [k]: v } }))

  const selectedCompany = companies.find(c => c.id === form.companyId)
  const selectableCompanies = companies.filter(c => c.id !== ownCompanyId)
  const nq = companySearch.trim().replace(/\s+/g, ' ')
  const filteredCompanies = nq
    ? selectableCompanies.filter(c => (c.name || '').replace(/\s+/g, ' ').includes(nq) || (c.cr || '').includes(nq))
    : selectableCompanies

  const goAddCompany = () => {
    const q = companySearch.trim()
    const isReg = /^[0-9]{6,}$/.test(q)
    navigate('/add-company', { state: isReg ? { registryNumber: q } : { companyName: q } })
  }

  // ===== Impact / reliability computation (client-side, Phase A) =====
  const impact = (() => {
    const checks = [
      !!form.category, !!form.title, form.description.trim().length >= 20, !!form.relationshipType,
      !!form.fromDate, !!form.dealValue, !!form.paymentStatus,
      Object.values(form.ratings).some(v => v > 0), !!form.wouldRecommend,
    ]
    const filled = checks.filter(Boolean).length
    const completeness = Math.round((filled / checks.length) * 100)
    const evidenceCount = 0 // documents arrive in Phase B
    const needsManualReview = ['fraud', 'dispute'].includes(form.category) || form.hasLegalCase || form.hasDispute
    let reliability = 'low'
    if (completeness >= 80) reliability = 'high'
    else if (completeness >= 50) reliability = 'medium'
    return { completeness, evidenceCount, needsManualReview, reliability }
  })()

  const validateStep = (s) => {
    if (s === 1 && !form.companyId) return 'اختر الشركة المُبلَّغ عنها'
    if (s === 1 && ownCompanyId && form.companyId === ownCompanyId) return 'لا يمكن تقديم تقرير عن شركتك نفسها'
    if (s === 2) {
      if (!form.category) return 'اختر تصنيف التقرير'
      if (!form.title.trim()) return 'أدخل عنوان التقرير'
      if (form.description.trim().length < 20) return 'وصف التقرير يجب أن يكون 20 حرفاً على الأقل'
      if (!form.fromDate) return 'حدّد تاريخ بداية التعامل'
    }
    return ''
  }

  const stepNext = () => {
    const msg = validateStep(step)
    if (msg) { setError(msg); return }
    setError('')
    setStep(s => Math.min(4, s + 1))
  }
  const stepPrev = () => { setError(''); setStep(s => Math.max(1, s - 1)) }

  const buildPayload = (statusValue, tenantId) => ({
    reporter_tenant_id: tenantId,
    target_company_id: form.companyId,
    report_type: form.reportType,
    category: form.category || null,
    title: form.title.trim() || null,
    description: form.description.trim() || null,
    notes: form.description.trim() || null,
    relationship_type: form.relationshipType || null,
    dealt_at: form.fromDate ? new Date(form.fromDate).toISOString() : new Date().toISOString(),
    deal_end_date: form.toDate || null,
    deal_value: form.dealValue ? Number(form.dealValue) : null,
    currency: form.currency || null,
    deal_amount_range: form.dealValue ? `${form.currency} ${form.dealValue}` : null,
    has_contract: form.hasContract,
    contract_number: form.contractNumber.trim() || null,
    invoice_number: form.invoiceNumber.trim() || null,
    payment_commitment: form.paymentStatus,
    delay_days: parseInt(form.delayDays, 10) || 0,
    defaulted: form.paymentStatus === 'unpaid',
    ratings: form.ratings,
    would_recommend: form.wouldRecommend,
    has_dispute: form.hasDispute,
    has_legal_case: form.hasLegalCase,
    is_settled: form.isSettled,
    is_anonymous: form.isAnonymous,
    declaration_accepted: statusValue === 'pending_review' ? form.declaration : false,
    declaration_accepted_at: statusValue === 'pending_review' && form.declaration ? new Date().toISOString() : null,
    status: statusValue,
    submitted_at: statusValue === 'pending_review' ? new Date().toISOString() : null,
  })

  const doSave = async (statusValue) => {
    setError('')
    const s1 = validateStep(1); if (s1) { setError(s1); setStep(1); return }
    const s2 = validateStep(2); if (s2) { setError(s2); setStep(2); return }
    if (statusValue === 'pending_review' && !form.declaration) {
      setError('يجب الموافقة على الإقرار قبل الإرسال')
      return
    }
    if (!user?.id) { setError('يجب تسجيل الدخول'); return }

    setLoading(true)
    try {
      const supabase = getSupabase()
      const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userData?.tenant_id) throw new Error('لم يتم العثور على شركة مرتبطة بحسابك')

      // How many reports a company may file is not limited — reports are what
      // the registry is made of, and metering them meters the product. What is
      // limited is how many may sit unreviewed at once.
      //
      // This is a queue control, not an abuse control. Abuse is already covered:
      // BR-05 below allows one report per target company per 90 days, so no
      // volume of filing can be aimed at a single competitor. What this prevents
      // is one tenant filling the review queue and making it unusable for
      // everyone else — and it clears itself as reviews complete.
      if (statusValue === 'pending_review') {
        const ceiling = limitOf('pending_reports')
        if (ceiling !== UNLIMITED && !entitlements?.degraded && !entitlements?.enforcementDisabled) {
          const { count } = await supabase
            .from('reports')
            .select('id', { count: 'exact', head: true })
            .eq('reporter_tenant_id', userData.tenant_id)
            .eq('status', 'pending_review')

          if ((count || 0) >= ceiling) {
            throw new Error(
              `لديك ${count} تقريراً قيد المراجعة، وهو حد باقتك (${ceiling}). ` +
              'إرسال التقارير غير محدود — انتظر مراجعة تقاريرك الحالية ثم واصل.',
            )
          }
        }
      }

      // BR-05: no duplicate report for same company within 90 days (submit only)
      if (statusValue === 'pending_review') {
        const ninetyDaysAgo = new Date(); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
        const { data: existing } = await supabase.from('reports').select('id')
          .eq('reporter_tenant_id', userData.tenant_id)
          .eq('target_company_id', form.companyId)
          .eq('status', 'pending_review')
          .gte('created_at', ninetyDaysAgo.toISOString()).limit(1)
        if (existing && existing.length > 0) {
          throw new Error('❌ لا يمكن إرسال تقرير لنفس الشركة مرتين خلال 90 يوم (BR-05)')
        }
      }

      const { data: reportData, error: submitError } = await supabase
        .from('reports').insert([buildPayload(statusValue, userData.tenant_id)]).select().single()
      if (submitError) throw submitError

      // Nothing is written to credits_ledger here. This used to deduct one
      // point with reason 'report_submitted', a value the CHECK constraint has
      // never permitted, and the insert's error was never read — so every
      // submission failed silently and the ledger stayed empty.
      //
      // Beyond the constraint, the direction was wrong: Give-to-Get pays for
      // contributions that turn out to be real. The award happens on approval,
      // in the admin review flow, where that is finally known.

      await supabase.from('audit_logs').insert([{
        tenant_id: userData.tenant_id, actor_id: user.id,
        action: statusValue === 'draft' ? 'report_draft_saved' : 'report_submitted',
        entity: 'report', entity_id: reportData.id,
        meta: JSON.stringify({ company_id: form.companyId, category: form.category, type: form.reportType }),
        created_at: new Date().toISOString(),
      }])

      setSuccess(statusValue === 'draft' ? 'draft' : 'submitted')
      setTimeout(() => navigate('/my-reports'), 1800)
    } catch (err) {
      setError(err.message || 'فشل الحفظ')
    } finally {
      setLoading(false)
    }
  }

  // ===== Styles =====
  const fieldStyle = { width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', background: '#fff', fontFamily: 'inherit', textAlign: 'right' }
  const labelStyle = { fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }

  const seg = (active, onClick, text, color = '#16A34A', bg = '#ECFDF5') => (
    <span onClick={onClick} style={{ flex: 1, textAlign: 'center', background: active ? bg : '#F1F5F9', color: active ? color : '#64748B', border: active ? `1.5px solid ${color}` : '1.5px solid transparent', borderRadius: '10px', padding: '11px', fontSize: '14px', fontWeight: active ? 800 : 700, cursor: 'pointer' }}>{text}</span>
  )
  const toggle = (val, onChange) => (
    <button type="button" onClick={() => onChange(!val)} style={{ width: '46px', height: '26px', borderRadius: '999px', border: 0, background: val ? '#16A34A' : '#CBD5E1', cursor: 'pointer', position: 'relative', flex: 'none' }}>
      <span style={{ position: 'absolute', top: '3px', right: val ? '3px' : '23px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'right .2s' }}></span>
    </button>
  )
  const stars = (k) => (
    <div style={{ display: 'flex', gap: '4px' }}>
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} onClick={() => setRating(k, n)} style={{ cursor: 'pointer', fontSize: '22px', color: n <= form.ratings[k] ? '#F59E0B' : '#E2E8F0', lineHeight: 1 }}>★</span>
      ))}
    </div>
  )

  if (success) {
    return (
      <div style={{ maxWidth: '520px', margin: '40px auto', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '40px', textAlign: 'center' }}>
        <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: success === 'draft' ? '#EEF2FF' : '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', margin: '0 auto 18px', color: success === 'draft' ? '#3730A3' : '#16A34A' }}>{success === 'draft' ? '📝' : '✓'}</div>
        <h2 style={{ fontSize: '23px', fontWeight: 900, color: '#0F172A', margin: '0 0 10px' }}>{success === 'draft' ? 'تم حفظ المسودّة' : 'تم إرسال التقرير'}</h2>
        <p style={{ fontSize: '15px', color: '#64748B', margin: '0 auto 24px', lineHeight: 1.75, maxWidth: '420px' }}>{success === 'draft' ? 'يمكنك إكمال التقرير لاحقاً من صفحة تقاريري.' : 'سيتم إرسال التقرير لإدارة المنصة للمراجعة قبل اعتماده. لن يظهر التقرير علناً، وستظهر مؤشراته بشكل مجمّع وسرّي.'}</p>
        <button onClick={() => navigate('/my-reports')} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '11px', padding: '13px 32px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>عرض تقاريري</button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto' }}>
      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
        {STEPS.map((w, idx) => {
          const done = w.n < step, active = w.n === step
          return (
            <div key={w.n} style={{ display: 'flex', alignItems: 'center', flex: idx < STEPS.length - 1 ? 1 : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '14px', flex: 'none', background: active || done ? '#16A34A' : '#E2E8F0', color: active || done ? '#fff' : '#94A3B8' }}>{done ? '✓' : String(w.n)}</div>
                <span style={{ fontSize: '13.5px', fontWeight: active ? 800 : 600, color: active || done ? '#1E2A52' : '#94A3B8', whiteSpace: 'nowrap' }}>{w.label}</span>
              </div>
              {idx < STEPS.length - 1 && <div style={{ flex: 1, height: '2px', background: '#E2E8F0', margin: '0 10px', minWidth: '12px' }}></div>}
            </div>
          )
        })}
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '14px 18px', marginBottom: '18px', fontSize: '14px', color: '#B91C1C', fontWeight: 700 }}>{error}</div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '32px' }}>
        {/* ===== STEP 1 ===== */}
        {step === 1 && (
          <>
            <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px', textAlign: 'right' }}>اختيار الشركة المُبلَّغ عنها</h2>
            <p style={{ fontSize: '14.5px', color: '#64748B', margin: '0 0 18px', textAlign: 'right' }}>ابحث بالاسم أو رقم السجل التجاري لاختيار الشركة التي تعاملت معها</p>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '11px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '0 16px' }}>
                <SearchIcon size={20} color="#94A3B8" />
                <input placeholder="اسم الشركة أو رقم السجل التجاري" value={companySearch} onChange={(e) => setCompanySearch(e.target.value)} style={{ flex: 1, border: 0, background: 'transparent', padding: '14px 0', fontSize: '15px', outline: 'none', textAlign: 'right', fontFamily: 'inherit' }} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
              {companiesLoading ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748B', fontSize: '14px' }}>جاري تحميل الشركات...</div>
              ) : filteredCompanies.length === 0 ? (
                companySearch.trim() ? (
                  <div style={{ textAlign: 'center', padding: '30px 16px', border: '1.5px dashed #CBD5E1', borderRadius: '14px', background: '#F8FAFC' }}>
                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔍</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>لم يتم العثور على نتائج</div>
                    <div style={{ fontSize: '13.5px', color: '#64748B', marginBottom: '16px' }}>جرّب اسم شركة أخرى أو رقم سجل مختلف</div>
                    <button type="button" onClick={goAddCompany} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '11px', padding: '12px 24px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>+ طلب إضافة شركة</button>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '30px', color: '#64748B', fontSize: '14px' }}>ابدأ بكتابة اسم الشركة أو رقم سجلها للبحث</div>
                )
              ) : filteredCompanies.slice(0, 40).map(c => {
                const chosen = form.companyId === c.id
                return (
                  <div key={c.id} onClick={() => setField('companyId', c.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: chosen ? '1.5px solid #16A34A' : '1.5px solid #E2E8F0', background: chosen ? '#F0FDF4' : '#fff', borderRadius: '12px', padding: '14px 16px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#1E2A52', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flex: 'none' }}>{(c.name || '؟').charAt(0)}</div>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', textAlign: 'right' }}>{c.name}</div>
                        <div style={{ fontSize: '13px', color: '#64748B', textAlign: 'right' }}>السجل: {c.cr || '—'} · {c.city || '—'}</div>
                      </div>
                    </div>
                    {chosen && <span style={{ color: '#16A34A', fontWeight: 900, fontSize: '18px' }}>✓</span>}
                  </div>
                )
              })}
            </div>

            {/* Auto-displayed company info */}
            {selectedCompany && (
              <div style={{ marginTop: '16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px', display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center' }}>
                <div><div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>الشركة</div><div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedCompany.name}</div></div>
                <div><div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>رقم السجل</div><div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedCompany.cr || '—'}</div></div>
                <div><div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>حالة السجل</div><div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{companyInfo?.cr_status === 'active' ? 'نشط' : companyInfo?.cr_status || '—'}</div></div>
                <div><div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>مؤشر الثقة</div><div style={{ fontSize: '15px', fontWeight: 800, color: '#1E2A52' }}>{selectedCompany.score != null ? `${selectedCompany.score} / 100` : '—'}</div></div>
                <div><div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>التحقق</div><div style={{ fontSize: '14px', fontWeight: 800, color: companyInfo?.verified ? '#1D4ED8' : '#94A3B8' }}>{companyInfo?.verified ? '✔ موثّقة' : 'غير موثّقة'}</div></div>
              </div>
            )}
          </>
        )}

        {/* ===== STEP 2 ===== */}
        {step === 2 && (
          <>
            <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 20px', textAlign: 'right' }}>تفاصيل التعامل</h2>

            <div style={{ marginBottom: '18px' }}>
              <label style={labelStyle}>نوع التقرير</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {REPORT_TYPES.map(rt => seg(form.reportType === rt.v, () => setField('reportType', rt.v), rt.t, rt.color, rt.bg))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px' }}>
              <div>
                <label style={labelStyle}>تصنيف التقرير</label>
                <select value={form.category} onChange={(e) => setField('category', e.target.value)} style={{ ...fieldStyle, background: '#fff' }}>
                  <option value="">— اختر —</option>
                  {CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.t}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>نوع العلاقة</label>
                <select value={form.relationshipType} onChange={(e) => setField('relationshipType', e.target.value)} style={{ ...fieldStyle, background: '#fff' }}>
                  <option value="">— اختر —</option>
                  {RELATIONSHIPS.map(r => <option key={r.v} value={r.v}>{r.t}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1/3' }}>
                <label style={labelStyle}>عنوان التقرير</label>
                <input value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="عنوان موجز يصف التعامل" style={fieldStyle} />
              </div>
              <div style={{ gridColumn: '1/3' }}>
                <label style={labelStyle}>وصف التقرير</label>
                <textarea value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="اشرح تفاصيل التعامل (20 حرفاً على الأقل)" style={{ ...fieldStyle, minHeight: '100px', resize: 'vertical' }} />
              </div>
            </div>

            <div style={{ fontSize: '13px', fontWeight: 800, color: '#64748B', margin: '4px 0 12px' }}>معلومات التعامل</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px' }}>
              <div><label style={labelStyle}>تاريخ بداية التعامل</label><input type="date" value={form.fromDate} onChange={(e) => setField('fromDate', e.target.value)} style={fieldStyle} /></div>
              <div><label style={labelStyle}>تاريخ انتهاء التعامل (اختياري)</label><input type="date" value={form.toDate} onChange={(e) => setField('toDate', e.target.value)} style={fieldStyle} /></div>
              <div><label style={labelStyle}>قيمة التعامل (اختياري)</label><input type="number" value={form.dealValue} onChange={(e) => setField('dealValue', e.target.value)} placeholder="120000" style={fieldStyle} /></div>
              <div><label style={labelStyle}>العملة</label>
                <select value={form.currency} onChange={(e) => setField('currency', e.target.value)} style={{ ...fieldStyle, background: '#fff' }}>
                  <option value="SAR">ريال سعودي (SAR)</option>
                  <option value="USD">دولار (USD)</option>
                  <option value="AED">درهم (AED)</option>
                  <option value="EUR">يورو (EUR)</option>
                </select>
              </div>
              <div><label style={labelStyle}>رقم العقد (اختياري)</label><input value={form.contractNumber} onChange={(e) => setField('contractNumber', e.target.value)} style={fieldStyle} /></div>
              <div><label style={labelStyle}>رقم الفاتورة (اختياري)</label><input value={form.invoiceNumber} onChange={(e) => setField('invoiceNumber', e.target.value)} style={fieldStyle} /></div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gridColumn: '1/3', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px 16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#334155' }}>هل يوجد عقد؟</span>
                {toggle(form.hasContract, (v) => setField('hasContract', v))}
              </div>
            </div>

            <div style={{ fontSize: '13px', fontWeight: 800, color: '#64748B', margin: '4px 0 12px' }}>حالة السداد</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
              {PAYMENT_STATUS.map(p => (
                <span key={p.v} onClick={() => setField('paymentStatus', p.v)} style={{ background: form.paymentStatus === p.v ? '#1E2A52' : '#F1F5F9', color: form.paymentStatus === p.v ? '#fff' : '#64748B', borderRadius: '9px', padding: '10px 16px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>{p.t}</span>
              ))}
            </div>
            {(form.paymentStatus === 'partial' || form.paymentStatus === 'unpaid') && (
              <div style={{ marginBottom: '18px', maxWidth: '260px' }}>
                <label style={labelStyle}>عدد أيام التأخير</label>
                <input type="number" value={form.delayDays} onChange={(e) => setField('delayDays', e.target.value)} placeholder="0" style={fieldStyle} />
              </div>
            )}

            <div style={{ fontSize: '13px', fontWeight: 800, color: '#64748B', margin: '8px 0 12px' }}>تقييم التعامل (1–5)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
              {RATING_DIMS.map(d => (
                <div key={d.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '11px 16px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#334155' }}>{d.t}</span>
                  {stars(d.k)}
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={labelStyle}>هل تنصح بالتعامل مع هذه الشركة؟</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {RECOMMEND.map(r => seg(form.wouldRecommend === r.v, () => setField('wouldRecommend', r.v), r.t, r.color, r.color === '#16A34A' ? '#ECFDF5' : r.color === '#B45309' ? '#FFFBEB' : '#FEF2F2'))}
              </div>
            </div>

            <div style={{ fontSize: '13px', fontWeight: 800, color: '#64748B', margin: '4px 0 12px' }}>النزاعات</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              {[
                { k: 'hasDispute', t: 'هل يوجد نزاع؟' },
                { k: 'hasLegalCase', t: 'هل يوجد قضية؟' },
                { k: 'isSettled', t: 'هل تمت التسوية؟' },
              ].map(d => (
                <div key={d.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '11px 14px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155' }}>{d.t}</span>
                  {toggle(form[d.k], (v) => setField(d.k, v))}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ===== STEP 3: IMPACT ===== */}
        {step === 3 && (
          <>
            <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px', textAlign: 'right' }}>تأثير التقرير</h2>
            <p style={{ fontSize: '14.5px', color: '#64748B', margin: '0 0 22px', textAlign: 'right' }}>نظرة شفافة على جودة تقريرك قبل الإرسال</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '18px' }}>
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '20px' }}>
                <div style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 700, marginBottom: '10px' }}>اكتمال البيانات</div>
                <div style={{ fontSize: '30px', fontWeight: 900, color: '#1E2A52', marginBottom: '10px' }}>{impact.completeness}%</div>
                <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '5px', overflow: 'hidden' }}>
                  <div style={{ width: `${impact.completeness}%`, height: '100%', background: impact.completeness >= 80 ? '#16A34A' : impact.completeness >= 50 ? '#F59E0B' : '#DC2626', borderRadius: '5px' }}></div>
                </div>
              </div>
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '20px' }}>
                <div style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 700, marginBottom: '10px' }}>مستوى الموثوقية</div>
                <div style={{ display: 'inline-block', background: impact.reliability === 'high' ? '#ECFDF5' : impact.reliability === 'medium' ? '#FFFBEB' : '#FEF2F2', color: impact.reliability === 'high' ? '#15803D' : impact.reliability === 'medium' ? '#B45309' : '#B91C1C', borderRadius: '999px', padding: '8px 20px', fontSize: '16px', fontWeight: 900 }}>
                  {impact.reliability === 'high' ? 'مرتفع' : impact.reliability === 'medium' ? 'متوسط' : 'منخفض'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { ok: true, label: 'هل سيؤثر هذا التقرير على مؤشر الثقة؟', val: 'نعم — بعد اعتماده من الإدارة' },
                { ok: impact.evidenceCount > 0, label: 'هل توجد مستندات كافية؟', val: impact.evidenceCount > 0 ? `${impact.evidenceCount} مستند` : 'لا توجد مستندات مرفقة بعد' },
                { ok: !impact.needsManualReview, label: 'هل يحتاج مراجعة يدوية إضافية؟', val: impact.needsManualReview ? 'نعم — لوجود نزاع/قضية/احتيال' : 'مراجعة اعتيادية' },
              ].map((row, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '11px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '16px' }}>{row.ok ? '✅' : '⚠️'}</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#334155' }}>{row.label}</span>
                  </div>
                  <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 700 }}>{row.val}</span>
                </div>
              ))}
            </div>

            {impact.completeness < 50 && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '14px 18px', marginTop: '16px', fontSize: '13.5px', color: '#92400E', fontWeight: 700, lineHeight: 1.6 }}>
                ℹ بيانات التقرير غير مكتملة — إضافة تفاصيل وتقييمات أكثر يرفع موثوقية التقرير ويقلّل احتمال رفضه.
              </div>
            )}
          </>
        )}

        {/* ===== STEP 4: REVIEW ===== */}
        {step === 4 && (
          <>
            <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 20px', textAlign: 'right' }}>مراجعة وإرسال</h2>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '22px', marginBottom: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                {[
                  ['الشركة', selectedCompany?.name || '—'],
                  ['نوع التقرير', REPORT_TYPES.find(t => t.v === form.reportType)?.t],
                  ['التصنيف', CATEGORIES.find(c => c.v === form.category)?.t || '—'],
                  ['قيمة التعامل', form.dealValue ? `${form.dealValue} ${form.currency}` : '—'],
                  ['حالة السداد', PAYMENT_STATUS.find(p => p.v === form.paymentStatus)?.t],
                  ['التوصية', RECOMMEND.find(r => r.v === form.wouldRecommend)?.t],
                ].map(([l, v]) => (
                  <div key={l}><div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700, marginBottom: '3px' }}>{l}</div><div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{v}</div></div>
                ))}
              </div>
            </div>

            {/* Privacy */}
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#64748B', margin: '4px 0 10px' }}>خيارات الخصوصية</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '11px', padding: '14px 16px', marginBottom: '18px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>إخفاء اسم شركتي عن الشركات الأخرى</div>
                <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '2px' }}>تبقى هويتك معروفة لإدارة مرصد فقط</div>
              </div>
              {toggle(form.isAnonymous, (v) => setField('isAnonymous', v))}
            </div>

            {/* Declaration */}
            <label style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '16px', cursor: 'pointer', marginBottom: '8px' }}>
              <input type="checkbox" checked={form.declaration} onChange={(e) => setField('declaration', e.target.checked)} style={{ marginTop: '3px', width: '18px', height: '18px', accentColor: '#16A34A', flex: 'none' }} />
              <span style={{ fontSize: '13.5px', color: '#92400E', fontWeight: 700, lineHeight: 1.7 }}>أقر بأن جميع المعلومات المقدمة صحيحة، وأن لديّ مستندات تثبتها، وأتحمل المسؤولية القانونية عن أي معلومات غير صحيحة أو مضلّلة، وأوافق على مراجعة التقرير وفق سياسات منصة مرصد قبل نشره.</span>
            </label>
          </>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '28px', paddingTop: '22px', borderTop: '1px solid #F1F5F9', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={step === 1 ? () => navigate('/search') : stepPrev} disabled={loading} style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 26px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{step === 1 ? 'إلغاء' : 'السابق'}</button>
          <div style={{ display: 'flex', gap: '10px' }}>
            {step === 4 && (
              <button onClick={() => doSave('draft')} disabled={loading} style={{ background: '#fff', color: '#1E2A52', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 22px', fontSize: '14.5px', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>حفظ كمسودّة</button>
            )}
            {step < 4 ? (
              <button onClick={stepNext} style={{ background: '#1E2A52', color: '#fff', border: 0, borderRadius: '10px', padding: '12px 34px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>التالي</button>
            ) : (
              <button onClick={() => doSave('pending_review')} disabled={loading} style={{ background: loading ? '#94A3B8' : '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '12px 34px', fontSize: '14.5px', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'inherit' }}><Send size={16} />{loading ? 'جاري الإرسال...' : 'إرسال للمراجعة'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
