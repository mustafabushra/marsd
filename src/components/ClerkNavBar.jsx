import { UserButton, SignInButton, SignUpButton, useUser } from '@clerk/react'
import { useNavigate } from 'react-router-dom'

export default function ClerkNavBar() {
  const navigate = useNavigate()
  const { isSignedIn } = useUser()

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 40,
      background: '#fff',
      borderBottom: '1px solid #E2E8F0'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '0 28px',
        height: '70px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {/* Logo & Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '38px' }}>
          <div
            onClick={() => navigate('/')}
            style={{ display: 'flex', alignItems: 'center', gap: '11px', cursor: 'pointer' }}
          >
            <svg width="40" height="40" viewBox="0 0 64 64">
              <defs>
                <linearGradient id="mkHdr" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0" stopColor="#1E2A52" />
                  <stop offset=".55" stopColor="#1F6E43" />
                  <stop offset="1" stopColor="#16A34A" />
                </linearGradient>
              </defs>
              <circle cx="32" cy="32" r="22.5" fill="none" stroke="url(#mkHdr)" strokeWidth="6.4" strokeLinecap="round" strokeDasharray="118 24" transform="rotate(-46 32 32)" />
              <path d="M22.5 33 l6.5 6.5 L41 26.5" fill="none" stroke="#16A34A" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontWeight: 900, fontSize: '23px', color: '#1E2A52', letterSpacing: '-0.5px' }}>مرصد</span>
          </div>

          <nav style={{ display: 'flex', gap: '28px' }}>
            {[
              { label: 'الرئيسية', path: '/' },
              { label: 'عن المنصة', path: '/about' },
              { label: 'الباقات', path: '/pricing' },
              { label: 'الشركاء', path: '/partners' },
              { label: 'الأسئلة الشائعة', path: '/faq' },
            ].map(nav => (
              <span
                key={nav.path}
                onClick={() => navigate(nav.path)}
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                {nav.label}
              </span>
            ))}
          </nav>
        </div>

        {/* Auth Section */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {isSignedIn ? (
            <>
              <button
                onClick={() => navigate('/admin')}
                style={{
                  background: '#DC2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 16px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = '#B91C1C'}
                onMouseLeave={(e) => e.target.style.background = '#DC2626'}
                title="لوحة الإدارة (مرصد فقط)"
              >
                الإدارة
              </button>
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: 'w-10 h-10',
                    userButtonBox: 'flex-row-reverse',
                  }
                }}
              />
            </>
          ) : (
            <>
              <button
                onClick={() => navigate('/admin-login')}
                style={{
                  background: '#DC2626',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 16px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = '#B91C1C'}
                onMouseLeave={(e) => e.target.style.background = '#DC2626'}
                title="تسجيل دخول الإدارة"
              >
                إدارة
              </button>

              <SignInButton mode="modal">
                <button style={{
                  background: '#fff',
                  color: '#1E2A52',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '10px 22px',
                  fontSize: '15px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                  onMouseEnter={(e) => {
                    e.target.style.background = '#F1F5F9'
                    e.target.style.borderColor = '#CBD5E1'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = '#fff'
                    e.target.style.borderColor = '#E2E8F0'
                  }}
                >
                  تسجيل دخول
                </button>
              </SignInButton>

              <SignUpButton mode="modal">
                <button style={{
                  background: '#1E2A52',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 22px',
                  fontSize: '15px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                  onMouseEnter={(e) => e.target.style.background = '#16213E'}
                  onMouseLeave={(e) => e.target.style.background = '#1E2A52'}
                >
                  إنشاء حساب
                </button>
              </SignUpButton>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
