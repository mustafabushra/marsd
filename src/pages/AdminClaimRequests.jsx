import { useState, useEffect } from 'react'
import { getSupabase } from '../lib/api'

export default function AdminClaimRequests() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [processingId, setProcessingId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchClaimRequests()
  }, [])

  const fetchClaimRequests = async () => {
    setLoading(true)
    try {
      const supabase = getSupabase()
      // Query pending claim requests
      const { data, error: fetchError } = await supabase
        .from('claim_requests')
        .select(`
          id,
          company_id,
          user_id,
          status,
          submitted_at,
          companies (id, name, cr_number),
          users (id, email, first_name, last_name)
        `)
        .eq('status', 'pending')
        .order('submitted_at', { ascending: false })

      if (fetchError) throw fetchError
      setRequests(data || [])
    } catch (err) {
      setError(err.message || 'فشل تحميل طلبات الملكية')
    } finally {
      setLoading(false)
    }
  }

  const handleApproveClaim = async (claimId, userId, companyId) => {
    if (processingId) return
    setProcessingId(claimId)
    setError('')

    try {
      const supabase = getSupabase()

      // Update claim status
      const { error: updateError } = await supabase
        .from('claim_requests')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', claimId)

      if (updateError) throw updateError

      // Create or update tenant for this user
      const { data: existingTenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('company_id', companyId)
        .eq('id', userId) // Assuming user_id might be tenant_id too
        .single()
        .catch(() => ({ data: null }))

      if (!existingTenant) {
        // Create new tenant for this user
        const { data: company } = await supabase
          .from('companies')
          .select('name, cr_number, email, phone, sector, city')
          .eq('id', companyId)
          .single()

        const { error: tenantError } = await supabase
          .from('tenants')
          .insert([{
            name: company.name,
            cr_number: company.cr_number,
            email: company.email || '',
            phone: company.phone || '',
            sector: company.sector || '',
            city: company.city || '',
            company_id: companyId,
            status: 'active'
          }])

        if (tenantError) throw tenantError
      }

      // Update user to link to company
      const { error: userError } = await supabase
        .from('users')
        .update({
          company_id: companyId,
          status: 'active'
        })
        .eq('id', userId)

      if (userError) throw userError

      // Notify user
      await supabase
        .from('notifications')
        .insert([{
          user_id: userId,
          type: 'claim_approved',
          payload: JSON.stringify({
            message: '✅ تمت الموافقة على طلب ملكيتك!'
          })
        }])
        .catch(err => console.warn('Notification warning:', err))

      // Refresh list
      await fetchClaimRequests()
      alert('✅ تمت الموافقة على طلب الملكية')
    } catch (err) {
      setError(err.message || 'فشل الموافقة على الطلب')
    } finally {
      setProcessingId(null)
    }
  }

  const handleRejectClaim = async (claimId, userId) => {
    if (!rejectionReason.trim()) {
      setError('يجب إدخال سبب الرفض')
      return
    }

    if (processingId) return
    setProcessingId(claimId)
    setError('')

    try {
      const supabase = getSupabase()

      // Update claim status
      const { error: updateError } = await supabase
        .from('claim_requests')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', claimId)

      if (updateError) throw updateError

      // Notify user
      await supabase
        .from('notifications')
        .insert([{
          user_id: userId,
          type: 'claim_rejected',
          payload: JSON.stringify({
            message: `❌ تم رفض طلب الملكية.\nالسبب: ${rejectionReason}`
          })
        }])
        .catch(err => console.warn('Notification warning:', err))

      // Refresh list
      setRejectionReason('')
      await fetchClaimRequests()
      setSelectedRequest(null)
      alert('✅ تم رفض الطلب')
    } catch (err) {
      setError(err.message || 'فشل رفض الطلب')
    } finally {
      setProcessingId(null)
    }
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>جاري التحميل...</div>
  }

  return (
    <main style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '28px', fontWeight: 800, marginBottom: '24px', textAlign: 'right' }}>
        طلبات ملكية الشركات
      </h1>

      {error && (
        <div style={{
          background: '#FEE2E2',
          color: '#991B1B',
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px'
        }}>
          {error}
        </div>
      )}

      {requests.length === 0 ? (
        <div style={{
          background: '#F8FAFC',
          padding: '40px',
          borderRadius: '12px',
          textAlign: 'center',
          color: '#64748B'
        }}>
          لا توجد طلبات ملكية معلقة
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* List */}
          <div>
            {requests.map(req => (
              <div
                key={req.id}
                onClick={() => setSelectedRequest(req)}
                style={{
                  background: selectedRequest?.id === req.id ? '#F0FDF4' : '#fff',
                  border: selectedRequest?.id === req.id ? '2px solid #16A34A' : '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '12px',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                  {req.companies.name}
                </div>
                <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '8px' }}>
                  {req.users.email}
                </div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                  {new Date(req.submitted_at).toLocaleDateString('ar-SA')}
                </div>
              </div>
            ))}
          </div>

          {/* Details & Actions */}
          {selectedRequest && (
            <div style={{
              background: '#F8FAFC',
              borderRadius: '12px',
              padding: '24px',
              border: '1px solid #E2E8F0'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '16px' }}>
                تفاصيل الطلب
              </h3>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>الشركة</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                  {selectedRequest.companies.name}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>رقم السجل</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                  {selectedRequest.companies.cr_number}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>المستخدم</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                  {selectedRequest.users.email}
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>سبب الرفض</div>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="اختياري - يُرسل للمستخدم"
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button
                  onClick={() => handleRejectClaim(selectedRequest.id, selectedRequest.user_id)}
                  disabled={processingId}
                  style={{
                    background: '#DC2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: processingId ? 'not-allowed' : 'pointer',
                    opacity: processingId ? 0.6 : 1
                  }}
                >
                  {processingId === selectedRequest.id ? 'جاري...' : 'رفض'}
                </button>

                <button
                  onClick={() => handleApproveClaim(selectedRequest.id, selectedRequest.user_id, selectedRequest.company_id)}
                  disabled={processingId}
                  style={{
                    background: '#16A34A',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: processingId ? 'not-allowed' : 'pointer',
                    opacity: processingId ? 0.6 : 1
                  }}
                >
                  {processingId === selectedRequest.id ? 'جاري...' : 'موافقة'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
