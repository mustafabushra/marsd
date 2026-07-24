import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { getSupabase, buildCompanyInsert } from '../lib/api'
import { CheckIcon, EyeIcon, TrendingUpIcon, UploadIcon } from '../components/icons'

export default function AddCompany() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useUser()
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    companyName: location.state?.companyName || '',
    registryNumber: location.state?.registryNumber || '',
    unifiedNumber: '',
    sector: '',
    city: ''
  })

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async () => {
    setError('')
    if (!formData.companyName.trim()) {
      setError('اسم الشركة مطلوب')
      return
    }
    setSubmitting(true)
    try {
      const supabase = getSupabase()

      // Avoid obvious duplicates by name
      const { data: existing } = await supabase
        .from('companies')
        .select('id')
        .ilike('name', formData.companyName.trim())
        .limit(1)
      if (existing?.length) {
        setError('⚠️ توجد شركة بهذا الاسم في سجلات مرصد بالفعل')
        setSubmitting(false)
        return
      }

      // companies.cr_number is NOT NULL — generate a placeholder if none provided
      const crNumber = formData.registryNumber.trim() || `CR${Date.now().toString().slice(-8)}`

      const insert = buildCompanyInsert({
        name: formData.companyName,
        crNumber,
        unifiedNumber: formData.unifiedNumber,
        sector: formData.sector || null,
        city: formData.city || null,
        approved: false,      // pending admin review
        source: 'community',
      })

      const { data: company, error: insertError } = await supabase
        .from('companies')
        .insert([insert])
        .select()
        .single()
      if (insertError) throw insertError

      // Best-effort audit log (tenant lookup via Clerk user id)
      if (user?.id) {
        const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
        await supabase.from('audit_logs').insert([{
          tenant_id: userData?.tenant_id || null,
          actor_id: user.id,
          action: 'company_add_requested',
          entity: 'company',
          entity_id: company.id,
          meta: JSON.stringify({ name: formData.companyName }),
          created_at: new Date().toISOString(),
        }]).catch(err => console.warn('Audit log warning:', err))
      }

      setSubmitted(true)
    } catch (err) {
      console.error('Add company request failed:', err)
      setError(err.message || 'فشل إرسال الطلب')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
        {!submitted ? (
          <>
            <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '14px', padding: '16px 20px', marginBottom: '18px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <span style={{ fontSize: '20px' }}>🏢</span>
              <div>
                <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#3730A3' }}>أضِف شركة غير موجودة في سجلات مرصد</div>
                <div style={{ fontSize: '13px', color: '#4338CA', marginTop: '2px', lineHeight: 1.6 }}>يُراجع طلبك من إدارة مرصد للتحقق من السجل التجاري، وبعد الموافقة تُضاف الشركة لسجلات مرصد وتصبح متاحة للجميع.</div>
              </div>
            </div>

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '14px 18px', marginBottom: '18px', fontSize: '14px', color: '#B91C1C', fontWeight: 700 }}>
                {error}
              </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '32px' }}>
              <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px 0', textAlign: 'right' }}>بيانات الشركة</h2>
              <p style={{ fontSize: '14.5px', color: '#64748B', margin: '0 0 24px 0', textAlign: 'right' }}>كل ما كانت البيانات أدق، أسرعت الموافقة</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
                <div style={{ gridColumn: '1/3' }}>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>اسم الشركة</label>
                  <input
                    placeholder="مثال: شركة الرياض للتجارة المحدودة"
                    name="companyName"
                    value={formData.companyName}
                    onChange={handleChange}
                    style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>رقم السجل التجاري</label>
                  <input
                    placeholder="1010XXXXXX"
                    name="registryNumber"
                    value={formData.registryNumber}
                    onChange={handleChange}
                    style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>الرقم الموحّد (700)</label>
                  <input
                    placeholder="7001234567"
                    name="unifiedNumber"
                    value={formData.unifiedNumber}
                    onChange={handleChange}
                    style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>القطاع</label>
                  <input
                    placeholder="تجارة"
                    name="sector"
                    value={formData.sector}
                    onChange={handleChange}
                    style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>المدينة</label>
                  <input
                    placeholder="الرياض"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit' }}
                  />
                </div>
                <div style={{ gridColumn: '1/3' }}>
                  <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>مستند داعم (السجل التجاري) — اختياري</label>
                  <div style={{ border: '2px dashed #CBD5E1', borderRadius: '12px', padding: '22px', textAlign: 'center', background: '#F8FAFC', color: '#94A3B8', fontSize: '13.5px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <UploadIcon />
                    اسحب صورة السجل التجاري أو اضغط للرفع
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '11px', marginTop: '26px', paddingTop: '20px', borderTop: '1px solid #F1F5F9' }}>
                <button onClick={handleSubmit} disabled={submitting} style={{ background: submitting ? '#94A3B8' : '#16A34A', color: '#fff', border: 0, borderRadius: '11px', padding: '13px 30px', fontSize: '15px', fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{submitting ? 'جاري الإرسال...' : 'إرسال طلب الإضافة'}</button>
                <button onClick={() => navigate('/search')} disabled={submitting} style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '11px', padding: '13px 28px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '18px', padding: '40px', textAlign: 'center' }}>
            <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', color: '#16A34A' }}>
              <CheckIcon />
            </div>
            <h2 style={{ fontSize: '23px', fontWeight: 900, color: '#0F172A', margin: '0 0 10px' }}>تم إرسال طلب إضافة الشركة</h2>
            <p style={{ fontSize: '15px', color: '#64748B', lineHeight: 1.75, margin: '0 auto 22px', maxWidth: '480px' }}>سيراجع فريق مرصد السجل التجاري للتحقق منه. بمجرد الموافقة تُضاف الشركة لقاعدة البيانات وتصبح متاحة للبحث والتقييم من جميع الأعضاء.</p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '12px 20px', marginBottom: '26px', color: '#15803D' }}>
              <TrendingUpIcon />
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#15803D' }}>زاد نشاطك كمساهم إلى 78% — 89 مساهمة</span>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: '14px', padding: '22px', maxWidth: '520px', margin: '0 auto 22px' }}>
              <div style={{ fontSize: '15.5px', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>هل تعاملت مع هذه الشركة؟ قيّمها الآن</div>
              <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.7, margin: '0 0 16px' }}>أضِف تقييمك من واقع تعاملك لتساهم في بناء مؤشر ثقتها — وتزيد نشاطك كمساهم.</p>
              <button onClick={() => navigate('/add-report')} style={{ background: '#1E2A52', color: '#fff', border: 0, borderRadius: '11px', padding: '13px 32px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', fontFamily: 'inherit' }}>
                <EyeIcon />
                تقييم الشركة الآن
              </button>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={() => navigate('/search')} style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 24px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>العودة للبحث</button>
              <button onClick={() => navigate('/dashboard')} style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 24px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>لوحة التحكم</button>
            </div>
          </div>
        )}
    </div>
  )
}
