import { useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { useNavigate } from 'react-router-dom'
import { getSupabase } from '../lib/api'

export default function BusinessRequests() {
  const navigate = useNavigate()
  const { user } = useUser()
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState([])

  useEffect(() => {
    const loadRequests = async () => {
      try {
        const supabase = getSupabase()

        // Get current user's tenant
        const { data: userData } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', user?.id)
          .single()

        if (!userData?.tenant_id) {
          setLoading(false)
          return
        }

        // Get sent and received requests
        const { data: sentRequests } = await supabase
          .from('business_requests')
          .select('*')
          .eq('from_tenant_id', userData.tenant_id)
          .order('created_at', { ascending: false })

        const { data: receivedRequests } = await supabase
          .from('business_requests')
          .select('*')
          .eq('to_tenant_id', userData.tenant_id)
          .order('created_at', { ascending: false })

        const formatted = [
          ...(sentRequests || []).map(r => ({
            id: r.id,
            from: r.subject || 'طلب تعاون',
            type: 'sent',
            subject: r.subject || 'طلب',
            message: r.description || '',
            date: new Date(r.created_at).toLocaleDateString('ar-SA'),
            status: r.status || 'pending'
          })),
          ...(receivedRequests || []).map(r => ({
            id: r.id,
            from: r.subject || 'طلب تعاون',
            type: 'received',
            subject: r.subject || 'طلب',
            message: r.description || '',
            date: new Date(r.created_at).toLocaleDateString('ar-SA'),
            status: r.status || 'pending'
          }))
        ]

        setRequests(formatted)
      } catch (err) {
        console.error('Error loading requests:', err)
      } finally {
        setLoading(false)
      }
    }

    if (user?.id) {
      loadRequests()
    }
  }, [user?.id])

  const [tab, setTab] = useState('all')

  if (loading) {
    return (
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)' }}>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'spin 2s linear infinite' }}>⏳</div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#64748B' }}>جاري تحميل طلبات الأعمال...</div>
        </div>
      </main>
    )
  }

  const filteredRequests = tab === 'all'
    ? requests
    : tab === 'sent'
    ? requests.filter(r => r.type === 'sent')
    : requests.filter(r => r.type === 'received')

  const handleAccept = async (id) => {
    try {
      const supabase = getSupabase()
      await supabase
        .from('business_requests')
        .update({ status: 'accepted' })
        .eq('id', id)
      setRequests(requests.map(r => r.id === id ? { ...r, status: 'accepted' } : r))
    } catch (err) {
      console.error('Error accepting request:', err)
    }
  }

  const handleReject = async (id) => {
    try {
      const supabase = getSupabase()
      await supabase
        .from('business_requests')
        .update({ status: 'rejected' })
        .eq('id', id)
      setRequests(requests.map(r => r.id === id ? { ...r, status: 'rejected' } : r))
    } catch (err) {
      console.error('Error rejecting request:', err)
    }
  }

  return (
    <main style={{ padding: '28px 32px', background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)', minHeight: '100vh' }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '28px', animation: 'fadeIn 0.6s ease-out' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0', textAlign: 'right' }}>
            🤝 طلبات الأعمال
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
            إدارة طلبات التعاون والشراكات التجارية بسهولة وأمان
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexDirection: 'row-reverse' }}>
          {[
            { id: 'all', label: 'الكل', count: requests.length },
            { id: 'received', label: 'المستقبلة', count: requests.filter(r => r.type === 'received').length },
            { id: 'sent', label: 'المرسلة', count: requests.filter(r => r.type === 'sent').length }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '10px 20px',
                background: tab === t.id ? 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)' : '#fff',
                color: tab === t.id ? '#fff' : '#1E2A52',
                border: tab === t.id ? '0' : '2px solid #E2E8F0',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: tab === t.id ? 800 : 600,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: tab === t.id ? '0 4px 12px rgba(22, 163, 74, 0.25)' : 'none'
              }}
              onMouseEnter={(e) => {
                if (tab !== t.id) {
                  e.target.style.borderColor = '#D1D5DB'
                }
              }}
              onMouseLeave={(e) => {
                if (tab !== t.id) {
                  e.target.style.borderColor = '#E2E8F0'
                }
              }}>
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {/* Requests List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', animation: 'fadeIn 0.6s ease-out 0.1s both' }}>
          {filteredRequests.map((request, idx) => (
            <div
              key={request.id}
              style={{
                background: '#fff',
                border: '2px solid #E2E8F0',
                borderRadius: '16px',
                padding: '22px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                transition: 'all 0.3s ease',
                animation: `fadeIn 0.6s ease-out ${0.1 + idx * 0.08}s both`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.1)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexDirection: 'row-reverse' }}>
                <div style={{ textAlign: 'right', flex: 1 }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>
                    {request.subject}
                  </h3>
                  <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                    {request.type === 'sent' ? '📤 مرسل إلى:' : '📥 مستقبل من:'} {request.from}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    background: request.status === 'pending' ? 'linear-gradient(135deg, #FEF3C7 0%, #FEE68A 100%)' : request.status === 'accepted' ? 'linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)' : 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
                    color: request.status === 'pending' ? '#B45309' : request.status === 'accepted' ? '#15803D' : '#B91C1C',
                    border: request.status === 'pending' ? '1px solid #FDE68A' : request.status === 'accepted' ? '1px solid #BBF7D0' : '1px solid #FECACA'
                  }}>
                    {request.status === 'pending' ? '⏳ قيد الانتظار' : request.status === 'accepted' ? '✅ مقبول' : '❌ مرفوض'}
                  </span>
                  <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>
                    {request.date}
                  </span>
                </div>
              </div>

              {/* Message */}
              <p style={{ fontSize: '14px', color: '#475569', margin: '0 0 4px 0', textAlign: 'right', lineHeight: '1.6' }}>
                {request.message}
              </p>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px', flexDirection: 'row-reverse' }}>
                {request.type === 'received' && request.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleAccept(request.id)}
                      style={{
                        flex: 1,
                        padding: '12px 16px',
                        background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                        color: '#fff',
                        border: '0',
                        borderRadius: '12px',
                        fontSize: '14px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.transform = 'translateY(-2px)'
                        e.target.style.boxShadow = '0 6px 16px rgba(22, 163, 74, 0.35)'
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.transform = 'translateY(0)'
                        e.target.style.boxShadow = '0 4px 12px rgba(22, 163, 74, 0.25)'
                      }}>
                      ✓ قبول
                    </button>
                    <button
                      onClick={() => handleReject(request.id)}
                      style={{
                        flex: 1,
                        padding: '12px 16px',
                        background: '#FEE2E2',
                        color: '#DC2626',
                        border: '2px solid #FEE2E2',
                        borderRadius: '12px',
                        fontSize: '14px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.3s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = '#FECACA'
                        e.target.style.borderColor = '#FECACA'
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = '#FEE2E2'
                        e.target.style.borderColor = '#FEE2E2'
                      }}>
                      ✕ رفض
                    </button>
                  </>
                )}
                <button
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
                    color: '#3730A3',
                    border: '2px solid #E0E7FF',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = 'linear-gradient(135deg, #DDD6FE 0%, #C7D2FE 100%)'
                    e.target.style.borderColor = '#C7D2FE'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)'
                    e.target.style.borderColor = '#E0E7FF'
                  }}>
                  → عرض التفاصيل
                </button>
              </div>
            </div>
          ))}
        </div>

        {filteredRequests.length === 0 && (
          <div style={{
            background: '#fff',
            border: '2px dashed #CBD5E1',
            borderRadius: '16px',
            padding: '48px 32px',
            textAlign: 'center',
            animation: 'fadeIn 0.6s ease-out 0.2s both'
          }}>
            <p style={{ fontSize: '48px', margin: '0 0 12px 0' }}>📭</p>
            <p style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: '0 0 8px 0' }}>لا توجد طلبات</p>
            <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>لم تصل أي طلبات في هذه الفئة حالياً</p>
          </div>
        )}
      </div>
    </main>
  )
}
