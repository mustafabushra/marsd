import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { getSupabase, smartCompanyDetection, ensureStorageBucket, buildCompanyInsert } from '../lib/api'
import { COMPANY_STATUS, COMPANY_SOURCE, REQUEST_STATUS, USER_ROLE, USER_STATUS, TENANT_STATUS } from '../lib/enums'
import { notifyAdmins } from '../lib/notify'
import RequiredCompanyDocuments, { uploadCompanyDocuments } from '../components/RequiredCompanyDocuments'

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
    // The rest of the official identity. /admin/add-company has collected
    // these all along and a company registering itself was asked for four —
    // so what Marsad knows about a company somebody else added was fuller than
    // what it knows about one that signed up. Every one is a real column.
    nameEn: '',
    entityType: '',
    crType: '',
    crStatus: '',
    crExpiryDate: '',
    foundingDate: '',
    capital: '',
    region: '',
    nationalAddress: '',
    website: '',
  })

  // Filled from the Ministry's published generation, and not asked for twice.
  const [registryMatch, setRegistryMatch] = useState(null)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [lookupNote, setLookupNote] = useState('')

  const fromRegistry = (field) => Boolean(registryMatch) && [
    'name', 'crNumber', 'unifiedNumber', 'entityType', 'region', 'city',
    'foundingDate', 'capital', 'crType',
  ].includes(field)

  // The commercial registration is one of the four required documents, not a
  // field beside them. This screen showed its own dropzone *and* the checklist
  // that already contains it, so the same paper was asked for twice and the
  // form could hold two different files for one document. One source.
  // The rest of the required paperwork. Registering a company puts it in front
  // of a reviewer, and one file out of four is not something anybody can verify.
  const [docFiles, setDocFiles] = useState({})
  const [docTypes, setDocTypes] = useState([])
  const [existingCompany, setExistingCompany] = useState(null)

  // What is still missing, derived once so the button and its label cannot
  // disagree about it.
  const docsLeft = existingCompany ? 0 : docTypes.filter((t) => !docFiles[t.doc_type]).length
  const crFile = docFiles.commercial_registration || null
  const ready = !!crFile && docsLeft === 0

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  /**
   * Fill the official identity from the register instead of asking for it.
   *
   * search_companies_unified answers a name, a CR number or a unified number
   * against Marsad and the published Ministry generation at once — the same
   * call /search and /add-report make. Nothing new is asked of the database.
   */
  const lookupRegistry = async () => {
    const q = (formData.crNumber || formData.name || '').trim()
    if (!q) { setLookupNote('اكتب رقم السجل أو اسم الشركة أولاً'); return }
    setLookupBusy(true); setLookupNote('')
    try {
      const { data, error: e } = await getSupabase()
        .rpc('search_companies_unified', { p_query: q, p_limit: 5 })
      if (e) throw e
      const hit = (data || []).find((r) => r.origin === 'registry')
      if (!hit) {
        setRegistryMatch(null)
        setLookupNote('لم نجد الشركة في السجل المنشور — أكمل البيانات يدوياً')
        return
      }
      setRegistryMatch(hit)
      setFormData((prev) => ({
        ...prev,
        name: hit.name || prev.name,
        crNumber: hit.cr_number || prev.crNumber,
        unifiedNumber: hit.unified_number || prev.unifiedNumber,
        entityType: hit.legal_entity || prev.entityType,
        crType: hit.registration_type || prev.crType,
        region: hit.region || prev.region,
        city: hit.city || prev.city,
        capital: hit.capital != null ? String(hit.capital) : prev.capital,
        foundingDate: hit.registration_date || prev.foundingDate,
      }))
      setLookupNote('')
    } catch (err) {
      setLookupNote(err?.message || 'تعذّر الوصول إلى السجل التجاري')
    } finally { setLookupBusy(false) }
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

    // A company entering the registry without the paper that proves it exists is
    // a record nobody can verify, and Marsad would be publishing a trust score
    // for it. CompanyRegister enforces the same rule on its own path.
    if (!crFile) {
      setError('❌ رفع السجل التجاري مطلوب')
      return
    }

    // And the rest of them.
    //
    // `submit_company_request` refuses without these, so a submission that got
    // this far would fail at the database with a message about missing
    // documents — after the company had been created. Said here, before
    // anything is written, and named so somebody knows which.
    const missingDocs = docTypes.filter((t) => !docFiles[t.doc_type])
    if (missingDocs.length) {
      setError(`❌ مستندات ناقصة: ${missingDocs.map((t) => t.label).join('، ')}`)
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
              if (typeof result === 'string' && result.length > 21 * 1024 * 1024) {
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

        // ===== STEP 4: Tell Marsad a claim is waiting =====
        // This was written by hand and failed three ways at once: a type the
        // CHECK did not allow, no user_id and no tenant_id when both were NOT
        // NULL, and a JSON.stringify'd payload in a jsonb column. Every claim
        // filed since launch went unannounced.
        await notifyAdmins('claim_request_submitted', {
          title: 'طلب ملكية جديد',
          message: `${userEmail} يطالب بملكية «${existingCompany.name}»`,
          meta: {
            company_id: existingCompany.id,
            company_name: existingCompany.name,
            user_email: userEmail,
            claim_request_id: claimRequest.id,
          },
        })

        // ===== STEP 5: Success =====
        console.log('🎉 [5/5] Claim submission complete')
        mainTimer.log('Total CASE B flow')

        alert('✅ طلب الملكية تم إرساله!\n\n🔍 فريق مرصد سيقوم بمراجعة طلبك.')
        navigate('/company-claim-pending', { replace: true })

      } else {
        // ============================================================
        // CASE A: New company — Complex flow, needs careful error handling
        // ============================================================

        // The address the company account is keyed on. Its own official
        // address where one was given, and the person's otherwise — a tenant
        // without an e-mail cannot be written at all.
        const tenantEmail = formData.officialEmail || user.primaryEmailAddress?.emailAddress
        if (!tenantEmail) {
          throw new Error('البريد الإلكتروني للشركة غير متوفر')
        }

        // ===== Registering the company =====
        //
        // One call. This wrote four rows from the browser as four separate
        // requests — company, tenant, user link, registration request — and
        // there is no transaction across four round trips. One of them did not
        // land, and what it left was worse than a failure: an account with no
        // tenant, sent to this form on every sign-in, and its own half-finished
        // attempt holding its registration number so the form refused it as a
        // duplicate. Locked out by itself.
        //
        // `register_company_for_current_user` commits all of it or none.
        console.log('🏢 Registering company (single transaction)')
        const { data: reg, error: regError } = await supabase
          .rpc('register_company_for_current_user', {
            p_name: formData.name,
            p_cr_number: formData.crNumber,
            p_email: tenantEmail,
            p_phone: formData.phone || null,
            p_city: formData.city || null,
            p_sector: formData.sector || null,
            p_unified_number: formData.unifiedNumber || null,
            p_cr_file_url: crFileUrl,
            p_founded_year: formData.foundedYear ? Number(formData.foundedYear) : null,
            // The rest of the identity, so the file opens complete rather than
            // waiting for an operator to read it off the certificate. Blank
            // stays null — the function coalesces, so an empty field never
            // erases what the register already said.
            p_name_en: formData.nameEn || null,
            p_entity_type: formData.entityType || null,
            p_cr_type: formData.crType || null,
            p_cr_status: formData.crStatus || null,
            p_cr_expiry_date: formData.crExpiryDate || null,
            p_founding_date: formData.foundingDate || null,
            p_capital: formData.capital ? Number(formData.capital) : null,
            p_region: formData.region || null,
            p_national_address: formData.nationalAddress || null,
            p_website: formData.website || null,
          })

        if (regError) throw new Error(regError.message)

        const created = Array.isArray(reg) ? reg[0] : reg
        // Read back, not assumed. An RPC a policy filtered returns no error and
        // no row, and «تم التسجيل» over nothing is what this whole change exists
        // to stop.
        if (!created?.company_id) throw new Error('لم يُسجَّل الطلب — حدّث الصفحة وأعد المحاولة')

        createdCompanyId = created.company_id
        createdTenantId = created.tenant_id

        // ===== The request, and its documents =====
        //
        // The request arrives with the company: `register_company_for_current_user`
        // opens it in the same transaction. Opening it from here was a second
        // write from a second place, and a browser closed between the two calls
        // left a company with an account and no request — invisible to the queue
        // and unable to be resumed.
        //
        // The documents attach to the request rather than floating beside the
        // company, so a reviewer opens one thing and finds the company, what
        // was entered, and every file that came with it.
        const requestId = created.request_id
        if (!requestId) throw new Error('لم يُفتح الطلب — حدّث الصفحة وأعد المحاولة')

        const failedDocs = await uploadCompanyDocuments(docFiles, {
          companyId: created.company_id,
          tenantId: created.tenant_id,
          userId: user.id,
          requestId,
        })

        if (failedDocs.length) {
          const names = failedDocs.map((k) => docTypes.find((t) => t.doc_type === k)?.label || k)
          throw new Error(`تعذّر رفع: ${names.join('، ')} — أعد المحاولة`)
        }

        // ===== Handing it to Marsad =====
        //
        // The submit is what puts it in the queue, and it re-checks the
        // documents in the database. The check in this file tells somebody
        // early; that one is the rule.
        const { error: submitError } = await supabase
          .rpc('submit_company_request', { p_request_id: requestId })
        if (submitError) throw new Error(submitError.message)

        console.log('🎉 Registration complete')
        mainTimer.log('Total registration flow')

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
                  readOnly={fromRegistry('name')}
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
                  readOnly={fromRegistry('crNumber')}
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

              <div>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  الرقم الموحّد
                </label>
                <input
                  type="text"
                  value={formData.unifiedNumber}
                  onChange={(e) => handleChange('unifiedNumber', e.target.value)}
                  readOnly={fromRegistry('unifiedNumber')}
                  placeholder="٧٠٠٠٠٠٠٠٠٠"
                  style={{
                    width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '8px',
                    padding: '10px 12px', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box',
                    background: fromRegistry('unifiedNumber') ? '#F8FAFC' : '#fff',
                    color: fromRegistry('unifiedNumber') ? '#475569' : '#0F172A',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  الكيان القانوني
                </label>
                <input
                  type="text"
                  value={formData.entityType}
                  onChange={(e) => handleChange('entityType', e.target.value)}
                  readOnly={fromRegistry('entityType')}
                  placeholder="مؤسسة فردية / شركة ذات مسؤولية محدودة"
                  style={{
                    width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '8px',
                    padding: '10px 12px', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box',
                    background: fromRegistry('entityType') ? '#F8FAFC' : '#fff',
                    color: fromRegistry('entityType') ? '#475569' : '#0F172A',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  نوع السجل
                </label>
                <input
                  type="text"
                  value={formData.crType}
                  onChange={(e) => handleChange('crType', e.target.value)}
                  readOnly={fromRegistry('crType')}
                  placeholder="رئيسي / فرعي"
                  style={{
                    width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '8px',
                    padding: '10px 12px', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box',
                    background: fromRegistry('crType') ? '#F8FAFC' : '#fff',
                    color: fromRegistry('crType') ? '#475569' : '#0F172A',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  المنطقة
                </label>
                <input
                  type="text"
                  value={formData.region}
                  onChange={(e) => handleChange('region', e.target.value)}
                  readOnly={fromRegistry('region')}
                  placeholder="منطقة الرياض"
                  style={{
                    width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '8px',
                    padding: '10px 12px', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box',
                    background: fromRegistry('region') ? '#F8FAFC' : '#fff',
                    color: fromRegistry('region') ? '#475569' : '#0F172A',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  رأس المال
                </label>
                <input
                  type="number"
                  value={formData.capital}
                  onChange={(e) => handleChange('capital', e.target.value)}
                  readOnly={fromRegistry('capital')}
                  placeholder="٥٠٠٠٠"
                  style={{
                    width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '8px',
                    padding: '10px 12px', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box',
                    background: fromRegistry('capital') ? '#F8FAFC' : '#fff',
                    color: fromRegistry('capital') ? '#475569' : '#0F172A',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  تاريخ إنشاء السجل
                </label>
                <input
                  type="date"
                  value={formData.foundingDate}
                  onChange={(e) => handleChange('foundingDate', e.target.value)}
                  readOnly={fromRegistry('foundingDate')}
                  placeholder=""
                  style={{
                    width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '8px',
                    padding: '10px 12px', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box',
                    background: fromRegistry('foundingDate') ? '#F8FAFC' : '#fff',
                    color: fromRegistry('foundingDate') ? '#475569' : '#0F172A',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  انتهاء السجل
                </label>
                <input
                  type="date"
                  value={formData.crExpiryDate}
                  onChange={(e) => handleChange('crExpiryDate', e.target.value)}
                  readOnly={fromRegistry('crExpiryDate')}
                  placeholder=""
                  style={{
                    width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '8px',
                    padding: '10px 12px', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box',
                    background: fromRegistry('crExpiryDate') ? '#F8FAFC' : '#fff',
                    color: fromRegistry('crExpiryDate') ? '#475569' : '#0F172A',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  الاسم بالإنجليزية
                </label>
                <input
                  type="text"
                  value={formData.nameEn}
                  onChange={(e) => handleChange('nameEn', e.target.value)}
                  readOnly={fromRegistry('nameEn')}
                  placeholder="Future Co."
                  style={{
                    width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '8px',
                    padding: '10px 12px', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box',
                    background: fromRegistry('nameEn') ? '#F8FAFC' : '#fff',
                    color: fromRegistry('nameEn') ? '#475569' : '#0F172A',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  العنوان الوطني
                </label>
                <input
                  type="text"
                  value={formData.nationalAddress}
                  onChange={(e) => handleChange('nationalAddress', e.target.value)}
                  readOnly={fromRegistry('nationalAddress')}
                  placeholder="الرمز البريدي والمبنى"
                  style={{
                    width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '8px',
                    padding: '10px 12px', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box',
                    background: fromRegistry('nationalAddress') ? '#F8FAFC' : '#fff',
                    color: fromRegistry('nationalAddress') ? '#475569' : '#0F172A',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  الموقع الإلكتروني
                </label>
                <input
                  type="url"
                  value={formData.website}
                  onChange={(e) => handleChange('website', e.target.value)}
                  readOnly={fromRegistry('website')}
                  placeholder="https://"
                  style={{
                    width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '8px',
                    padding: '10px 12px', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box',
                    background: fromRegistry('website') ? '#F8FAFC' : '#fff',
                    color: fromRegistry('website') ? '#475569' : '#0F172A',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  البريد الرسمي
                </label>
                <input
                  type="email"
                  value={formData.officialEmail}
                  onChange={(e) => handleChange('officialEmail', e.target.value)}
                  readOnly={fromRegistry('officialEmail')}
                  placeholder="info@company.sa"
                  style={{
                    width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '8px',
                    padding: '10px 12px', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box',
                    background: fromRegistry('officialEmail') ? '#F8FAFC' : '#fff',
                    color: fromRegistry('officialEmail') ? '#475569' : '#0F172A',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                  الهاتف
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  readOnly={fromRegistry('phone')}
                  placeholder="+9665…"
                  style={{
                    width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '8px',
                    padding: '10px 12px', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box',
                    background: fromRegistry('phone') ? '#F8FAFC' : '#fff',
                    color: fromRegistry('phone') ? '#475569' : '#0F172A',
                  }}
                />
              </div>
            </div>

            {/* Fill it from the register rather than asking twice. */}
            <div style={{
              background: registryMatch ? '#F0FDF4' : '#F8FAFC',
              border: `1.5px solid ${registryMatch ? '#A7F3D0' : '#E2E8F0'}`,
              borderRadius: '12px', padding: '14px', marginBottom: '16px',
            }}>
              {registryMatch ? (
                <div style={{ fontSize: '13px', color: '#15803D', fontWeight: 700, lineHeight: 1.9 }}>
                  ✔ عُثر على الشركة في السجل التجاري — وزارة التجارة
                  <div style={{ color: '#334155', fontWeight: 600, marginTop: '4px' }}>
                    الحقول الرسمية مُعبّأة من السجل ومقفلة. أكمل ما لا تنشره الوزارة فقط.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" onClick={lookupRegistry} disabled={lookupBusy}
                    style={{
                      padding: '9px 18px', borderRadius: '9px', border: 0,
                      background: lookupBusy ? '#93C5FD' : '#1E2A52', color: '#fff',
                      fontSize: '13px', fontWeight: 800,
                      cursor: lookupBusy ? 'default' : 'pointer', fontFamily: 'inherit',
                    }}>{lookupBusy ? '… جارٍ البحث' : 'جلب البيانات من السجل التجاري'}</button>
                  <span style={{ fontSize: '12.5px', color: lookupNote ? '#B45309' : '#64748B', fontWeight: 600, lineHeight: 1.8 }}>
                    {lookupNote || 'اكتب رقم السجل ثم اجلب بياناتك الرسمية بدل إدخالها يدوياً'}
                  </span>
                </div>
              )}
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

            {/* The rest of the paperwork.
                Not shown for a claim: claiming an existing company is proving
                you own it, and the company's own certificates are what the
                claim is about — asking for all four here would be asking the
                claimant to hold documents they may not have yet. */}
            {!existingCompany && (
              <div style={{ marginBottom: '18px' }}>
                <RequiredCompanyDocuments
                  files={docFiles}
                  onChange={setDocFiles}
                  onTypesLoaded={setDocTypes}
                  disabled={loading}
                />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                type="button"
                onClick={() => { setStep(1); setExistingCompany(null); setDocFiles({}) }}
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
                disabled={loading || !ready}
                style={{
                  background: loading || !ready ? '#CCCCCC' : '#16A34A',
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
