import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const [crFile, setCrFile] = useState(null)
  const [crFileError, setCrFileError] = useState('')

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

  const validateCompanyData = () => {
    if (!companyData.name.trim()) return 'اسم الشركة مطلوب'
    if (companyData.name.trim().length < 3) return 'اسم الشركة يجب أن يكون 3 أحرف على الأقل'

    if (!companyData.crNumber.trim()) return 'رقم السجل التجاري مطلوب'
    if (!crFile) return 'صورة السجل التجاري مطلوبة'
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
      const crFileUrl = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.onerror = () => reject(new Error('تعذّرت قراءة ملف السجل التجاري'))
        r.readAsDataURL(crFile)
      })

      await createTenantAndUser(user.id, {
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

      // Success - redirect to dashboard
      navigate('/dashboard')
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

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                صورة السجل التجاري *
              </label>
              <input
                id="cr-upload"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (!f) return
                  // Checked against the file on disk, not the encoded string: a
                  // data URL is about a third larger, so testing the encoded
                  // length would reject files well under the stated limit.
                  if (f.size > 15 * 1024 * 1024) {
                    setCrFileError(`الملف ${(f.size / 1024 / 1024).toFixed(1)} م.ب — الحد الأقصى 15 ميجابايت`)
                    setCrFile(null)
                    return
                  }
                  if (!['application/pdf', 'image/png', 'image/jpeg'].includes(f.type)) {
                    setCrFileError('الصيغ المقبولة: PDF أو PNG أو JPG')
                    setCrFile(null)
                    return
                  }
                  setCrFileError('')
                  setCrFile(f)
                }}
                style={{ display: 'none' }}
              />
              <label htmlFor="cr-upload" style={{
                display: 'inline-block', padding: '11px 20px',
                background: crFile ? '#ECFDF5' : '#fff',
                color: crFile ? '#15803D' : '#1E2A52',
                border: `1.5px solid ${crFile ? '#A7F3D0' : '#E2E8F0'}`,
                borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer'
              }}>
                {crFile ? `✔ ${crFile.name}` : '⬆ اختر ملف السجل التجاري'}
              </label>
              <div style={{ fontSize: '12px', color: crFileError ? '#B91C1C' : '#94A3B8', fontWeight: 600, marginTop: '7px' }}>
                {crFileError || 'PDF أو PNG أو JPG · حتى 15 ميجابايت — تراجعه إدارة مرصد قبل اعتماد الشركة'}
              </div>
            </div>
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
