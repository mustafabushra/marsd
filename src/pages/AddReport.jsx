import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search as SearchIcon, Send } from 'lucide-react'
import { getSupabase } from '../lib/api'

const STEPS = [
  { n: 1, label: 'اختيار الشركة' },
  { n: 2, label: 'تفاصيل التعامل' },
  { n: 3, label: 'المستندات الداعمة' },
  { n: 4, label: 'مراجعة وإرسال' },
]

const PAYMENT_LABELS = { full: 'تم السداد', partial: 'سداد جزئي', default: 'لم يُسدَّد' }

export default function AddReport() {
  const navigate = useNavigate()
  const location = useLocation()
  const prefill = location.state || {}

  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    companyId: prefill.companyId || '',
    dealValue: '',
    delayDays: '',
    fromDate: '',
    toDate: '',
    paymentCommitment: 'full',
    duesOutstanding: false,
    notes: '',
  })
  const [companies, setCompanies] = useState([])
  const [companiesLoading, setCompaniesLoading] = useState(true)
  const [companySearch, setCompanySearch] = useState(prefill.companyName || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetchCompanies()
  }, [])

  const fetchCompanies = async () => {
    try {
      const { searchCompaniesKnowledgeBase } = await import('../lib/api')
      const response = await searchCompaniesKnowledgeBase('', { status: 'approved' }, 1, 1000)
      const formatted = response.data?.map(c => ({
        id: c.id,
        name: c.name,
        sector: c.sector,
        city: c.city,
        cr: c.cr_number,
      })) || []
      setCompanies(formatted)
    } catch (err) {
      console.error('Failed to fetch companies:', err)
    } finally {
      setCompaniesLoading(false)
    }
  }

  const setField = (name, value) => setFormData(prev => ({ ...prev, [name]: value }))

  const selectedCompany = companies.find(c => c.id === formData.companyId)

  const filteredCompanies = companySearch.trim()
    ? companies.filter(c =>
        (c.name || '').includes(companySearch.trim()) ||
        (c.cr || '').includes(companySearch.trim()))
    : companies

  const validateStep = (current) => {
    if (current === 1 && !formData.companyId) return 'اختر الشركة المُبلَّغ عنها'
    if (current === 2 && !formData.fromDate) return 'حدّد تاريخ بداية التعامل'
    return ''
  }

  const stepNext = () => {
    const msg = validateStep(step)
    if (msg) { setError(msg); return }
    setError('')
    setStep(s => Math.min(4, s + 1))
  }
  const stepPrev = () => { setError(''); setStep(s => Math.max(1, s - 1)) }

  const handleSubmit = async () => {
    setError('')
    // Final validation
    const s1 = validateStep(1)
    if (s1) { setError(s1); setStep(1); return }
    const s2 = validateStep(2)
    if (s2) { setError(s2); setStep(2); return }

    setLoading(true)
    try {
      const supabase = getSupabase()
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) throw new Error('Unauthorized')

      // Get user's tenant
      const { data: userData } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', user.user.id)
        .single()

      if (!userData?.tenant_id) throw new Error('Tenant not found')

      // BR-05: Check for duplicate reports in last 90 days
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

      const { data: existingReport } = await supabase
        .from('reports')
        .select('id')
        .eq('reporter_tenant_id', userData.tenant_id)
        .eq('target_company_id', formData.companyId)
        .gte('created_at', ninetyDaysAgo.toISOString())
        .limit(1)

      if (existingReport && existingReport.length > 0) {
        throw new Error('❌ لا يمكن إرسال تقرير لنفس الشركة مرتين خلال 90 يوم (BR-05)')
      }

      // Submit report (real schema columns)
      const { data: reportData, error: submitError } = await supabase
        .from('reports')
        .insert([{
          reporter_tenant_id: userData.tenant_id,
          target_company_id: formData.companyId,
          deal_amount_range: formData.dealValue ? `SAR ${formData.dealValue}` : null,
          payment_commitment: formData.paymentCommitment,
          delay_days: parseInt(formData.delayDays, 10) || 0,
          defaulted: formData.duesOutstanding,
          dealt_at: new Date(formData.fromDate).toISOString(),
          notes: formData.notes || null,
          status: 'pending_review',
          submitted_at: new Date().toISOString(),
        }])
        .select()
        .single()

      if (submitError) throw submitError

      // Deduct 1 credit (will be refunded if rejected)
      await supabase
        .from('credits_ledger')
        .insert([{
          tenant_id: userData.tenant_id,
          report_id: reportData.id,
          amount: -1,
          reason: 'report_submitted',
          created_at: new Date().toISOString(),
        }])
        .catch(err => console.warn('Credit deduction warning:', err))

      // Audit log
      await supabase
        .from('audit_logs')
        .insert([{
          tenant_id: userData.tenant_id,
          actor_id: user.user.id,
          action: 'report_submitted',
          entity: 'report',
          entity_id: reportData.id,
          meta: JSON.stringify({ company_id: formData.companyId, payment_commitment: formData.paymentCommitment }),
          created_at: new Date().toISOString(),
        }])
        .catch(err => console.warn('Audit log warning:', err))

      setSuccess(true)
      setTimeout(() => navigate('/my-reports'), 2000)
    } catch (err) {
      setError(err.message || 'فشل الإرسال')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div style={{ maxWidth: '520px', margin: '40px auto', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '40px', textAlign: 'center' }}>
        <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', margin: '0 auto 18px', color: '#16A34A' }}>✓</div>
        <h2 style={{ fontSize: '23px', fontWeight: 900, color: '#0F172A', margin: '0 0 10px' }}>تم إرسال التقرير</h2>
        <p style={{ fontSize: '15px', color: '#64748B', margin: '0 auto 24px', lineHeight: 1.75, maxWidth: '420px' }}>سيتم إرسال التقرير لإدارة المنصة للمراجعة قبل اعتماده. لن يظهر التقرير علناً، وستظهر مؤشراته بشكل مجمّع وسرّي.</p>
        <button
          onClick={() => navigate('/my-reports')}
          style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '11px', padding: '13px 32px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          عرض تقاريري
        </button>
      </div>
    )
  }

  const fieldStyle = {
    width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px',
    fontSize: '15px', outline: 'none', background: '#fff', fontFamily: 'inherit',
  }
  const labelStyle = { fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }

  const chip = (active, onClick, text, activeBg = '#16A34A') => (
    <span
      onClick={onClick}
      style={{
        flex: 1, textAlign: 'center', background: active ? activeBg : '#F1F5F9', color: active ? '#fff' : '#64748B',
        borderRadius: '9px', padding: '11px', fontSize: '14px', fontWeight: active ? 800 : 700, cursor: 'pointer',
      }}>
      {text}
    </span>
  )

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '28px' }}>
        {STEPS.map((w, idx) => {
          const done = w.n < step
          const active = w.n === step
          return (
            <div key={w.n} style={{ display: 'flex', alignItems: 'center', flex: idx < STEPS.length - 1 ? 1 : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                <div style={{
                  width: '38px', height: '38px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: '15px', flex: 'none',
                  background: active || done ? '#16A34A' : '#E2E8F0', color: active || done ? '#fff' : '#94A3B8',
                }}>{done ? '✓' : String(w.n)}</div>
                <span style={{ fontSize: '14px', fontWeight: active ? 800 : 600, color: active || done ? '#1E2A52' : '#94A3B8', whiteSpace: 'nowrap' }}>{w.label}</span>
              </div>
              {idx < STEPS.length - 1 && (
                <div style={{ flex: 1, height: '2px', background: '#E2E8F0', margin: '0 10px', minWidth: '16px' }}></div>
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '14px 18px', marginBottom: '18px', fontSize: '14px', color: '#B91C1C', fontWeight: 700 }}>
          {error}
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '32px' }}>
        {/* STEP 1: Company selection */}
        {step === 1 && (
          <>
            <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px', textAlign: 'right' }}>اختيار الشركة المُبلَّغ عنها</h2>
            <p style={{ fontSize: '14.5px', color: '#64748B', margin: '0 0 22px', textAlign: 'right' }}>ابحث عن الشركة التي تعاملت معها</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '11px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '0 16px', marginBottom: '16px' }}>
              <SearchIcon size={20} color="#94A3B8" />
              <input
                placeholder="اسم الشركة أو رقم السجل التجاري"
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                style={{ flex: 1, border: 0, background: 'transparent', padding: '14px 0', fontSize: '15px', outline: 'none', textAlign: 'right', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '340px', overflowY: 'auto' }}>
              {companiesLoading ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8', fontSize: '14px' }}>جاري تحميل الشركات...</div>
              ) : filteredCompanies.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8', fontSize: '14px' }}>لا توجد شركات مطابقة</div>
              ) : (
                filteredCompanies.slice(0, 40).map(c => {
                  const chosen = formData.companyId === c.id
                  return (
                    <div
                      key={c.id}
                      onClick={() => setField('companyId', c.id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        border: chosen ? '1.5px solid #16A34A' : '1.5px solid #E2E8F0',
                        background: chosen ? '#F0FDF4' : '#fff', borderRadius: '12px', padding: '16px', cursor: 'pointer',
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#1E2A52', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flex: 'none' }}>{(c.name || '؟').charAt(0)}</div>
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', textAlign: 'right' }}>{c.name}</div>
                          <div style={{ fontSize: '13px', color: '#64748B', textAlign: 'right' }}>السجل: {c.cr || '—'} · {c.city || '—'}</div>
                        </div>
                      </div>
                      {chosen && <span style={{ color: '#16A34A', fontWeight: 900, fontSize: '18px' }}>✓</span>}
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}

        {/* STEP 2: Deal details */}
        {step === 2 && (
          <>
            <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 22px', textAlign: 'right' }}>تفاصيل التعامل</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
              <div>
                <label style={labelStyle}>قيمة التعامل (ر.س)</label>
                <input type="number" placeholder="120,000" value={formData.dealValue} onChange={(e) => setField('dealValue', e.target.value)} style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>متوسط التأخير (أيام)</label>
                <input type="number" placeholder="4" value={formData.delayDays} onChange={(e) => setField('delayDays', e.target.value)} style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>من تاريخ</label>
                <input type="date" value={formData.fromDate} onChange={(e) => setField('fromDate', e.target.value)} style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>إلى تاريخ</label>
                <input type="date" value={formData.toDate} onChange={(e) => setField('toDate', e.target.value)} style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>هل تم السداد؟</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {chip(formData.paymentCommitment === 'full', () => setField('paymentCommitment', 'full'), 'نعم')}
                  {chip(formData.paymentCommitment === 'partial', () => setField('paymentCommitment', 'partial'), 'جزئي', '#1E2A52')}
                  {chip(formData.paymentCommitment === 'default', () => setField('paymentCommitment', 'default'), 'لا', '#DC2626')}
                </div>
              </div>
              <div>
                <label style={labelStyle}>مبالغ مستحقة؟</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {chip(formData.duesOutstanding === true, () => setField('duesOutstanding', true), 'نعم', '#DC2626')}
                  {chip(formData.duesOutstanding === false, () => setField('duesOutstanding', false), 'لا', '#1E2A52')}
                </div>
              </div>
              <div style={{ gridColumn: '1/3' }}>
                <label style={labelStyle}>ملاحظات إضافية</label>
                <textarea placeholder="تفاصيل عن التعامل..." value={formData.notes} onChange={(e) => setField('notes', e.target.value)} style={{ ...fieldStyle, minHeight: '90px', resize: 'vertical', textAlign: 'right' }} />
              </div>
            </div>
          </>
        )}

        {/* STEP 3: Documents (optional, UI placeholder) */}
        {step === 3 && (
          <>
            <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px', textAlign: 'right' }}>المستندات الداعمة</h2>
            <p style={{ fontSize: '14.5px', color: '#64748B', margin: '0 0 22px', textAlign: 'right' }}>ارفق الفواتير أو العقود لتسريع المراجعة (اختياري)</p>
            <div style={{ border: '2px dashed #CBD5E1', borderRadius: '16px', padding: '46px', textAlign: 'center', background: '#F8FAFC' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📎</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>اسحب الملفات هنا أو اضغط للرفع</div>
              <div style={{ fontSize: '13px', color: '#94A3B8' }}>PDF، JPG، PNG حتى 10MB</div>
            </div>
          </>
        )}

        {/* STEP 4: Review */}
        {step === 4 && (
          <>
            <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 22px', textAlign: 'right' }}>مراجعة وإرسال</h2>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '22px', marginBottom: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 700, marginBottom: '3px' }}>الشركة</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedCompany?.name || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 700, marginBottom: '3px' }}>قيمة التعامل</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{formData.dealValue ? `${formData.dealValue} ر.س` : '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 700, marginBottom: '3px' }}>حالة السداد</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: formData.paymentCommitment === 'full' ? '#16A34A' : formData.paymentCommitment === 'partial' ? '#B45309' : '#DC2626' }}>{PAYMENT_LABELS[formData.paymentCommitment]}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 700, marginBottom: '3px' }}>متوسط التأخير</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{formData.delayDays || 0} أيام</div>
                </div>
              </div>
            </div>
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '15px 18px', display: 'flex', gap: '11px', alignItems: 'center' }}>
              <span style={{ fontSize: '18px' }}>ℹ</span>
              <span style={{ fontSize: '14px', color: '#92400E', fontWeight: 700, lineHeight: 1.6 }}>سيتم إرسال التقرير لإدارة المنصة للمراجعة قبل اعتماده. لن يظهر التقرير علناً، وستظهر مؤشراته بشكل مجمّع وسرّي.</span>
            </div>
          </>
        )}

        {/* Footer nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '28px', paddingTop: '22px', borderTop: '1px solid #F1F5F9' }}>
          <button
            onClick={step === 1 ? () => navigate('/search') : stepPrev}
            style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 26px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            {step === 1 ? 'إلغاء' : 'السابق'}
          </button>
          {step < 4 ? (
            <button
              onClick={stepNext}
              style={{ background: '#1E2A52', color: '#fff', border: 0, borderRadius: '10px', padding: '12px 34px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              التالي
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{ background: loading ? '#94A3B8' : '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '12px 34px', fontSize: '14.5px', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'inherit' }}>
              <Send size={16} />
              {loading ? 'جاري الإرسال...' : 'إرسال التقرير'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
