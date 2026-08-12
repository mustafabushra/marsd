import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RequiredCompanyDocuments, { uploadCompanyDocuments } from '../components/RequiredCompanyDocuments'
import { getSupabase } from '../lib/api'
import { useUser } from '@clerk/react'
import { createTenantAndUser } from '../lib/api'
import { SkeletonPage } from '../components/Skeleton'

const SAUDI_CITIES = [
  'الرياض',
  'جدة',
  'مكة المكرمة',
  'المدينة المنورة',
  'الدمام',
  'الخبر',
  'الظهران',
  'القصيم',
  'عسير',
  'أبها',
  'تبوك',
  'حائل',
  'جيزان',
  'نجران',
  'الباحة',
  'الحدود الشمالية',
  'الأحساء',
  'ينبع',
  'الدوادمي',
  'شقراء'
]

const SECTORS = [
  'البناء والمقاولات',
  'النقل واللوجستيات',
  'التجارة والبيع بالتجزئة',
  'الصناعة والتصنيع',
  'الخدمات المالية',
  'السياحة والضيافة',
  'التكنولوجيا والاتصالات',
  'الطاقة والنفط والغاز',
  'الرعاية الصحية',
  'التعليم',
  'العقارات',
  'الزراعة والثروة السمكية',
  'الإعلام والنشر',
  'الخدمات الاستشارية',
  'الاستيراد والتصدير',
  'الكهرباء والمياه',
  'الاتصالات',
  'الترفيه والثقافة',
  'الخدمات الحكومية',
  'أخرى'
]

export default function CompanyRegister() {
  const navigate = useNavigate()
  const { user, isLoaded } = useUser()
  const [step, setStep] = useState('auth') // auth | company
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Auth Step State
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')

  // Company Step State
  // The registration document. Required: a company entering the registry without
  // the paper that proves it exists is a record nobody can verify, and Marsad
  // would be publishing a trust score for it. CompanyOnboarding enforces the
  // same rule on its path; this one had no upload field at all.
  // The commercial registration is one of the required documents, not a field
  // beside them. It had its own upload here and appeared again inside the
  // checklist, so the form asked for the same paper twice and could hold two
  // different files for it. It is read from the one block that owns it.

  // What the Ministry already published about this company.
  //
  // Nine fields come from government_company_registry — name, both numbers,
  // capital, legal entity, region, city, registration date and type. Asking a
  // company to type them again is asking it to re-enter what the authority has
  // already stated, and every retyping is a chance to disagree with the
  // register the rest of the product reads. So they are filled from the record
  // and shown as read-only, with the source named.
  const [registryMatch, setRegistryMatch] = useState(null)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [lookupNote, setLookupNote] = useState('')

  // The four documents the database marks required. Collected here rather than
  // after approval: a file opened without them is a file nobody can verify.
  const [docFiles, setDocFiles] = useState({})
  const [docTypes, setDocTypes] = useState([])
  const docsLeft = docTypes.filter((t) => !docFiles[t.doc_type]).length

  const [companyData, setCompanyData] = useState({
    name: '',
    nameEn: '',
    crNumber: '',
    unifiedNumber: '',
    entityType: '',
    sector: '',
    mainActivity: '',
    subActivities: '',
    city: '',
    region: '',
    nationalAddress: '',
    foundedYear: new Date().getFullYear(),
    foundingDate: '',
    crExpiryDate: '',
    crStatus: 'active',
    email: '',
    phone: '',
    website: '',
    description: ''
  })

  // If already signed in, redirect to next step
  if (isLoaded && user && step === 'auth') {
    setStep('company')
  }

  const handleCompanyChange = (field, value) => {
    setCompanyData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  /**
   * Find this company in the Ministry's published generation and fill it in.
   *
   * search_companies_unified already answers a name, a commercial registration
   * number or a unified number against both Marsad and the published register
   * — it is what /search and /add-report use. Nothing new is asked of the
   * database here.
   */
  const lookupRegistry = async () => {
    const q = companyData.crNumber.trim() || companyData.name.trim()
    if (!q) { setLookupNote('اكتب رقم السجل أو اسم الشركة أولاً'); return }
    setLookupBusy(true)
    setLookupNote('')
    try {
      const { data, error: e } = await getSupabase()
        .rpc('search_companies_unified', { p_query: q, p_limit: 5 })
      if (e) throw e
      const hit = (data || []).find((r) => r.origin === 'registry')
        || (data || []).find((r) => r.origin === 'marsad')
      if (!hit) {
        setLookupNote('لم نجد هذه الشركة في السجل التجاري المنشور — أكمل البيانات يدوياً')
        setRegistryMatch(null)
        return
      }
      if (hit.origin === 'marsad') {
        setLookupNote('هذه الشركة مسجّلة في مرصد بالفعل. إن كانت شركتك فقدّم طلب ملكية بدل تسجيل جديد.')
        setRegistryMatch(null)
        return
      }
      setRegistryMatch(hit)
      setCompanyData((prev) => ({
        ...prev,
        name: hit.name || prev.name,
        crNumber: hit.cr_number || prev.crNumber,
        unifiedNumber: hit.unified_number || prev.unifiedNumber,
        entityType: hit.legal_entity || prev.entityType,
        region: hit.region || prev.region,
        city: hit.city || prev.city,
        foundingDate: hit.registration_date || prev.foundingDate,
      }))
      setLookupNote('')
    } catch (err) {
      setLookupNote(err?.message || 'تعذّر الوصول إلى السجل التجاري')
    } finally {
      setLookupBusy(false)
    }
  }

  // Filled from the register, so not asked for again. The list is exactly the
  // columns search_companies_unified returns from the official record.
  const fromRegistry = (field) => Boolean(registryMatch) && [
    'name', 'crNumber', 'unifiedNumber', 'entityType', 'region', 'city', 'foundingDate',
  ].includes(field)

  const validateCompanyData = () => {
    if (!companyData.name.trim()) return 'اسم الشركة مطلوب'
    if (companyData.name.trim().length < 3) return 'اسم الشركة يجب أن يكون 3 أحرف على الأقل'

    if (!companyData.crNumber.trim()) return 'رقم السجل التجاري مطلوب'
    // Every document the database marks required, at registration.
    if (docTypes.length && docsLeft > 0) {
      const missing = docTypes.filter((t) => !docFiles[t.doc_type]).map((t) => t.label)
      return `مستندات ناقصة: ${missing.join('، ')}`
    }
    const crDigits = companyData.crNumber.replace(/\D/g, '')
    if (crDigits.length < 10) return 'رقم السجل يجب أن يكون 10 أرقام على الأقل'

    if (!companyData.sector.trim()) return 'القطاع مطلوب'
    if (!companyData.city.trim()) return 'المدينة مطلوبة'

    if (!companyData.email.trim()) return 'البريد الإلكتروني مطلوب'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyData.email)) return 'البريد الإلكتروني غير صحيح'

    if (companyData.phone.trim() && !/^[\d\s+()-]{7,}$/.test(companyData.phone))
      return 'رقم الهاتف غير صحيح'

    return ''
  }

  const setErrorWithTimeout = (msg) => {
    setError(msg)
    if (msg) {
      setTimeout(() => setError(''), 5000)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const validation = validateCompanyData()
      if (validation) {
        setErrorWithTimeout(validation)
        setLoading(false)
        return
      }

      if (!user) {
        setError('يجب تسجيل الدخول أولاً')
        setLoading(false)
        return
      }

      // Read the file here rather than on selection: holding a 20 MB data URL in
      // component state for the length of a form is memory nobody asked for.
      const crFile = docFiles.commercial_registration
      const crFileUrl = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.onerror = () => reject(new Error('تعذّرت قراءة ملف السجل التجاري'))
        r.readAsDataURL(crFile)
      })

      const created = await createTenantAndUser(user.id, {
        crFileUrl,
        name: companyData.name,
        crNumber: companyData.crNumber,
        email: companyData.email || user.primaryEmailAddress?.emailAddress,
        phone: companyData.phone,
        city: companyData.city,
        sector: companyData.sector,
        foundedYear: companyData.foundedYear,
        crStatus: companyData.crStatus,
        // Identity fields (Layer 1) — for admin verification against the real CR
        nameEn: companyData.nameEn,
        unifiedNumber: companyData.unifiedNumber,
        entityType: companyData.entityType,
        region: companyData.region,
        mainActivity: companyData.mainActivity,
        subActivities: companyData.subActivities,
        nationalAddress: companyData.nationalAddress,
        foundingDate: companyData.foundingDate,
        crExpiryDate: companyData.crExpiryDate,
        website: companyData.website,
        firstName: user.firstName,
        lastName: user.lastName
      })

      // The documents go onto the company that was just created, not into a
      // queue for later. Two phases because the storage path needs the company
      // id, which is why createTenantAndUser returns it.
      //
      // A failed upload does not undo the registration. The account exists and
      // the company is in review either way; losing all of it because one file
      // did not land would be the worse outcome, so what failed is named and
      // can be supplied from the dashboard.
      if (created?.companyId && Object.keys(docFiles).length) {
        const failed = await uploadCompanyDocuments(docFiles, {
          companyId: created.companyId,
          tenantId: created.tenantId,
          userId: user.id,
        })
        if (failed?.length) {
          const names = failed.map((k) => docTypes.find((t) => t.doc_type === k)?.label || k)
          setErrorWithTimeout(`تعذّر رفع: ${names.join('، ')} — أضفها من لوحة التحكم`)
        }
      }

      // Registered, not admitted.
      //
      // This went to /dashboard, which was honest while registration activated
      // the account on the spot. It no longer does, and sending somebody to a
      // dashboard they are not yet allowed to see would bounce them through
      // CompanyStatusRouter to the waiting screen — arriving there as though
      // something had gone wrong, rather than because their turn had not come.
      navigate('/registration-pending', { replace: true })
    } catch (err) {
      const errorMsg = err.message || 'حدث خطأ غير متوقع'
      setErrorWithTimeout(errorMsg)
      console.error('Registration error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!isLoaded) {
    return (
      <SkeletonPage stats={0} panels={3} />
    )
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
            تسجيل شركة جديدة
          </h1>
          <p style={{
            fontSize: '15px',
            color: '#64748B',
            margin: 0
          }}>
            بيانات الشركة اللازمة للتسجيل
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            background: '#FEE2E2',
            color: '#991B1B',
            padding: '12px 14px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px'
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{
          background: '#fff',
          padding: '32px',
          borderRadius: '16px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)'
        }}>
          {/* Row 1: Company Name + CR Number */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#334155',
                display: 'block',
                marginBottom: '6px'
              }}>
                اسم الشركة *
              </label>
              <input
                type="text"
                value={companyData.name}
                onChange={(e) => handleCompanyChange('name', e.target.value)}
                readOnly={fromRegistry('name')}
                placeholder="مثال: شركة نجد"
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div>
              <label style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#334155',
                display: 'block',
                marginBottom: '6px'
              }}>
                رقم السجل التجاري *
              </label>
              <input
                type="text"
                value={companyData.crNumber}
                onChange={(e) => handleCompanyChange('crNumber', e.target.value)}
                readOnly={fromRegistry('crNumber')}
                placeholder="مثال: 1234567890"
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

          </div>

          {/* Fill it from the register instead of asking twice. */}
          <div style={{
            background: registryMatch ? '#F0FDF4' : '#F8FAFC',
            border: `1.5px solid ${registryMatch ? '#A7F3D0' : '#E2E8F0'}`,
            borderRadius: '12px', padding: '14px', marginBottom: '16px',
          }}>
            {registryMatch ? (
              <div style={{ fontSize: '13px', color: '#15803D', fontWeight: 700, lineHeight: 1.9 }}>
                ✔ عُثر على الشركة في السجل التجاري — وزارة التجارة
                <div style={{ color: '#334155', fontWeight: 600, marginTop: '4px' }}>
                  الاسم والرقمان والكيان والمنطقة والمدينة وتاريخ القيد مُعبّأة من السجل الرسمي،
                  ولن يُطلب منك إدخالها. المطلوب منك المستندات وبيانات التواصل.
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

          {/* Row 2: Sector + City */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#334155',
                display: 'block',
                marginBottom: '6px'
              }}>
                القطاع *
              </label>
              <select
                value={companyData.sector}
                onChange={(e) => handleCompanyChange('sector', e.target.value)}
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit'
                }}
              >
                <option value="">اختر القطاع</option>
                {SECTORS.map(sector => (
                  <option key={sector} value={sector}>{sector}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#334155',
                display: 'block',
                marginBottom: '6px'
              }}>
                المدينة *
              </label>
              <select
                value={companyData.city}
                onChange={(e) => handleCompanyChange('city', e.target.value)}
                readOnly={fromRegistry('city')}
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit'
                }}
              >
                <option value="">اختر المدينة</option>
                {SAUDI_CITIES.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 3: Founded Year + CR Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#334155',
                display: 'block',
                marginBottom: '6px'
              }}>
                سنة التأسيس
              </label>
              <input
                type="number"
                value={companyData.foundedYear}
                onChange={(e) => handleCompanyChange('foundedYear', parseInt(e.target.value))}
                min="1900"
                max={new Date().getFullYear()}
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div>
              <label style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#334155',
                display: 'block',
                marginBottom: '6px'
              }}>
                حالة السجل
              </label>
              <select
                value={companyData.crStatus}
                onChange={(e) => handleCompanyChange('crStatus', e.target.value)}
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              >
                <option value="active">نشط</option>
                <option value="suspended">موقوف</option>
                <option value="terminated">منتهٍ / مشطوب</option>
                <option value="pending">قيد المعالجة</option>
              </select>
            </div>
          </div>

          {/* Row 4: Email + Phone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#334155',
                display: 'block',
                marginBottom: '6px'
              }}>
                البريد الإلكتروني *
              </label>
              <input
                type="email"
                value={companyData.email}
                onChange={(e) => handleCompanyChange('email', e.target.value)}
                placeholder="info@company.sa"
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div>
              <label style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#334155',
                display: 'block',
                marginBottom: '6px'
              }}>
                رقم الهاتف
              </label>
              <input
                type="tel"
                value={companyData.phone}
                onChange={(e) => handleCompanyChange('phone', e.target.value)}
                placeholder="+966 50 123 4567"
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* Row 5: Website */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              fontSize: '14px',
              fontWeight: 700,
              color: '#334155',
              display: 'block',
              marginBottom: '6px'
            }}>
              موقع الويب
            </label>
            <input
              type="url"
              value={companyData.website}
              onChange={(e) => handleCompanyChange('website', e.target.value)}
              placeholder="https://example.sa"
              style={{
                width: '100%',
                border: '1.5px solid #E2E8F0',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Optional identity data (for admin verification against the real CR) */}
          <div style={{ marginBottom: '10px', fontSize: '13px', fontWeight: 800, color: '#64748B' }}>بيانات إضافية للسجل (اختياري — تساعد الإدارة في التحقق)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            {[
              { f: 'nameEn', label: 'اسم الشركة (إنجليزي)', ph: 'Company Co.' },
              { f: 'unifiedNumber', label: 'الرقم الموحّد (700)', ph: '7001234567' },
              { f: 'entityType', label: 'نوع الكيان', ph: 'ذات مسؤولية محدودة' },
              { f: 'region', label: 'المنطقة', ph: 'منطقة الرياض' },
              { f: 'mainActivity', label: 'النشاط الرئيسي', ph: 'تجارة الجملة' },
              { f: 'crExpiryDate', label: 'تاريخ انتهاء السجل', type: 'date' },
            ].map(({ f, label, ph, type }) => (
              <div key={f}>
                <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>{label}</label>
                <input
                  type={type || 'text'}
                  value={companyData[f]}
                  onChange={(e) => handleCompanyChange(f, e.target.value)}
                  placeholder={ph}
                  style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>

          {/* Row 6: Description */}
          <div style={{ marginBottom: '22px' }}>
            <label style={{
              fontSize: '14px',
              fontWeight: 700,
              color: '#334155',
              display: 'block',
              marginBottom: '6px'
            }}>
              وصف النشاط
            </label>
            <textarea
              value={companyData.description}
              onChange={(e) => handleCompanyChange('description', e.target.value)}
              placeholder="وصف موجز عن نشاط الشركة..."
              rows="3"
              style={{
                width: '100%',
                border: '1.5px solid #E2E8F0',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Privacy Notice */}
          <div style={{
            background: '#F0F4FF',
            border: '1px solid #E0E7FF',
            borderRadius: '8px',
            padding: '10px 12px',
            marginBottom: '16px',
            fontSize: '12px',
            color: '#1E40AF',
            fontWeight: 500,
            textAlign: 'right'
          }}>
            🔒 بياناتك محمية بسياسة الخصوصية. لن نشارك معلوماتك مع جهات خارجية.
          </div>

          {/* The documents that open a complete file.
              The list is read from company_document_types(), so «which are
              required» is answered by the database rather than by this form —
              the two cannot drift. They are saved onto the company and appear
              in its dashboard; nothing here is asked for a second time unless
              it expires or is rejected. */}
          <div style={{ marginBottom: '18px' }}>
            <RequiredCompanyDocuments
              files={docFiles}
              onChange={setDocFiles}
              onTypesLoaded={setDocTypes}
              disabled={loading}
            />
            {docTypes.length > 0 && (
              <div style={{
                fontSize: '12.5px', fontWeight: 700, marginTop: '8px',
                color: docsLeft === 0 ? '#15803D' : '#B45309',
              }}>
                {docsLeft === 0
                  ? '✔ كل المستندات المطلوبة مرفقة'
                  : `بقي ${docsLeft} من ${docTypes.length} مستندات مطلوبة`}
              </div>
            )}
          </div>

          {/* Submit Button */}
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
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'جاري الحفظ...' : 'إنشاء حسابك والبدء'}
          </button>

          <p style={{
            textAlign: 'center',
            fontSize: '13px',
            color: '#64748B',
            margin: '16px 0 0'
          }}>
            هل لديك حساب بالفعل؟{' '}
            <a
              href="/login"
              style={{
                color: '#16A34A',
                textDecoration: 'none',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
              onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
            >
              تسجيل الدخول
            </a>
          </p>
        </form>
      </div>
    </main>
  )
}
