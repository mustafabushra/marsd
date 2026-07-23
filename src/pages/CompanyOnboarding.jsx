import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { getSupabase, smartCompanyDetection, ensureStorageBucket } from '../lib/api'
import { COMPANY_STATUS } from '../lib/constants'

const SAUDI_CITIES = [
  'الرياض', 'جدة', 'مكة المكرمة', 'المدينة المنورة', 'الدمام',
  'الخبر', 'الظهران', 'القصيم', 'عسير', 'أبها', 'تبوك', 'حائل',
  'جيزان', 'نجران', 'الباحة', 'الحدود الشمالية', 'الأحساء', 'ينبع', 'الدوادمي', 'شقراء'
]

const SECTORS = [
  'البناء والمقاولات', 'النقل واللوجستيات', 'التجارة والبيع بالتجزئة',
  'الصناعة والتصنيع', 'الخدمات المالية', 'السياحة والضيافة',
  'التكنولوجيا والاتصالات', 'الطاقة والنفط والغاز', 'الرعاية الصحية',
  'التعليم', 'العقارات', 'الزراعة والثروة السمكية', 'الإعلام والنشر',
  'الخدمات الاستشارية', 'الاستيراد والتصدير', 'الكهرباء والمياه',
  'الاتصالات', 'الترفيه والثقافة', 'الخدمات الحكومية', 'أخرى'
]

export default function CompanyOnboarding() {
  const navigate = useNavigate()
  const { user } = useUser()
  const [step, setStep] = useState(1) // Step 1: Basic Info | Step 2: Document | Step 3: Confirm
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    crNumber: '',
    unifiedNumber: '',
    licenseNumber: '',
    officialEmail: '',
    sector: '',
    city: '',
    foundedYear: new Date().getFullYear(),
    phone: '',
  })

  const [crFile, setCrFile] = useState(null)
  const [existingCompany, setExistingCompany] = useState(null)

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowedTypes.includes(file.type)) {
      setError('❌ نوع الملف غير مدعوم. استخدم PDF أو صورة فقط')
      return
    }

    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      setError(`❌ حجم الملف كبير جداً. الحد الأقصى 5MB`)
      return
    }

    setCrFile(file)
    setError('')
  }

  // Step 1: Collect basic info and search for existing company
  const handleStepOne = async () => {
    setError('')

    if (!formData.name?.trim()) {
      setError('❌ اسم الشركة مطلوب')
      return
    }
    if (formData.name.trim().length < 3) {
      setError('❌ اسم الشركة يجب أن يكون 3 أحرف على الأقل')
      return
    }

    if (!formData.crNumber?.trim()) {
      setError('❌ رقم السجل التجاري مطلوب')
      return
    }

    if (!formData.sector?.trim()) {
      setError('❌ القطاع مطلوب')
      return
    }

    if (!formData.city?.trim()) {
      setError('❌ المدينة مطلوبة')
      return
    }

    setLoading(true)

    try {
      // SMART COMPANY DETECTION
      const detected = await smartCompanyDetection({
        crNumber: formData.crNumber,
        unifiedNumber: formData.unifiedNumber,
        licenseNumber: formData.licenseNumber,
        officialEmail: formData.officialEmail,
        companyName: formData.name
      })

      if (detected?.company) {
        // CASE B: Company exists — show summary and go to step 2
        setExistingCompany(detected.company)
        setError('') // Clear any error
        setStep(2)
      } else {
        // CASE A: New company — go to step 2 for document
        setExistingCompany(null)
        setStep(2)
      }
    } catch (err) {
      setError('❌ حدث خطأ: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Upload document and final confirmation
  const handleSubmit = async () => {
    setError('')

    if (!crFile) {
      setError('❌ رفع السجل التجاري مطلوب')
      return
    }

    setLoading(true)

    try {
      let crFileUrl = null
      const supabase = getSupabase()

      // Try uploading to Storage
      try {
        await ensureStorageBucket('company-documents')
        const fileName = `cr_${Date.now()}_${crFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('company-documents')
          .upload(`cr-files/${fileName}`, crFile)

        if (!uploadError && uploadData?.path) {
          crFileUrl = uploadData.path
        }
      } catch (storageError) {
        console.warn('⚠️ Storage fallback:', storageError)
      }

      // Fallback: base64
      if (!crFileUrl) {
        const reader = new FileReader()
        crFileUrl = await new Promise((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result
            if (typeof result === 'string' && result.length > 13 * 1024 * 1024) {
              reject(new Error('❌ الملف كبير جداً حتى بعد التحويل'))
            } else {
              resolve(result)
            }
          }
          reader.onerror = () => reject(new Error('❌ فشل قراءة الملف'))
          reader.readAsDataURL(crFile)
        })
      }

      // NOW: Handle CASE A (new) vs CASE B (existing)
      if (existingCompany) {
        // CASE B: Company exists — create claim request
        const { data: claimRequest, error: claimError } = await supabase
          .from('claim_requests')
          .insert([{
            company_id: existingCompany.id,
            user_id: user.id,
            supporting_documents: { crFile: crFileUrl },
            status: 'pending'
          }])
          .select()
          .single()

        if (claimError) throw claimError

        // Create user record
        await supabase
          .from('users')
          .upsert([{
            id: user.id,
            email: formData.officialEmail || user.primaryEmailAddress?.emailAddress,
            first_name: user.firstName || '',
            last_name: user.lastName || '',
            role: 'company_member',
            status: 'active'
          }], { onConflict: 'id' })

        // Notify admin
        await supabase
          .from('notifications')
          .insert([{
            type: 'claim_request_submitted',
            payload: JSON.stringify({
              company_id: existingCompany.id,
              company_name: existingCompany.name,
              user_email: formData.officialEmail
            })
          }])
          .catch(err => console.warn('Notification warning:', err))

        alert('✅ طلب الملكية تم إرساله!\n\n🔍 فريق مرصد سيقوم بمراجعة طلبك.')
        navigate('/company-claim-pending', { replace: true })
      } else {
        // CASE A: New company — create full registration
        const { data: newCompany, error: companyError } = await supabase
          .from('companies')
          .insert([{
            name: formData.name,
            cr_number: formData.crNumber,
            unified_number: formData.unifiedNumber || null,
            license_number: formData.licenseNumber || null,
            official_email: formData.officialEmail || null,
            sector: formData.sector,
            city: formData.city,
            founded_year: formData.foundedYear,
            status: COMPANY_STATUS.PENDING,
            cr_file_url: crFileUrl,
            source: 'community'
          }])
          .select('id')
          .single()

        if (companyError) throw new Error('فشل إنشاء الشركة: ' + companyError.message)

        // Create tenant
        const { data: tenantData, error: tenantError } = await supabase
          .from('tenants')
          .insert([{
            name: formData.name,
            cr_number: formData.crNumber,
            email: formData.officialEmail || user.primaryEmailAddress?.emailAddress,
            phone: formData.phone || null,
            sector: formData.sector,
            city: formData.city,
            company_id: newCompany.id,
            status: 'active'
          }])
          .select('id')
          .single()

        if (tenantError) throw new Error('فشل إنشاء حساب الشركة: ' + tenantError.message)

        // Create user record
        await supabase
          .from('users')
          .insert([{
            id: user.id,
            tenant_id: tenantData.id,
            company_id: newCompany.id,
            email: user.primaryEmailAddress?.emailAddress,
            first_name: user.firstName || '',
            last_name: user.lastName || '',
            role: 'company_admin',
            status: 'active'
          }])

        // Create registration request
        await supabase
          .from('registration_requests')
          .insert([{
            company_id: newCompany.id,
            tenant_id: tenantData.id,
            user_id: user.id,
            cr_document_url: crFileUrl,
            status: 'pending'
          }])

        // Notify admin
        await supabase
          .from('notifications')
          .insert([{
            type: 'company_registration_submitted',
            payload: JSON.stringify({
              company_id: newCompany.id,
              company_name: formData.name,
              cr_number: formData.crNumber
            })
          }])
          .catch(err => console.warn('Notification warning:', err))

        alert('✅ تم رفع بيانات شركتك بنجاح!\n\n⏳ سيتم مراجعة التسجيل من قبل فريق مرصد')
        navigate('/registration-pending', { replace: true })
      }
    } catch (err) {
      setError(err.message || '❌ حدث خطأ غير متوقع')
      console.error('Onboarding error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '50px 28px',
      minHeight: '100vh',
      background: '#F8FAFC'
    }}>
      <div style={{ width: '100%', maxWidth: '500px' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <h1 style={{
            fontSize: '28px',
            fontWeight: 900,
            color: '#0F172A',
            margin: '0 0 8px 0'
          }}>
            {step === 1 ? 'بيانات الشركة' : 'تأكيد البيانات'}
          </h1>
          <p style={{ fontSize: '15px', color: '#64748B', margin: 0 }}>
            {step === 1 ? 'الخطوة 1 من 2' : 'الخطوة 2 من 2'}
          </p>
        </div>

        {error && (
          <div style={{
            background: '#FEE2E2',
            color: '#991B1B',
            padding: '12px 14px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        {/* Step 1 */}
        {step === 1 && (
          <form style={{
            background: '#fff',
            padding: '32px',
            borderRadius: '16px',
            border: '1px solid #E2E8F0'
          }} onSubmit={(e) => { e.preventDefault(); handleStepOne() }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  اسم الشركة *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="مثال: شركة نجد"
                  style={{
                    width: '100%',
                    border: '1.5px solid #E2E8F0',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  رقم السجل التجاري *
                </label>
                <input
                  type="text"
                  value={formData.crNumber}
                  onChange={(e) => handleChange('crNumber', e.target.value)}
                  placeholder="1234567890"
                  style={{
                    width: '100%',
                    border: '1.5px solid #E2E8F0',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  القطاع *
                </label>
                <select
                  value={formData.sector}
                  onChange={(e) => handleChange('sector', e.target.value)}
                  style={{
                    width: '100%',
                    border: '1.5px solid #E2E8F0',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="">اختر القطاع</option>
                  {SECTORS.map(sector => (
                    <option key={sector} value={sector}>{sector}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  المدينة *
                </label>
                <select
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  style={{
                    width: '100%',
                    border: '1.5px solid #E2E8F0',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="">اختر المدينة</option>
                  {SAUDI_CITIES.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? '#CCCCCC' : '#16A34A',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                padding: '12px',
                fontSize: '15px',
                fontWeight: 800,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'جاري البحث...' : 'التالي'}
            </button>
          </form>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <form style={{
            background: '#fff',
            padding: '32px',
            borderRadius: '16px',
            border: '1px solid #E2E8F0'
          }} onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
            {existingCompany && (
              <div style={{
                background: '#ECFDF5',
                border: '1px solid #D1FAE5',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '24px'
              }}>
                <div style={{ fontSize: '14px', color: '#047857', fontWeight: 600, marginBottom: '8px' }}>
                  ℹ️ وجدنا شركتك
                </div>
                <div style={{ fontSize: '13px', color: '#065F46' }}>
                  {existingCompany.name}
                  <br />
                  رقم السجل: {existingCompany.cr_number}
                </div>
              </div>
            )}

            <label style={{
              fontSize: '14px',
              fontWeight: 700,
              color: '#334155',
              display: 'block',
              marginBottom: '8px'
            }}>
              رفع السجل التجاري *
            </label>
            <div style={{
              border: '2px dashed #E2E8F0',
              borderRadius: '12px',
              padding: '24px',
              textAlign: 'center',
              cursor: 'pointer',
              background: crFile ? '#F0FDF4' : '#F8FAFC',
              marginBottom: '24px'
            }}>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                id="cr-file-input"
              />
              {crFile ? (
                <div>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>✅</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#15803D', marginBottom: '6px' }}>
                    {crFile.name}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCrFile(null)}
                    style={{
                      marginTop: '10px',
                      background: '#FEE2E2',
                      color: '#DC2626',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    حذف الملف
                  </button>
                </div>
              ) : (
                <label htmlFor="cr-file-input" style={{ cursor: 'pointer', display: 'block' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>
                    اضغط أو اسحب الملف
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                    PDF أو صورة — الحد الأقصى 5MB
                  </div>
                </label>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                type="button"
                onClick={() => { setStep(1); setExistingCompany(null); setCrFile(null) }}
                style={{
                  background: '#F1F5F9',
                  color: '#0F172A',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                السابق
              </button>
              <button
                type="submit"
                disabled={loading || !crFile}
                style={{
                  background: loading || !crFile ? '#CCCCCC' : '#16A34A',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: loading || !crFile ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'جاري الحفظ...' : 'إرسال'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
