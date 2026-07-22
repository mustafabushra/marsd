import { Outlet, useNavigate } from 'react-router-dom'
import ClerkNavBar from './ClerkNavBar'

export default function VisitorShell() {
  const navigate = useNavigate()

  return (
    <div dir="rtl" style={{ fontFamily: 'Tajawal, system-ui, sans-serif', background: '#F8FAFC', minHeight: '100vh', color: '#0F172A' }}>
      <ClerkNavBar />

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
