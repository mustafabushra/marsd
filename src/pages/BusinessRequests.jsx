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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        جاري التحميل...
      </div>
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
    <div style={{ padding: '24px', background: '#F8FAFC', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
          طلبات الأعمال
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          إدارة طلبات التعاون والشراكات التجارية
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexDirection: 'row-reverse' }}>
        <button
          onClick={() => setTab('all')}
          style={{
            padding: '10px 16px',
            background: tab === 'all' ? '#16A34A' : '#fff',
            color: tab === 'all' ? '#fff' : '#1E2A52',
            border: tab === 'all' ? 'none' : '1.5px solid #E2E8F0',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          الكل ({requests.length})
        </button>
        <button
          onClick={() => setTab('received')}
          style={{
            padding: '10px 16px',
            background: tab === 'received' ? '#16A34A' : '#fff',
            color: tab === 'received' ? '#fff' : '#1E2A52',
            border: tab === 'received' ? 'none' : '1.5px solid #E2E8F0',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          المستقبلة ({requests.filter(r => r.type === 'received').length})
        </button>
        <button
          onClick={() => setTab('sent')}
          style={{
            padding: '10px 16px',
            background: tab === 'sent' ? '#16A34A' : '#fff',
            color: tab === 'sent' ? '#fff' : '#1E2A52',
            border: tab === 'sent' ? 'none' : '1.5px solid #E2E8F0',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          المرسلة ({requests.filter(r => r.type === 'sent').length})
        </button>
      </div>

      {/* Requests List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredRequests.map(request => (
          <div
            key={request.id}
            style={{
              background: '#fff',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexDirection: 'row-reverse' }}>
              <div style={{ textAlign: 'right' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px 0' }}>
                  {request.subject}
                </h3>
                <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>
                  من: {request.from}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: request.status === 'pending' ? '#FEF3C7' : request.status === 'accepted' ? '#DCFCE7' : '#FEE2E2',
                  color: request.status === 'pending' ? '#B45309' : request.status === 'accepted' ? '#15803D' : '#B91C1C',
                }}>
                  {request.status === 'pending' ? 'قيد الانتظار' : request.status === 'accepted' ? 'مقبول' : 'مرفوض'}
                </span>
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>
                  {request.date}
                </span>
              </div>
            </div>

            {/* Message */}
            <p style={{ fontSize: '14px', color: '#475569', margin: '0 0 12px 0', textAlign: 'right', lineHeight: '1.6' }}>
              {request.message}
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', flexDirection: 'row-reverse' }}>
              {request.type === 'received' && request.status === 'pending' && (
                <>
                  <button
                    onClick={() => handleAccept(request.id)}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      background: '#16A34A',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    قبول
                  </button>
                  <button
                    onClick={() => handleReject(request.id)}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      background: '#F8FAFC',
                      color: '#DC2626',
                      border: '1.5px solid #FEE2E2',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    رفض
                  </button>
                </>
              )}
              <button
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#F8FAFC',
                  color: '#1E2A52',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                عرض التفاصيل
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredRequests.length === 0 && (
        <div style={{
          background: '#fff',
          border: '1px dashed #CBD5E1',
          borderRadius: '12px',
          padding: '40px 24px',
          textAlign: 'center',
          color: '#64748B',
        }}>
          <p style={{ fontSize: '16px', margin: '0 0 8px 0' }}>📭 لا توجد طلبات</p>
        </div>
      )}
    </div>
  )
}
