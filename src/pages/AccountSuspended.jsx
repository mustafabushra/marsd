import { useNavigate } from 'react-router-dom'

export default function AccountSuspended() {
  const navigate = useNavigate()

  return (
    <main
      dir="rtl"
      style={{
        background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: 'Tajawal, system-ui, sans-serif'
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '20px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          padding: '50px 40px',
          maxWidth: '500px',
          textAlign: 'center'
        }}
      >
        <div style={{ fontSize: '80px', marginBottom: '20px' }}>🔒</div>
        <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px 0' }}>
          تم تعليق الحساب
        </h1>
        <p style={{ fontSize: '16px', color: '#64748B', lineHeight: 1.6, margin: '0 0 24px 0' }}>
          حسابك قد تم تعليقه مؤقتاً من قبل فريق مرصد.
        </p>
        <p style={{ fontSize: '14px', color: '#94A3B8', margin: '0 0 32px 0' }}>
          يرجى التواصل مع فريق الدعم للحصول على المساعدة
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={() => navigate('/', { replace: true })}
            style={{
              background: '#F59E0B',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 24px',
              fontSize: '15px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            العودة للرئيسية
          </button>
        </div>
      </div>
    </main>
  )
}
