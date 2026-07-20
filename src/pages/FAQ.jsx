import { useNavigate } from 'react-router-dom'
import { mockFAQs } from '../data/mockData'

export default function FAQ() {
  const navigate = useNavigate()

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '60px 28px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <div style={{
          display: 'inline-flex',
          background: '#EEF2FF',
          color: '#1E2A52',
          borderRadius: '999px',
          padding: '7px 16px',
          fontSize: '13.5px',
          fontWeight: 800,
          marginBottom: '18px',
          lineHeight: '1.5'
        }}>
          مركز المساعدة
        </div>
        <h1 style={{
          fontSize: '40px',
          fontWeight: 900,
          color: '#0F172A',
          margin: '0 0 14px 0',
          lineHeight: '1.3',
          textAlign: 'right'
        }}>
          الأسئلة الشائعة
        </h1>
        <p style={{
          fontSize: '18px',
          color: '#64748B',
          margin: '0 0 0 0',
          textAlign: 'right'
        }}>
          كل ما تحتاج معرفته عن منصة مرصد وكيفية عملها
        </p>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}>
        {mockFAQs.map((faq, i) => (
          <div
            key={i}
            style={{
              background: '#fff',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: '26px 28px'
            }}
          >
            <div style={{
              display: 'flex',
              gap: '14px',
              alignItems: 'flex-start',
              flexDirection: 'row-reverse'
            }}>
              <span style={{
                width: '30px',
                height: '30px',
                borderRadius: '9px',
                background: '#ECFDF5',
                color: '#15803D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                fontWeight: 900,
                flex: 'none'
              }}>
                ؟
              </span>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <h3 style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  color: '#1E2A52',
                  margin: '0 0 10px 0',
                  lineHeight: '1.5'
                }}>
                  {faq.q}
                </h3>
                <p style={{
                  fontSize: '15.5px',
                  color: '#64748B',
                  lineHeight: '1.85',
                  margin: 0
                }}>
                  {faq.a}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        background: '#1E2A52',
        borderRadius: '20px',
        padding: '40px',
        textAlign: 'center',
        color: '#fff',
        marginTop: '34px'
      }}>
        <h2 style={{
          fontSize: '24px',
          fontWeight: 900,
          margin: '0 0 10px 0'
        }}>
          لم تجد إجابتك؟
        </h2>
        <p style={{
          fontSize: '16px',
          color: '#CBD5E1',
          margin: '0 0 24px 0'
        }}>
          فريق مرصد جاهز لمساعدتك في أي استفسار
        </p>
        <button
          onClick={() => navigate('/contact')}
          style={{
            background: '#16A34A',
            color: '#fff',
            border: 0,
            borderRadius: '11px',
            padding: '14px 32px',
            fontSize: '16px',
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => e.target.style.opacity = '0.9'}
          onMouseLeave={e => e.target.style.opacity = '1'}
        >
          تواصل معنا
        </button>
      </div>
    </main>
  )
}
