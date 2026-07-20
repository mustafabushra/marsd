import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertIcon } from '../components/icons'
import { useAuth } from '../context/AuthContext'

/**
 * Register Page
 * Handles company account registration
 * Uses centralized auth context for state management
 * Tokens and user data automatically persisted to localStorage
 */
export default function Register() {
  const navigate = useNavigate()
  const { register, isLoading } = useAuth()

  const [formData, setFormData] = useState({
    company: '',
    commercialNumber: '',
    sector: '',
    city: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
    terms: false
  })
  const [error, setError] = useState('')

  const handleChange = (e) => {
    const { name, type, checked, value } = e.target
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Validation
    if (!formData.company || !formData.email || !formData.password || !formData.terms) {
      setError('جميع الحقول مطلوبة')
      return
    }
    if (formData.password !== formData.confirmPassword) {
      setError('كلمات المرور غير متطابقة')
      return
    }

    try {
      // Call register through auth context
      await register({
        name: formData.company,
        crNumber: formData.commercialNumber,
        sector: formData.sector,
        city: formData.city,
        phone: formData.phone,
        email: formData.email,
        password: formData.password,
      })
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'فشل إنشاء الحساب')
    }
  }

  return (
    <main style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '50px 28px 70px',
      minHeight: 'calc(100vh - 70px)'
    }}>
      <div style={{
        background: '#fff',
        border: '1px solid #E2E8F0',
        borderRadius: '20px',
        padding: '42px',
        width: '100%',
        maxWidth: '560px',
        boxShadow: '0 24px 60px rgba(15, 23, 42, 0.1)'
      }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: 900,
          color: '#0F172A',
          margin: '0 0 8px 0',
          textAlign: 'right'
        }}>
          إنشاء حساب شركة
        </h1>
        <p style={{
          fontSize: '15px',
          color: '#64748B',
          margin: '0 0 28px 0',
          textAlign: 'right'
        }}>
          انضم لمنصة مرصد وابدأ بتقييم شركائك خلال دقائق
        </p>

        {error && (
          <div style={{
            background: '#FEE2E2',
            color: '#991B1B',
            padding: '12px 14px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertIcon />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px'
          }}>
            <div style={{ gridColumn: '1/3' }}>
              <label style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#334155',
                display: 'block',
                marginBottom: '7px',
                textAlign: 'right'
              }}>
                اسم الشركة
              </label>
              <input
                type="text"
                name="company"
                value={formData.company}
                onChange={handleChange}
                placeholder="شركة نجد للمقاولات المحدودة"
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '15px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>

            <div>
              <label style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#334155',
                display: 'block',
                marginBottom: '7px',
                textAlign: 'right'
              }}>
                رقم السجل التجاري
              </label>
              <input
                type="text"
                name="commercialNumber"
                value={formData.commercialNumber}
                onChange={handleChange}
                placeholder="1010234567"
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '15px',
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
                marginBottom: '7px',
                textAlign: 'right'
              }}>
                القطاع
              </label>
              <input
                type="text"
                name="sector"
                value={formData.sector}
                onChange={handleChange}
                placeholder="مقاولات"
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '15px',
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
                marginBottom: '7px',
                textAlign: 'right'
              }}>
                المدينة
              </label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="الرياض"
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '15px',
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
                marginBottom: '7px',
                textAlign: 'right'
              }}>
                رقم الجوال
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="05XXXXXXXX"
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '15px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ gridColumn: '1/3' }}>
              <label style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#334155',
                display: 'block',
                marginBottom: '7px',
                textAlign: 'right'
              }}>
                البريد الإلكتروني
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="company@example.com"
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '15px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>

            <div>
              <label style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#334155',
                display: 'block',
                marginBottom: '7px',
                textAlign: 'right'
              }}>
                كلمة المرور
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '15px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>

            <div>
              <label style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#334155',
                display: 'block',
                marginBottom: '7px',
                textAlign: 'right'
              }}>
                تأكيد كلمة المرور
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '15px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>
          </div>

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            margin: '22px 0',
            fontSize: '14px',
            color: '#475569',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              name="terms"
              checked={formData.terms}
              onChange={handleChange}
              style={{
                width: '18px',
                height: '18px',
                accentColor: '#16A34A'
              }}
            />
            أوافق على <span style={{ color: '#16A34A', fontWeight: 700 }}>الشروط والأحكام</span> وسياسة الخصوصية
          </label>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              background: isLoading ? '#CCCCCC' : '#16A34A',
              color: '#fff',
              border: 0,
              borderRadius: '11px',
              padding: '14px',
              fontSize: '16px',
              fontWeight: 800,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              opacity: isLoading ? 0.7 : 1
            }}
            onMouseEnter={e => !isLoading && (e.target.style.opacity = '0.9')}
            onMouseLeave={e => !isLoading && (e.target.style.opacity = '1')}
          >
            {isLoading ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
          </button>

          <p style={{
            textAlign: 'center',
            fontSize: '14.5px',
            color: '#64748B',
            margin: '22px 0 0'
          }}>
            لديك حساب؟{' '}
            <span
              onClick={() => navigate('/login')}
              style={{
                color: '#16A34A',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              تسجيل الدخول
            </span>
          </p>
        </form>
      </div>
    </main>
  )
}
