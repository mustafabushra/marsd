import { useState } from 'react'

export default function AdminIntegrations() {
  const [integrations, setIntegrations] = useState([
    { id: 1, name: 'Stripe', category: 'المدفوعات', status: 'connected', apiKey: 'sk_live_****', lastSync: '2026-07-15 14:30' },
    { id: 2, name: 'AWS S3', category: 'التخزين', status: 'connected', apiKey: 'AKIAIOSFODNN7EXAMPL', lastSync: '2026-07-15 12:00' },
    { id: 3, name: 'SendGrid', category: 'البريد الإلكتروني', status: 'connected', apiKey: 'SG.*****', lastSync: '2026-07-15 15:45' },
    { id: 4, name: 'Slack', category: 'الإشعارات', status: 'disconnected', apiKey: null, lastSync: null },
    { id: 5, name: 'Google Analytics', category: 'التحليلات', status: 'connected', apiKey: 'UA-****-*', lastSync: '2026-07-15 00:00' },
  ])

  const [selectedIntegration, setSelectedIntegration] = useState(null)
  const [testResult, setTestResult] = useState(null)

  const handleTestConnection = async (id) => {
    try {
      setTestResult({ status: 'testing', id })
      setTimeout(() => {
        setTestResult({ status: 'success', id })
        setTimeout(() => setTestResult(null), 3000)
      }, 1000)
    } catch (err) {
      setTestResult({ status: 'error', id })
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row-reverse' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
            التكاملات الخارجية
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
            إدارة التكاملات مع الخدمات الخارجية
          </p>
        </div>
        <button style={{
          padding: '10px 20px',
          background: '#16A34A',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 700,
          cursor: 'pointer',
        }}>
          + تكامل جديد
        </button>
      </div>

      {/* Integrations Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
        {integrations.map(integration => (
          <div
            key={integration.id}
            style={{
              background: '#fff',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '20px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onClick={() => setSelectedIntegration(integration)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', flexDirection: 'row-reverse' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  {integration.name}
                </h3>
                <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0' }}>
                  {integration.category}
                </p>
              </div>
              <span style={{
                padding: '4px 12px',
                background: integration.status === 'connected' ? '#DCFCE7' : '#FEE2E2',
                color: integration.status === 'connected' ? '#15803D' : '#DC2626',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
              }}>
                {integration.status === 'connected' ? '✓ متصل' : '✗ غير متصل'}
              </span>
            </div>

            {integration.status === 'connected' && (
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #F1F5F9' }}>
                آخر تحديث: {integration.lastSync}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleTestConnection(integration.id)
                }}
                disabled={integration.status === 'disconnected'}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: testResult?.id === integration.id && testResult?.status === 'success' ? '#DCFCE7' : '#E0F2FE',
                  color: testResult?.id === integration.id && testResult?.status === 'success' ? '#15803D' : '#0369A1',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: integration.status === 'disconnected' ? 'not-allowed' : 'pointer',
                  opacity: integration.status === 'disconnected' ? 0.5 : 1,
                }}
              >
                {testResult?.id === integration.id ? (
                  testResult?.status === 'testing' ? 'جاري الاختبار...' : '✓ نجح'
                ) : (
                  'اختبار'
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedIntegration(integration)
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: '#F8FAFC',
                  color: '#1E2A52',
                  border: '1px solid #E2E8F0',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                إعدادات
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Detail Modal */}
      {selectedIntegration && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '24px',
            width: '90%',
            maxWidth: '500px',
            maxHeight: '80vh',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexDirection: 'row-reverse' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                {selectedIntegration.name}
              </h2>
              <button
                onClick={() => setSelectedIntegration(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  color: '#94A3B8',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {selectedIntegration.status === 'connected' ? (
              <div>
                <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 6px 0', textAlign: 'right' }}>حالة الاتصال:</p>
                  <p style={{ fontSize: '13px', color: '#15803D', margin: 0, fontWeight: 600, textAlign: 'right' }}>
                    ✓ متصل بنجاح
                  </p>
                </div>

                <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 6px 0', textAlign: 'right' }}>مفتاح API:</p>
                  <p style={{ fontSize: '12px', color: '#0F172A', margin: 0, fontFamily: 'monospace', textAlign: 'right' }}>
                    {selectedIntegration.apiKey}
                  </p>
                </div>

                <div style={{ background: '#F8FAFC', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 6px 0', textAlign: 'right' }}>آخر تحديث:</p>
                  <p style={{ fontSize: '13px', color: '#0F172A', margin: 0, textAlign: 'right' }}>
                    {selectedIntegration.lastSync}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '12px', flexDirection: 'row-reverse' }}>
                  <button
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      background: '#FEE2E2',
                      color: '#DC2626',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    قطع الاتصال
                  </button>
                  <button
                    onClick={() => setSelectedIntegration(null)}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      background: '#F8FAFC',
                      color: '#1E2A52',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ background: '#FEE2E2', borderRadius: '8px', padding: '16px', marginBottom: '16px', textAlign: 'center' }}>
                  <p style={{ fontSize: '13px', color: '#DC2626', margin: 0, fontWeight: 600 }}>
                    غير متصل حالياً
                  </p>
                </div>

                <textarea
                  placeholder="أدخل مفتاح API..."
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: '12px 14px',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontFamily: 'Tajawal',
                    textAlign: 'right',
                    marginBottom: '16px',
                  }}
                />

                <button
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    background: '#16A34A',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    marginBottom: '8px',
                  }}
                >
                  متابعة التوصيل
                </button>
                <button
                  onClick={() => setSelectedIntegration(null)}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    background: '#F8FAFC',
                    color: '#1E2A52',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  إلغاء
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
