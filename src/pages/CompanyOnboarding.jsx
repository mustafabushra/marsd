import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { createTenantAndUser, getSupabase, ensureStorageBucket } from '../lib/api'

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
      setError('❌ نوع الملف غير مدعوم. استخدم PDF أو صورة فقط')
      return
    }

    // Validate file size (max 5MB, but base64 will be ~1.33x larger)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(2)
      setError(`❌ حجم الملف كبير جداً (${sizeMB}MB). الحد الأقصى 5MB`)
      return
    }

    // Validate file name length
    if (file.name.length > 255) {
      setError('❌ اسم الملف طويل جداً')
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
      // ===== COMPREHENSIVE VALIDATION =====
      if (!companyData.name?.trim()) throw new Error('❌ اسم الشركة مطلوب')
      if (companyData.name.trim().length < 3) throw new Error('❌ اسم الشركة يجب أن يكون 3 أحرف على الأقل')
      if (companyData.name.trim().length > 255) throw new Error('❌ اسم الشركة طويل جداً')

      if (!companyData.sector?.trim()) throw new Error('❌ القطاع مطلوب')
      if (!companyData.city?.trim()) throw new Error('❌ المدينة مطلوبة')
      if (!companyData.email?.trim()) throw new Error('❌ البريد الإلكتروني مطلوب')

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(companyData.email)) throw new Error('❌ صيغة البريد الإلكتروني غير صحيحة')

      if (!crFile) throw new Error('❌ رفع السجل التجاري مطلوب')
      if (crFile.size === 0) throw new Error('❌ الملف فارغ')

      // ===== FILE UPLOAD =====
      let crFileUrl = null
      const supabase = getSupabase()

      try {
        // Try Supabase Storage first
        const fileName = `cr_${Date.now()}_${crFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`

        try {
          await ensureStorageBucket('company-documents')
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('company-documents')
            .upload(`cr-files/${fileName}`, crFile)

          if (!uploadError && uploadData?.path) {
            crFileUrl = uploadData.path
          }
        } catch (storageError) {
          console.warn('⚠️ Storage fallback:', storageError)
        }

        // If storage failed, use base64
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
      } catch (fileError) {
        throw new Error('❌ فشل معالجة الملف: ' + fileError.message)
      }

      // ===== CREATE TENANT =====
      try {
        await createTenantAndUser(user.id, {
          name: companyData.name.trim(),
          crNumber: companyData.crNumber?.trim() || '',
          email: (companyData.email || user.primaryEmailAddress?.emailAddress).toLowerCase().trim(),
          phone: companyData.phone?.trim() || '',
          city: companyData.city?.trim() || '',
          sector: companyData.sector?.trim() || '',
          foundedYear: companyData.foundedYear,
          crStatus: companyData.crStatus || 'active',
          crFileUrl: crFileUrl,
          status: 'pending',
          firstName: user.firstName || '',
          lastName: user.lastName || ''
        })
      } catch (tenantError) {
        throw new Error(tenantError.message)
      }

      // ===== SUCCESS =====
      setError('')
      alert('✅ تم رفع بيانات شركتك بنجاح!\n\n⏳ سيتم مراجعة السجل التجاري من قبل فريق مرصد\n📧 ستتلقى إشعار عند اكتمال المراجعة')
      // Redirect to pending approval screen (not dashboard)
      navigate('/account-pending', { replace: true })
    } catch (err) {
      setError(err.message || '❌ حدث خطأ غير متوقع')
      console.error('Registration error:', err)
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
