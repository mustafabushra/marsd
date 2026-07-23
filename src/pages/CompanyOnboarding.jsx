import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { getSupabase, smartCompanyDetection, ensureStorageBucket, buildCompanyInsert } from '../lib/api'
import { COMPANY_STATUS, COMPANY_SOURCE, REQUEST_STATUS, USER_ROLE, USER_STATUS, TENANT_STATUS } from '../lib/enums'

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

  // ============================================================================
  // PROFILING HELPER: تتبع أوقات تنفيذ العمليات
  // ============================================================================
  const createTimer = () => {
    const start = Date.now()
    return {
      log: (stepName) => {
        const duration = Date.now() - start
        console.log(`⏱️  ${stepName}: ${duration}ms`)
        return duration
      }
    }
  }

  // Step 2: Upload document and final confirmation
  const handleSubmit = async () => {
    setError('')
    const mainTimer = createTimer()

    if (!crFile) {
      setError('❌ رفع السجل التجاري مطلوب')
      return
    }

    setLoading(true)
    let cleanupRequired = false
    let createdCompanyId = null
    let createdTenantId = null

    try {
      const supabase = getSupabase()
      let crFileUrl = null

      // ===== STEP 1: Upload Document =====
      console.log('📄 [1/6] Starting document upload...')
      const uploadTimer = createTimer()

      try {
        await ensureStorageBucket('company-documents')
        const fileName = `cr_${Date.now()}_${crFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('company-documents')
          .upload(`cr-files/${fileName}`, crFile)

        if (uploadError) {
          console.warn('⚠️ Storage upload failed:', uploadError.message)
          throw new Error(`فشل رفع الملف إلى التخزين: ${uploadError.message}`)
        }

        if (!uploadData?.path) {
          console.warn('⚠️ No path returned from upload')
          throw new Error('لم يتم الحصول على رابط الملف')
        }

        crFileUrl = uploadData.path
        uploadTimer.log('Document storage upload')
        console.log(`✅ Document uploaded to: ${crFileUrl}`)
      } catch (storageError) {
        console.warn('⚠️ Storage fallback due to:', storageError.message)

        // Fallback: base64 encoding
        try {
          console.log('📦 Falling back to base64 encoding...')
          const reader = new FileReader()
          crFileUrl = await new Promise((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result
              if (typeof result === 'string' && result.length > 13 * 1024 * 1024) {
                reject(new Error('الملف كبير جداً حتى بعد التحويل (>13MB)'))
              } else {
                resolve(result)
              }
            }
            reader.onerror = () => reject(new Error('فشل قراءة الملف من الجهاز'))
            reader.readAsDataURL(crFile)
          })
          uploadTimer.log('Base64 encoding')
          console.log(`✅ Base64 fallback successful (${crFileUrl.length} bytes)`)
        } catch (base64Error) {
          throw new Error(`❌ فشل حفظ الملف: ${base64Error.message}`)
        }
      }

      // ===== NOW: Handle CASE A (new) vs CASE B (existing) =====
      if (existingCompany) {
        // ============================================================
        // CASE B: Company exists — Simpler flow, less rollback risk
        // ============================================================

        // ===== STEP 2: Create Claim Request =====
        console.log('📋 [2/5] Creating claim request...')
        const claimTimer = createTimer()

        const { data: claimRequest, error: claimError } = await supabase
          .from('claim_requests')
          .insert([{
            company_id: existingCompany.id,
            user_id: user.id,
            supporting_documents: { crFile: crFileUrl },
            status: REQUEST_STATUS.PENDING
          }])
          .select('id')
          .single()

        if (claimError) {
          throw new Error(`فشل إنشاء طلب الملكية: ${claimError.message}`)
        }
        if (!claimRequest) {
          throw new Error('لم يتم إرجاع بيانات طلب الملكية')
        }

        claimTimer.log('Claim request creation')
        console.log(`✅ Claim request created: ${claimRequest.id}`)

        // ===== STEP 3: Upsert User =====
        console.log('👤 [3/5] Updating user record...')
        const userTimer = createTimer()

        const userEmail = formData.officialEmail || user.primaryEmailAddress?.emailAddress
        if (!userEmail) {
          throw new Error('البريد الإلكتروني للمستخدم غير متوفر')
        }

        const { data: upsertedUser, error: userError } = await supabase
          .from('users')
          .upsert([{
            id: user.id,
            email: userEmail,
            first_name: user.firstName || '',
            last_name: user.lastName || '',
            role: USER_ROLE.COMPANY_MEMBER,
            status: USER_STATUS.ACTIVE
          }], { onConflict: 'id' })
          .select('id')
          .single()

        if (userError) {
          throw new Error(`فشل تحديث بيانات المستخدم: ${userError.message}`)
        }

        userTimer.log('User upsert')
        console.log(`✅ User updated: ${upsertedUser?.id}`)

        // ===== STEP 4: Send Admin Notification =====
        console.log('🔔 [4/5] Sending admin notification...')
        const notifTimer = createTimer()

        try {
          const { error: notifError } = await supabase
            .from('notifications')
            .insert([{
              type: 'claim_request_submitted',
              payload: JSON.stringify({
                company_id: existingCompany.id,
                company_name: existingCompany.name,
                user_email: userEmail,
                claim_request_id: claimRequest.id
              })
            }])
            .select('id')
            .single()

          if (notifError) {
            console.warn('⚠️ Notification failed (non-blocking):', notifError.message)
          } else {
            notifTimer.log('Admin notification')
            console.log('✅ Admin notified')
          }
        } catch (notifErr) {
          console.warn('⚠️ Notification error (non-blocking):', notifErr.message)
        }

        // ===== STEP 5: Success =====
        console.log('🎉 [5/5] Claim submission complete')
        mainTimer.log('Total CASE B flow')

        alert('✅ طلب الملكية تم إرساله!\n\n🔍 فريق مرصد سيقوم بمراجعة طلبك.')
        navigate('/company-claim-pending', { replace: true })

      } else {
        // ============================================================
        // CASE A: New company — Complex flow, needs careful error handling
        // ============================================================

        // ===== STEP 2: Create Company =====
        console.log('🏢 [2/7] Creating company record...')
        const companyTimer = createTimer()

        const { data: newCompany, error: companyError } = await supabase
          .from('companies')
          .insert([buildCompanyInsert({
            name: formData.name,
            crNumber: formData.crNumber,
            unifiedNumber: formData.unifiedNumber,
            licenseNumber: formData.licenseNumber,
            officialEmail: formData.officialEmail,
            sector: formData.sector,
            city: formData.city,
            foundedYear: formData.foundedYear,
            status: COMPANY_STATUS.PENDING,
            source: COMPANY_SOURCE.COMMUNITY,
            crFileUrl: crFileUrl,
          })])
          .select('id')
          .single()

        if (companyError) {
          throw new Error(`فشل إنشاء الشركة: ${companyError.message}`)
        }
        if (!newCompany?.id) {
          throw new Error('لم يتم الحصول على معرّف الشركة')
        }

        createdCompanyId = newCompany.id
        companyTimer.log('Company creation')
        console.log(`✅ Company created: ${newCompany.id}`)

        // ===== STEP 3: Create Tenant =====
        console.log('🏛️  [3/7] Creating tenant record...')
        const tenantTimer = createTimer()

        const tenantEmail = formData.officialEmail || user.primaryEmailAddress?.emailAddress
        if (!tenantEmail) {
          throw new Error('البريد الإلكتروني للشركة غير متوفر')
        }

        const { data: tenantData, error: tenantError } = await supabase
          .from('tenants')
          .insert([{
            name: formData.name,
            cr_number: formData.crNumber,
            email: tenantEmail,
            phone: formData.phone || null,
            sector: formData.sector,
            city: formData.city,
            company_id: newCompany.id,
            status: TENANT_STATUS.ACTIVE
          }])
          .select('id')
          .single()

        if (tenantError) {
          throw new Error(`فشل إنشاء حساب الشركة: ${tenantError.message}`)
        }
        if (!tenantData?.id) {
          throw new Error('لم يتم الحصول على معرّف الحساب')
        }

        createdTenantId = tenantData.id
        cleanupRequired = true // If something fails now, cleanup needed
        tenantTimer.log('Tenant creation')
        console.log(`✅ Tenant created: ${tenantData.id}`)

        // ===== STEP 4: Create User =====
        console.log('👤 [4/7] Creating user record...')
        const userTimer = createTimer()

        const { data: newUser, error: userError } = await supabase
          .from('users')
          .insert([{
            id: user.id,
            tenant_id: tenantData.id,
            company_id: newCompany.id,
            email: user.primaryEmailAddress?.emailAddress,
            first_name: user.firstName || '',
            last_name: user.lastName || '',
            role: USER_ROLE.COMPANY_ADMIN,
            status: USER_STATUS.ACTIVE
          }])
          .select('id')
          .single()

        if (userError) {
          throw new Error(`فشل إنشاء سجل المستخدم: ${userError.message}`)
        }

        userTimer.log('User creation')
        console.log(`✅ User created: ${newUser?.id}`)

        // ===== STEP 5: Create Registration Request =====
        console.log('📋 [5/7] Creating registration request...')
        const regReqTimer = createTimer()

        const { data: regRequest, error: regReqError } = await supabase
          .from('registration_requests')
          .insert([{
            company_id: newCompany.id,
            tenant_id: tenantData.id,
            user_id: user.id,
            cr_document_url: crFileUrl,
            status: REQUEST_STATUS.PENDING
          }])
          .select('id')
          .single()

        if (regReqError) {
          throw new Error(`فشل إنشاء طلب التسجيل: ${regReqError.message}`)
        }

        regReqTimer.log('Registration request creation')
        console.log(`✅ Registration request created: ${regRequest?.id}`)

        // ===== STEP 6: Send Admin Notification =====
        console.log('🔔 [6/7] Sending admin notification...')
        const notifTimer = createTimer()

        try {
          const { error: notifError } = await supabase
            .from('notifications')
            .insert([{
              type: 'company_registration_submitted',
              payload: JSON.stringify({
                company_id: newCompany.id,
                company_name: formData.name,
                cr_number: formData.crNumber,
                registration_request_id: regRequest?.id
              })
            }])
            .select('id')
            .single()

          if (notifError) {
            console.warn('⚠️ Notification failed (non-blocking):', notifError.message)
          } else {
            notifTimer.log('Admin notification')
            console.log('✅ Admin notified')
          }
        } catch (notifErr) {
          console.warn('⚠️ Notification error (non-blocking):', notifErr.message)
        }

        // ===== STEP 7: Success =====
        console.log('🎉 [7/7] Registration complete')
        mainTimer.log('Total CASE A flow')

        alert('✅ تم رفع بيانات شركتك بنجاح!\n\n⏳ سيتم مراجعة التسجيل من قبل فريق مرصد')
        navigate('/registration-pending', { replace: true })
      }

    } catch (err) {
      console.error('❌ Onboarding error:', err.message)
      console.error('Stack:', err.stack)

      // Set user-friendly error message
      const errorMsg = err.message || '❌ حدث خطأ غير متوقع'
      setError(errorMsg)

      // Log cleanup requirement
      if (cleanupRequired && createdTenantId) {
        console.warn(`⚠️  CLEANUP REQUIRED: Tenant ${createdTenantId} created but flow failed`)
        console.warn(`⚠️  CLEANUP REQUIRED: Company ${createdCompanyId} created but flow failed`)
        console.warn('⚠️  Manual cleanup may be needed via admin panel')
      }
    } finally {
      setLoading(false)
      console.log('✅ Loading state cleared')
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
