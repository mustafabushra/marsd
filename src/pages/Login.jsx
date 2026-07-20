import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertIcon } from '../components/icons'
import { useAuth } from '../context/AuthContext'

/**
 * Login Page
 * Handles user authentication
 * Uses centralized auth context for state management
 * Tokens and user data automatically persisted to localStorage
 */
export default function Login() {
  const navigate = useNavigate()
  const { login, isLoading, error: authError } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    try {
      if (!email || !password) {
        setError('جميع الحقول مطلوبة')
        return
      }

      // Call login through auth context
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'فشل تسجيل الدخول')
    }
  }

  const handleAdminLogin = async () => {
    // Admin login with demo credentials
    setError('')
    try {
      await login('test1@marsad.sa', 'Test@1234')
      navigate('/admin')
    } catch (err) {
      setError(err.message || 'فشل تسجيل الدخول')
    }
  }

  return (
    <main style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '50px 28px',
      minHeight: 'calc(100vh - 70px)'
    }}>
      <div style={{
        background: '#fff',
        border: '1px solid #E2E8F0',
        borderRadius: '20px',
        padding: '42px',
        width: '100%',
        maxWidth: '430px',
        boxShadow: '0 24px 60px rgba(15, 23, 42, 0.1)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <h1 style={{
            fontSize: '26px',
            fontWeight: 900,
            color: '#0F172A',
            margin: '0 0 6px 0',
            textAlign: 'right'
          }}>
            تسجيل الدخول
          </h1>
          <p style={{
            fontSize: '15px',
            color: '#64748B',
            margin: '0 0 0 0',
            textAlign: 'right'
          }}>
            أهلاً بعودتك إلى مرصد
          </p>
        </div>

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
          <label style={{
            fontSize: '14px',
            fontWeight: 700,
            color: '#334155',
            display: 'block',
            marginBottom: '7px'
          }}>
            البريد الإلكتروني
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="company@example.com"
            style={{
              width: '100%',
              border: '1.5px solid #E2E8F0',
              borderRadius: '10px',
              padding: '12px 14px',
              fontSize: '15px',
              outline: 'none',
              marginBottom: '18px',
              boxSizing: 'border-box'
            }}
            required
          />

          <label style={{
            fontSize: '14px',
            fontWeight: 700,
            color: '#334155',
            display: 'block',
            marginBottom: '7px'
          }}>
            كلمة المرور
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{
              width: '100%',
              border: '1.5px solid #E2E8F0',
              borderRadius: '10px',
              padding: '12px 14px',
              fontSize: '15px',
              outline: 'none',
              marginBottom: '16px',
              boxSizing: 'border-box'
            }}
            required
          />

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '22px'
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              color: '#475569',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                style={{
                  width: '17px',
                  height: '17px',
                  accentColor: '#16A34A'
                }}
              />
              تذكّرني
            </label>
            <span
              style={{
                fontSize: '14px',
                color: '#16A34A',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              نسيت كلمة المرور؟
            </span>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              background: isLoading ? '#CCCCCC' : '#1E2A52',
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
            {isLoading ? 'جاري التحقق...' : 'تسجيل الدخول'}
          </button>

          <p style={{
            textAlign: 'center',
            fontSize: '14.5px',
            color: '#64748B',
            margin: '22px 0 0'
          }}>
            ليس لديك حساب؟{' '}
            <span
              onClick={() => navigate('/register')}
              style={{
                color: '#16A34A',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              إنشاء حساب جديد
            </span>
          </p>
        </form>

        <div style={{
          textAlign: 'center',
          marginTop: '12px',
          fontSize: '13px',
          color: '#64748B',
        }}>
          <button
            onClick={() => navigate('/forgot-password')}
            style={{
              background: 'none',
              border: 'none',
              color: '#16A34A',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            هل نسيت كلمة المرور؟
          </button>
        </div>

        <div style={{
          textAlign: 'center',
          marginTop: '24px',
          padding: '12px',
          background: '#F8FAFC',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 700,
          color: '#16A34A'
        }}
        onClick={handleAdminLogin}>
          دخول الإدارة
        </div>
      </div>
    </main>
  )
}
