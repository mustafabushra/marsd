import { Outlet, useNavigate } from 'react-router-dom'

export default function VisitorShell() {
  const navigate = useNavigate()

  return (
    <div dir="rtl" style={{ fontFamily: 'Tajawal, system-ui, sans-serif', background: '#F8FAFC', minHeight: '100vh', color: '#0F172A' }}>
      {/* Header */}
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
                { label: 'الرئيسية', path: '/', color: '#16A34A' },
                { label: 'عن المنصة', path: '/about', color: '#475569' },
                { label: 'الباقات', path: '/pricing', color: '#475569' },
                { label: 'الشركاء', path: '/partners', color: '#475569' },
                { label: 'الأسئلة الشائعة', path: '/faq', color: '#475569' },
                { label: 'تواصل معنا', path: '/contact', color: '#475569' },
              ].map(nav => (
                <span
                  key={nav.path}
                  onClick={() => navigate(nav.path)}
                  style={{
                    fontSize: '15px',
                    fontWeight: nav.color === '#16A34A' ? 700 : 600,
                    color: nav.color,
                    cursor: 'pointer'
                  }}
                >
                  {nav.label}
                </span>
              ))}
            </nav>
          </div>

          {/* Auth Buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => navigate('/login')}
              style={{
                background: '#fff',
                color: '#1E2A52',
                border: '1.5px solid #E2E8F0',
                borderRadius: '10px',
                padding: '10px 22px',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              تسجيل الدخول
            </button>
            <button
              onClick={() => navigate('/register')}
              style={{
                background: '#1E2A52',
                color: '#fff',
                border: 0,
                borderRadius: '10px',
                padding: '10px 22px',
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              إنشاء حساب
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>
        <Outlet />
      </main>

      {/* Footer */}
      <footer style={{ background: '#0F172A', color: '#CBD5E1', padding: '48px 28px 34px' }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '30px',
          borderBottom: '1px solid rgba(255,255,255,.1)',
          paddingBottom: '30px'
        }}>
          <div style={{ maxWidth: '320px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <span style={{ fontSize: '21px', fontWeight: 900, color: '#fff' }}>مرصد</span>
            </div>
            <p style={{ fontSize: '14px', lineHeight: '1.7', color: '#94A3B8', margin: 0 }}>
              المرجع الموثوق لتقييم موثوقية شركاء الأعمال في السوق السعودي والخليجي.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '60px' }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '15px', marginBottom: '14px' }}>المنصة</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '11px', fontSize: '14px' }}>
                {['عن المنصة', 'الباقات', 'الشركاء', 'كيف تعمل'].map(item => (
                  <span key={item} style={{ cursor: 'pointer' }}>{item}</span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '15px', marginBottom: '14px' }}>قانوني</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '11px', fontSize: '14px' }}>
                {['سياسة الخصوصية', 'الشروط والأحكام', 'حماية بيانات المبلّغين'].map(item => (
                  <span key={item} style={{ cursor: 'pointer' }}>{item}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div style={{
          maxWidth: '1200px',
          margin: '18px auto 0',
          fontSize: '13px',
          color: '#64748B'
        }}>
          © 2026 مرصد. جميع الحقوق محفوظة.
        </div>
      </footer>
    </div>
  )
}
