import { SignIn } from '@clerk/react'
import { useNavigate } from 'react-router-dom'

export default function AdminLogin() {
  const navigate = useNavigate()

  return (
    <main style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '50px 28px',
      minHeight: '100vh',
      background: '#F8FAFC'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px'
      }}>
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <h1 style={{
            fontSize: '28px',
            fontWeight: 900,
            color: '#0F172A',
            margin: '0 0 8px 0'
          }}>
            دخول الإدارة
          </h1>
          <p style={{
            fontSize: '15px',
            color: '#64748B',
            margin: 0
          }}>
            لوحة التحكم الإدارية لمنصة مرصد
          </p>
        </div>

        <SignIn
          appearance={{
            elements: {
              rootBox: 'w-full',
              card: 'shadow-lg rounded-2xl',
              formButtonPrimary: 'bg-red-600 hover:bg-red-700 text-white rounded-lg py-3 font-semibold',
              formFieldInput: 'border border-gray-200 rounded-lg px-4 py-3',
            }
          }}
          redirectUrl="/admin"
          signUpUrl="/register"
        />

        <p style={{
          textAlign: 'center',
          marginTop: '20px',
          fontSize: '14px',
          color: '#64748B'
        }}>
          دخول عادي؟{' '}
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
            تسجيل دخول للشركات
          </a>
        </p>
      </div>
    </main>
  )
}
