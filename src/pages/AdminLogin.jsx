import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertIcon } from '../components/icons'
import { useAuth } from '../context/AuthContext'

export default function AdminLogin() {
  const navigate = useNavigate()
  const { login, isLoading } = useAuth()

  const [email, setEmail] = useState('test1@marsad.sa')
  const [password, setPassword] = useState('Test@1234')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    try {
      if (!email || !password) {
        setError('جميع الحقول مطلوبة')
        return
      }

      await login(email, password)
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
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1E2A52 0%, #0F172A 100%)'
    }}>
      <div style={{
        background: '#fff',
        border: '1px solid #E2E8F0',
        borderRadius: '20px',
        padding: '42px',
        width: '100%',
        maxWidth: '430px',
        boxShadow: '0 24px 60px rgba(15, 23, 42, 0.2)'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: '#fff',
            fontSize: '32px',
            fontWeight: 900
          }}>
            ⚙️
          </div>
          <h1 style={{
            fontSize: '26px',
            fontWeight: 900,
            color: '#0F172A',
            margin: '0 0 6px 0',
            textAlign: 'right'
          }}>
            دخول الإدارة
          </h1>
          <p style={{
            fontSize: '15px',
            color: '#64748B',
            margin: '0',
            textAlign: 'right'
          }}>
            لوحة التحكم الإدارية لمنصة مرصد
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
            placeholder="admin@example.com"
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
              marginBottom: '22px',
              boxSizing: 'border-box'
            }}
            required
          />

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              background: isLoading ? '#CCCCCC' : '#DC2626',
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
            {isLoading ? 'جاري التحقق...' : 'دخول لوحة التحكم'}
          </button>

          <p style={{
            textAlign: 'center',
            fontSize: '13px',
            color: '#64748B',
            margin: '16px 0 0'
          }}>
            <span
              onClick={() => navigate('/login')}
              style={{
                color: '#16A34A',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              ← دخول عادي للشركات
            </span>
          </p>
        </form>
      </div>
    </main>
  )
}
