import { useNavigate } from 'react-router-dom'

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#F8FAFC',
      padding: '20px',
      direction: 'rtl',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '500px' }}>
        <div style={{
          fontSize: '120px',
          fontWeight: 900,
          color: '#DC2626',
          margin: '0 0 20px 0',
        }}>
          404
        </div>

        <h1 style={{
          fontSize: '32px',
          fontWeight: 900,
          color: '#0F172A',
          margin: '0 0 12px 0',
        }}>
          الصفحة غير موجودة
        </h1>

        <p style={{
          fontSize: '16px',
          color: '#64748B',
          margin: '0 0 32px 0',
          lineHeight: '1.6',
        }}>
          للأسف، الصفحة التي تبحث عنها غير موجودة أو تم حذفها.
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              padding: '12px 32px',
              background: '#16A34A',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            الذهاب للرئيسية
          </button>

          <button
            onClick={() => navigate(-1)}
            style={{
              padding: '12px 32px',
              background: '#F8FAFC',
              color: '#1E2A52',
              border: '1.5px solid #E2E8F0',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            العودة للخلف
          </button>
        </div>
      </div>
    </div>
  )
}
