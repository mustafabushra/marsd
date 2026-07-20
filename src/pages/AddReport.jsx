import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckIcon, FileIcon, UploadIcon } from '../components/icons'

export default function AddReport() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [submitted, setSubmitted] = useState(false)

  const [formData, setFormData] = useState({
    company: 'مؤسسة الخليج للتجارة',
    value: '120,000',
    delay: '4',
    dateFrom: '2026-03-01',
    dateTo: '2026-05-30',
    paymentStatus: 'نعم',
    dueAmounts: 'لا',
    notes: ''
  })

  const steps = [
    { num: 1, label: 'اختيار الشركة', active: step >= 1 },
    { num: 2, label: 'تفاصيل التعامل', active: step >= 2 },
    { num: 3, label: 'المستندات الداعمة', active: step >= 3 },
    { num: 4, label: 'مراجعة وإرسال', active: step >= 4 }
  ]

  const handleNext = () => {
    if (step < 4) setStep(step + 1)
  }

  const handlePrev = () => {
    if (step > 1) setStep(step - 1)
  }

  const handleSubmit = () => {
    setSubmitted(true)
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
            <button onClick={() => setSubmitted(false)} style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 24px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>إضافة تقرير آخر</button>
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
          {/* Step 1: اختيار الشركة */}
          {step === 1 && (
            <>
              <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px 0', textAlign: 'right' }}>اختيار الشركة المُبلَّغ عنها</h2>
              <p style={{ fontSize: '14.5px', color: '#64748B', margin: '0 0 22px 0', textAlign: 'right' }}>ابحث عن الشركة التي تعاملت معها</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '11px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '0 16px', marginBottom: '16px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
                <input placeholder="اسم الشركة أو رقم السجل التجاري" style={{ flex: 1, border: 0, background: 'transparent', padding: '14px 0', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1.5px solid #16A34A', background: '#F0FDF4', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#1E2A52', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>خ</div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>مؤسسة الخليج للتجارة</div>
                    <div style={{ fontSize: '13px', color: '#64748B' }}>السجل: 2050987654 · الدمام</div>
                  </div>
                </div>
                <span style={{ color: '#16A34A', fontWeight: 900, fontSize: '18px', display: 'flex', alignItems: 'center' }}>
                  <CheckIcon />
                </span>
              </div>
            </>
          )}

          {/* Step 2: تفاصيل التعامل */}
          {step === 2 && (
            <>
              <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 22px 0', textAlign: 'right' }}>تفاصيل التعامل</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>قيمة التعامل (ر.س)</label>
                  <input placeholder="120,000" style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>متوسط التأخير (أيام)</label>
                  <input placeholder="4" style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>من تاريخ</label>
                  <input placeholder="2026-03-01" style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>إلى تاريخ</label>
                  <input placeholder="2026-05-30" style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }} />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>هل تم السداد؟</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ flex: 1, textAlign: 'center', background: '#16A34A', color: '#fff', borderRadius: '9px', padding: '11px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>نعم</span>
                    <span style={{ flex: 1, textAlign: 'center', background: '#F1F5F9', color: '#64748B', borderRadius: '9px', padding: '11px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>جزئي</span>
                    <span style={{ flex: 1, textAlign: 'center', background: '#F1F5F9', color: '#64748B', borderRadius: '9px', padding: '11px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>لا</span>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>مبالغ مستحقة؟</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ flex: 1, textAlign: 'center', background: '#F1F5F9', color: '#64748B', borderRadius: '9px', padding: '11px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>نعم</span>
                    <span style={{ flex: 1, textAlign: 'center', background: '#1E2A52', color: '#fff', borderRadius: '9px', padding: '11px', fontSize: '14px', fontWeight: 800, cursor: 'pointer' }}>لا</span>
                  </div>
                </div>
                <div style={{ gridColumn: '1 / 3' }}>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>ملاحظات إضافية</label>
                  <textarea placeholder="تفاصيل عن التعامل..." style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', minHeight: '90px', resize: 'vertical', fontFamily: 'inherit' }}></textarea>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '11px', padding: '13px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
                  <span style={{ color: '#94A3B8', display: 'flex', alignItems: 'center' }}>
                    <FileIcon />
                  </span>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155' }}>عقد_التوريد_2026.pdf</div>
                    <div style={{ fontSize: '12.5px', color: '#94A3B8' }}>2.4 MB</div>
                  </div>
                </div>
                <span style={{ color: '#16A34A', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  تم الرفع
                  <CheckIcon />
                </span>
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
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>مؤسسة الخليج للتجارة</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 700, marginBottom: '3px' }}>قيمة التعامل</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>120,000 ر.س</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 700, marginBottom: '3px' }}>حالة السداد</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#16A34A' }}>تم السداد</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 700, marginBottom: '3px' }}>متوسط التأخير</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>4 أيام</div>
                  </div>
                </div>
              </div>
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '15px 18px', display: 'flex', gap: '11px', alignItems: 'center' }}>
                <span style={{ fontSize: '18px' }}>ℹ</span>
                <span style={{ fontSize: '14px', color: '#92400E', fontWeight: 700, lineHeight: 1.6 }}>سيتم إرسال التقرير لإدارة المنصة للمراجعة قبل اعتماده. لن يظهر التقرير علناً، وستظهر مؤشراته بشكل مجمّع وسرّي.</span>
              </div>
            </>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '28px', paddingTop: '22px', borderTop: '1px solid #F1F5F9' }}>
            <button onClick={handlePrev} style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 26px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer', opacity: step === 1 ? 0.5 : 1, pointerEvents: step === 1 ? 'none' : 'auto' }}>السابق</button>
            {step === 4 ? (
              <button onClick={handleSubmit} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '12px 34px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer' }}>إرسال التقرير</button>
            ) : (
              <button onClick={handleNext} style={{ background: '#1E2A52', color: '#fff', border: 0, borderRadius: '10px', padding: '12px 34px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer' }}>التالي</button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
