import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

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

  const handleChange = (field, value) => {
    setCompanyData(prev => ({
      ...prev,
      [field]: value
    }))
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

      if (tenantError) throw new Error(tenantError.message)

      const tenantId = tenantData.id

      // 2. Update User with tenant_id
      const { error: userError } = await supabase
        .from('users')
        .upsert([{
          id: user.id,
          tenant_id: tenantId,
          email: user.primaryEmailAddress?.emailAddress,
          role: 'company_admin',
          status: 'active'
        }])

      if (userError) throw new Error(userError.message)

      // 3. Create Company Record
      await supabase
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

      // Success
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
              <input
                type="text"
                value={companyData.sector}
                onChange={(e) => handleChange('sector', e.target.value)}
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

          {/* Submit */}
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
