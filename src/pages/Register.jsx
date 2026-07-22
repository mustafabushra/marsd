import { SignUp } from '@clerk/react'

export default function Register() {
  return (
    <main style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '50px 28px 70px',
      minHeight: 'calc(100vh - 70px)',
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
            إنشاء حساب شركة
          </h1>
          <p style={{
            fontSize: '15px',
            color: '#64748B',
            margin: 0
          }}>
            انضم إلى مرصد وابدأ تقييم شركائك خلال دقائق
          </p>
        </div>

        <SignUp
          appearance={{
            elements: {
              rootBox: 'w-full',
              card: 'shadow-lg rounded-2xl',
              formButtonPrimary: 'bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-3 font-semibold',
              formFieldInput: 'border border-gray-200 rounded-lg px-4 py-3',
            }
          }}
          redirectUrl="/dashboard"
          signInUrl="/login"
        />

        <p style={{
          textAlign: 'center',
          marginTop: '20px',
          fontSize: '14px',
          color: '#64748B'
        }}>
          هل لديك حساب بالفعل؟{' '}
          <a
            href="/login"
            style={{
              color: '#3B82F6',
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
      </div>
    </main>
  )
}
