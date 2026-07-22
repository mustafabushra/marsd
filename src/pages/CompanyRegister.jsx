import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

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
  const [companyData, setCompanyData] = useState({
    name: '',
    crNumber: '',
    sector: '',
    city: '',
    foundedYear: new Date().getFullYear(),
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
    if (!companyData.crNumber.trim()) return 'رقم السجل التجاري مطلوب'
    if (!companyData.sector.trim()) return 'القطاع مطلوب'
    if (!companyData.city.trim()) return 'المدينة مطلوبة'
    if (!companyData.email.trim()) return 'البريد الإلكتروني مطلوب'
    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const validation = validateCompanyData()
      if (validation) {
        setError(validation)
        setLoading(false)
        return
      }

      if (!user) {
        setError('يجب تسجيل الدخول أولاً')
        setLoading(false)
        return
      }

      const supabase = getSupabase()

      // 1. Create Tenant
      const { data: tenantData, error: tenantError } = await supabase
        .from('tenants')
        .insert([{
          name: companyData.name,
          cr_number: companyData.crNumber,
          email: companyData.email,
          phone: companyData.phone,
          city: companyData.city,
          sector: companyData.sector,
          status: 'active'
        }])
        .select()
        .single()

      if (tenantError) {
        setError(`خطأ في إنشاء الحساب: ${tenantError.message}`)
        setLoading(false)
        return
      }

      const tenantId = tenantData.id

      // 2. Create User record
      const { error: userError } = await supabase
        .from('users')
        .upsert([{
          id: user.id,
          tenant_id: tenantId,
          email: user.primaryEmailAddress?.emailAddress,
          role: 'company_admin',
          status: 'active'
        }])

      if (userError) {
        setError(`خطأ في إنشاء ملف المستخدم: ${userError.message}`)
        setLoading(false)
        return
      }

      // 3. Create Company Record (searchable)
      const { error: companyError } = await supabase
        .from('companies')
        .insert([{
          name: companyData.name,
          cr_number: companyData.crNumber,
          sector: companyData.sector,
          city: companyData.city,
          founded_year: companyData.foundedYear,
          cr_status: companyData.crStatus,
          source: 'self_registered',
          approved: true
        }])

      if (companyError) {
        setError(`خطأ في إنشاء ملف الشركة: ${companyError.message}`)
        setLoading(false)
        return
      }

      // Success - redirect to dashboard
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'حدث خطأ غير متوقع')
    } finally {
      setLoading(false)
    }
  }

  if (!isLoaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        جاري التحميل...
      </div>
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
              <input
                type="text"
                value={companyData.sector}
                onChange={(e) => handleCompanyChange('sector', e.target.value)}
                placeholder="مثال: المقاولات"
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
                المدينة *
              </label>
              <input
                type="text"
                value={companyData.city}
                onChange={(e) => handleCompanyChange('city', e.target.value)}
                placeholder="مثال: الرياض"
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
                <option value="inactive">ملغى</option>
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
