import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { submitReport, searchCompanies } from '../lib/api'
import { CheckIcon, FileIcon, UploadIcon } from '../components/icons'
import { useUserRole } from '../hooks/useUserRole'
import { useSystemStatus } from '../hooks/useSystemStatus'
import { canPerform } from '../utils/roles'

export default function AddReport() {
  const navigate = useNavigate()
  const { role, loading: roleLoading } = useUserRole()
  const systemStatus = useSystemStatus()
  const [step, setStep] = useState(1)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [companies, setCompanies] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCompany, setSelectedCompany] = useState(null)

  // Check access (BUSINESS_RULES_MATRIX #23-26)
  const canSubmitReport =
    canPerform(role, 'canAddReport') &&
    systemStatus.subscriptionActive &&
    systemStatus.accountActive &&
    systemStatus.creditsBalance > 0

  const [formData, setFormData] = useState({
    targetCompanyId: '',
    title: '',
    description: '',
    transactionValue: '',
    delayDays: '',
    dateFrom: '',
    dateTo: '',
    paymentStatus: 'paid',
    dueAmounts: 'no',
    notes: ''
  })

  const steps = [
    { num: 1, label: 'اختيار الشركة', active: step >= 1 },
    { num: 2, label: 'تفاصيل التعامل', active: step >= 2 },
    { num: 3, label: 'المستندات الداعمة', active: step >= 3 },
    { num: 4, label: 'مراجعة وإرسال', active: step >= 4 }
  ]

  // Search companies as user types
  useEffect(() => {
    if (searchQuery.length > 1) {
      const timer = setTimeout(async () => {
        try {
          const result = await searchCompanies(searchQuery, 1, 10)
          setCompanies(result.data || [])
        } catch (err) {
          console.error('Search error:', err)
        }
      }, 300)
      return () => clearTimeout(timer)
    } else {
      setCompanies([])
    }
  }, [searchQuery])

  const handleSelectCompany = (company) => {
    setSelectedCompany(company)
    setFormData(prev => ({
      ...prev,
      targetCompanyId: company.id
    }))
    setSearchQuery('')
    setCompanies([])
  }

  const handleNext = () => {
    // Validate current step
    if (step === 1 && !selectedCompany) {
      setError('اختر شركة أولاً')
      return
    }
    if (step === 2) {
      if (!formData.transactionValue || !formData.dateFrom || !formData.dateTo) {
        setError('заполните جميع الحقول المطلوبة')
        return
      }
      if (new Date(formData.dateFrom) > new Date(formData.dateTo)) {
        setError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية')
        return
      }
    }
    setError('')
    if (step < 4) setStep(step + 1)
  }

  const handlePrev = () => {
    setError('')
    if (step > 1) setStep(step - 1)
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSubmit = async () => {
    setError('')
    setLoading(true)

    try {
      // Check access requirements (BUSINESS_RULES_MATRIX #23-26)
      if (!canPerform(role, 'canAddReport')) {
        throw new Error('لا توجد صلاحية لإرسال التقارير')
      }

      if (!systemStatus.subscriptionActive) {
        throw new Error('انتهى اشتراكك — جدّد الاشتراك لمتابعة المساهمة')
      }

      if (!systemStatus.accountActive) {
        throw new Error('حسابك معلق — تواصل مع الدعم')
      }

      if (systemStatus.creditsBalance <= 0) {
        throw new Error('لا توجد Credits متاحة — كل تقرير يستهلك نقطة واحدة')
      }

      if (!selectedCompany) {
        throw new Error('لم يتم اختيار شركة')
      }

      const reportPayload = {
        targetCompanyId: selectedCompany.id,
        title: formData.title || 'تقرير',
        description: formData.description || formData.notes,
        transactionValue: parseInt(formData.transactionValue) || 0,
        delayDays: parseInt(formData.delayDays) || 0,
        dateFrom: formData.dateFrom,
        dateTo: formData.dateTo,
        paymentStatus: formData.paymentStatus,
        dueAmounts: formData.dueAmounts === 'yes',
        notes: formData.notes
      }

      await submitReport(reportPayload)
      setSubmitted(true)
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء إرسال التقرير')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '28px 32px' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '40px', textAlign: 'center' }}>
          <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', color: '#16A34A' }}>
            <CheckIcon />
          </div>
          <h2 style={{ fontSize: '23px', fontWeight: 900, color: '#0F172A', margin: '0 0 10px' }}>تم إرسال التقرير بنجاح</h2>
          <p style={{ fontSize: '15px', color: '#64748B', lineHeight: 1.75, margin: '0 0 24px' }}>سيتم مراجعة تقريرك من قبل فريق مرصد للتحقق من صحته. بعد الموافقة سيُساهم في بناء مؤشر الثقة للشركة.</p>

          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '12px 20px', marginBottom: '26px', display: 'inline-block' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#15803D' }}>شكراً على مساهمتك! ✨</div>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={() => { setSubmitted(false); setStep(1); setSelectedCompany(null); }} style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 24px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>إضافة تقرير آخر</button>
            <button onClick={() => navigate('/dashboard')} style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 24px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>لوحة التحكم</button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '28px 32px' }}>
      <div style={{ maxWidth: '820px', margin: '0 auto' }}>
        {/* Stepper */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '28px' }}>
          {steps.map((s, idx) => (
            <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: s.active ? (step > s.num ? '#16A34A' : s.num === step ? '#1E2A52' : '#E2E8F0') : '#E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                fontWeight: 800,
                color: s.active ? '#fff' : '#94A3B8'
              }}>
                {step > s.num ? (
                  <CheckIcon />
                ) : (
                  s.num
                )}
              </div>
              <span style={{ fontSize: '14px', fontWeight: s.num === step ? 700 : 600, color: s.active ? '#0F172A' : '#94A3B8' }}>{s.label}</span>
              {idx < steps.length - 1 && (
                <div style={{ flex: 1, height: '2px', background: s.active ? '#16A34A' : '#E2E8F0', margin: '0 10px', minWidth: '16px' }}></div>
              )}
            </div>
          ))}
        </div>

        {/* Form Card */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '32px' }}>
          {error && (
            <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', padding: '12px 14px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>
              ⚠️ {error}
            </div>
          )}

          {/* Step 1: اختيار الشركة */}
          {step === 1 && (
            <>
              <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px 0', textAlign: 'right' }}>اختيار الشركة المُبلَّغ عنها</h2>
              <p style={{ fontSize: '14.5px', color: '#64748B', margin: '0 0 22px 0', textAlign: 'right' }}>ابحث عن الشركة التي تعاملت معها</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '11px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '0 16px', marginBottom: '16px', position: 'relative' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="اسم الشركة أو رقم السجل التجاري"
                  style={{ flex: 1, border: 0, background: 'transparent', padding: '14px 0', fontSize: '15px', outline: 'none', fontFamily: 'inherit', textAlign: 'right' }}
                />
                {companies.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', marginTop: '4px', maxHeight: '300px', overflowY: 'auto', zIndex: 10 }}>
                    {companies.map(c => (
                      <div
                        key={c.id}
                        onClick={() => handleSelectCompany(c)}
                        style={{ padding: '12px 16px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', textAlign: 'right' }}
                        onMouseEnter={(e) => e.target.style.background = '#F8FAFC'}
                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                      >
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{c.name}</div>
                        <div style={{ fontSize: '12px', color: '#94A3B8' }}>السجل: {c.cr_number} · {c.city}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedCompany && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1.5px solid #16A34A', background: '#F0FDF4', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#1E2A52', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '14px' }}>
                      {selectedCompany.name.charAt(0)}
                    </div>
                    <div style={{ textAlign: 'right', flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedCompany.name}</div>
                      <div style={{ fontSize: '13px', color: '#64748B' }}>السجل: {selectedCompany.cr_number} · {selectedCompany.city}</div>
                    </div>
                  </div>
                  <span style={{ color: '#16A34A', fontWeight: 900, fontSize: '18px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <CheckIcon />
                  </span>
                </div>
              )}
            </>
          )}

          {/* Step 2: تفاصيل التعامل */}
          {step === 2 && (
            <>
              <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 22px 0', textAlign: 'right' }}>تفاصيل التعامل</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>قيمة التعامل (ر.س) *</label>
                  <input
                    type="number"
                    value={formData.transactionValue}
                    onChange={(e) => handleChange('transactionValue', e.target.value)}
                    placeholder="120000"
                    style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>متوسط التأخير (أيام)</label>
                  <input
                    type="number"
                    value={formData.delayDays}
                    onChange={(e) => handleChange('delayDays', e.target.value)}
                    placeholder="4"
                    style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>من تاريخ *</label>
                  <input
                    type="date"
                    value={formData.dateFrom}
                    onChange={(e) => handleChange('dateFrom', e.target.value)}
                    style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>إلى تاريخ *</label>
                  <input
                    type="date"
                    value={formData.dateTo}
                    onChange={(e) => handleChange('dateTo', e.target.value)}
                    style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>حالة السداد</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['paid', 'partial', 'unpaid'].map(status => (
                      <button
                        key={status}
                        onClick={() => handleChange('paymentStatus', status)}
                        style={{
                          flex: 1,
                          textAlign: 'center',
                          background: formData.paymentStatus === status ? '#16A34A' : '#F1F5F9',
                          color: formData.paymentStatus === status ? '#fff' : '#64748B',
                          borderRadius: '9px',
                          padding: '11px',
                          fontSize: '14px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          border: 0
                        }}
                      >
                        {status === 'paid' ? 'تم' : status === 'partial' ? 'جزئي' : 'لم يتم'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>مبالغ مستحقة؟</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['no', 'yes'].map(val => (
                      <button
                        key={val}
                        onClick={() => handleChange('dueAmounts', val)}
                        style={{
                          flex: 1,
                          textAlign: 'center',
                          background: formData.dueAmounts === val ? '#1E2A52' : '#F1F5F9',
                          color: formData.dueAmounts === val ? '#fff' : '#64748B',
                          borderRadius: '9px',
                          padding: '11px',
                          fontSize: '14px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          border: 0
                        }}
                      >
                        {val === 'no' ? 'لا' : 'نعم'}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ gridColumn: '1 / 3' }}>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>ملاحظات إضافية</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    placeholder="تفاصيل عن التعامل..."
                    style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', minHeight: '90px', resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>
              </div>
            </>
          )}

          {/* Step 3: المستندات الداعمة */}
          {step === 3 && (
            <>
              <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px' }}>المستندات الداعمة</h2>
              <p style={{ fontSize: '14.5px', color: '#64748B', margin: '0 0 22px' }}>ارفق الفواتير أو العقود لتسريع المراجعة (اختياري)</p>
              <div style={{ border: '2px dashed #CBD5E1', borderRadius: '16px', padding: '46px', textAlign: 'center', background: '#F8FAFC', marginBottom: '20px' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px', color: '#94A3B8', display: 'flex', justifyContent: 'center' }}>
                  <UploadIcon />
                </div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>اسحب الملفات هنا أو اضغط للرفع</div>
                <div style={{ fontSize: '13px', color: '#94A3B8' }}>PDF، JPG، PNG حتى 10MB</div>
              </div>
            </>
          )}

          {/* Step 4: مراجعة وإرسال */}
          {step === 4 && (
            <>
              <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 22px 0', textAlign: 'right' }}>مراجعة وإرسال</h2>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '22px', marginBottom: '18px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 700, marginBottom: '3px' }}>الشركة</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{selectedCompany?.name}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 700, marginBottom: '3px' }}>قيمة التعامل</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{formData.transactionValue} ر.س</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 700, marginBottom: '3px' }}>حالة السداد</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#16A34A' }}>
                      {formData.paymentStatus === 'paid' ? 'تم السداد' : formData.paymentStatus === 'partial' ? 'سداد جزئي' : 'لم يتم السداد'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 700, marginBottom: '3px' }}>متوسط التأخير</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{formData.delayDays || '—'} أيام</div>
                  </div>
                </div>
              </div>
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '15px 18px', display: 'flex', gap: '11px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '18px', flexShrink: 0 }}>ℹ</span>
                <span style={{ fontSize: '14px', color: '#92400E', fontWeight: 700, lineHeight: 1.6 }}>سيتم إرسال التقرير لإدارة المنصة للمراجعة قبل اعتماده. لن يظهر التقرير علناً، وستظهر مؤشراته بشكل مجمّع وسرّي.</span>
              </div>
            </>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '28px', paddingTop: '22px', borderTop: '1px solid #F1F5F9' }}>
            <button
              onClick={handlePrev}
              style={{
                background: '#fff',
                color: '#64748B',
                border: '1.5px solid #E2E8F0',
                borderRadius: '10px',
                padding: '12px 26px',
                fontSize: '14.5px',
                fontWeight: 800,
                cursor: 'pointer',
                opacity: step === 1 ? 0.5 : 1,
                pointerEvents: step === 1 ? 'none' : 'auto'
              }}
            >
              السابق
            </button>
            <button
              onClick={step === 4 ? handleSubmit : handleNext}
              disabled={loading || (step === 4 && !canSubmitReport)}
              title={
                step === 4 && !canSubmitReport
                  ? !canPerform(role, 'canAddReport')
                    ? 'لا توجد صلاحية'
                    : !systemStatus.subscriptionActive
                      ? 'انتهى الاشتراك'
                      : !systemStatus.accountActive
                        ? 'الحساب معلق'
                        : 'لا توجد Credits'
                  : ''
              }
              style={{
                background:
                  loading || (step === 4 && !canSubmitReport)
                    ? '#D1D5DB'
                    : '#16A34A',
                color: '#fff',
                border: 0,
                borderRadius: '10px',
                padding: '12px 32px',
                fontSize: '14.5px',
                fontWeight: 800,
                cursor:
                  loading || (step === 4 && !canSubmitReport)
                    ? 'not-allowed'
                    : 'pointer',
                opacity:
                  loading || (step === 4 && !canSubmitReport)
                    ? 0.6
                    : 1,
              }}
            >
              {loading
                ? 'جاري الإرسال...'
                : step === 4
                  ? 'إرسال التقرير'
                  : 'التالي'}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
