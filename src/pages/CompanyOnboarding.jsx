import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { createTenantAndUser, getSupabase } from '../lib/api'

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

export default function CompanyOnboarding() {
  const navigate = useNavigate()
  const { user } = useUser()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [companyData, setCompanyData] = useState({
    name: '',
    crNumber: '',
    sector: '',
    city: '',
    foundedYear: new Date().getFullYear(),
    crStatus: 'active',
    email: user?.primaryEmailAddress?.emailAddress || '',
    phone: '',
    website: '',
  })

  const [crFile, setCrFile] = useState(null)
  const [crFilePreview, setCrFilePreview] = useState(null)

  const handleChange = (field, value) => {
    setCompanyData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type (PDF, JPG, PNG only)
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png']
    if (!allowedTypes.includes(file.type)) {
      setError('نوع الملف غير مدعوم. استخدم PDF أو صورة فقط')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('حجم الملف كبير جداً. الحد الأقصى 5MB')
      return
    }

    setCrFile(file)
    const preview = URL.createObjectURL(file)
    setCrFilePreview(preview)
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Validate
      if (!companyData.name.trim()) throw new Error('اسم الشركة مطلوب')
      if (!companyData.crNumber.trim()) throw new Error('رقم السجل التجاري مطلوب')
      if (!companyData.sector.trim()) throw new Error('القطاع مطلوب')
      if (!companyData.city.trim()) throw new Error('المدينة مطلوبة')
      if (!crFile) throw new Error('رفع السجل التجاري مطلوب')

      // Upload CR file to Supabase Storage
      const fileName = `cr_${Date.now()}_${crFile.name}`
      const supabase = getSupabase()
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('company-documents')
        .upload(`cr-files/${fileName}`, crFile)

      if (uploadError) throw new Error('فشل رفع السجل التجاري: ' + uploadError.message)

      // Create tenant with PENDING_APPROVAL status
      const crFileUrl = uploadData?.path || `cr-files/${fileName}`
      await createTenantAndUser(user.id, {
        name: companyData.name,
        crNumber: companyData.crNumber,
        email: companyData.email || user.primaryEmailAddress?.emailAddress,
        phone: companyData.phone,
        city: companyData.city,
        sector: companyData.sector,
        foundedYear: companyData.foundedYear,
        crStatus: companyData.crStatus,
        crFileUrl: crFileUrl,
        status: 'pending_approval',  // ← الحساب معلق بانتظار الموافقة
        firstName: user.firstName,
        lastName: user.lastName
      })

      // Show success message
      setError('') // Clear errors
      alert('✅ تم رفع بيانات شركتك بنجاح!\n\nسيتم مراجعة السجل التجاري من قبل فريق مرصد\nستتلقى إشعار عند اكتمال المراجعة')
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'حدث خطأ')
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
            إكمال بيانات الشركة
          </h1>
          <p style={{
            fontSize: '15px',
            color: '#64748B',
            margin: 0
          }}>
            يرجى إدخال بيانات شركتك لإكمال إعداد الحساب
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
            ⚠️ {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{
          background: '#fff',
          padding: '32px',
          borderRadius: '16px',
          border: '1px solid #E2E8F0'
        }}>
          {/* Row 1 */}
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
                onChange={(e) => handleChange('name', e.target.value)}
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
                onChange={(e) => handleChange('crNumber', e.target.value)}
                placeholder="1234567890"
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

          {/* Row 2 */}
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
                onChange={(e) => handleChange('sector', e.target.value)}
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
                onChange={(e) => handleChange('city', e.target.value)}
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

          {/* Row 3 */}
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
                onChange={(e) => handleChange('foundedYear', parseInt(e.target.value))}
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
                رقم الهاتف
              </label>
              <input
                type="tel"
                value={companyData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
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

          {/* CR File Upload - REQUIRED */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              fontSize: '14px',
              fontWeight: 700,
              color: '#334155',
              display: 'block',
              marginBottom: '8px'
            }}>
              رفع السجل التجاري * (مطلوب)
            </label>
            <div style={{
              border: '2px dashed #E2E8F0',
              borderRadius: '12px',
              padding: '24px',
              textAlign: 'center',
              cursor: 'pointer',
              background: crFile ? '#F0FDF4' : '#F8FAFC',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => !crFile && (e.currentTarget.style.borderColor = '#16A34A')}
            onMouseLeave={(e) => !crFile && (e.currentTarget.style.borderColor = '#E2E8F0')}
            >
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
                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                    {(crFile.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                  <button
                    type="button"
                    onClick={() => { setCrFile(null); setCrFilePreview(null) }}
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
                    اضغط هنا أو اسحب الملف
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>
                    PDF أو صورة (JPG, PNG) — الحد الأقصى 5MB
                  </div>
                </label>
              )}
            </div>
          </div>

          {/* Approval Notice */}
          <div style={{
            background: '#EEF2FF',
            border: '1px solid #E0E7FF',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '20px',
            fontSize: '13px',
            color: '#1E40AF',
            fontWeight: 500,
            textAlign: 'right'
          }}>
            🔒 بعد رفع السجل التجاري، سيكون حسابك في الانتظار حتى تتم الموافقة من فريق مرصد
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !crFile}
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
              marginTop: '8px'
            }}
          >
            {loading ? 'جاري الحفظ...' : 'إكمال الإعداد والبدء'}
          </button>
        </form>
      </div>
    </main>
  )
}
