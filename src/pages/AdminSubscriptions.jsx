import { useState, useEffect } from 'react'
import { getSupabase } from '../lib/api'
import { AlertCircle } from 'lucide-react'

export default function AdminSubscriptions() {
  const [subscriptions, setSubscriptions] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updateLoading, setUpdateLoading] = useState(null)

  useEffect(() => {
    fetchSubscriptions()
  }, [])

  const fetchSubscriptions = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const supabase = getSupabase()

      // Fetch subscriptions with tenant and plan info
      const { data: subsData, error: subsError } = await supabase
        .from('subscriptions')
        .select(`
          *,
          tenant:tenants(id, name),
          plan:plans(name, price),
          users:tenants(users(id))
        `)

      if (subsError) throw new Error(subsError.message)

      // Format the data
      const formatted = (subsData || []).map(s => ({
        id: s.id,
        tenant: s.tenant?.name || 'مجهولة',
        plan: s.plan_name || 'basic',
        status: s.status || 'active',
        startDate: new Date(s.start_date).toLocaleDateString('ar-SA'),
        endDate: new Date(s.end_date).toLocaleDateString('ar-SA'),
        amount: s.price || 0,
        users: s.users?.length || 0,
      }))

      setSubscriptions(formatted)
    } catch (err) {
      setError(err.message || 'حدث خطأ في تحميل الاشتراكات')
      console.error('Error fetching subscriptions:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRenew = async (id) => {
    try {
      setUpdateLoading(id)
      const supabase = getSupabase()
      const newEndDate = new Date()
      newEndDate.setDate(newEndDate.getDate() + 90)

      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          end_date: newEndDate.toISOString(),
        })
        .eq('id', id)

      if (error) throw new Error(error.message)

      setSubscriptions(subscriptions.map(s =>
        s.id === id
          ? {
              ...s,
              status: 'active',
              startDate: new Date().toLocaleDateString('ar-SA'),
              endDate: newEndDate.toLocaleDateString('ar-SA'),
            }
          : s
      ))
      setError(null)
    } catch (err) {
      setError(err.message || 'فشل تجديد الاشتراك')
      console.error('Error renewing subscription:', err)
    } finally {
      setUpdateLoading(null)
    }
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8FAFC' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block', width: '40px', height: '40px', border: '4px solid #E2E8F0', borderTop: '4px solid #16A34A', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '16px' }}></div>
          <p style={{ color: '#64748B', fontSize: '14px' }}>جاري تحميل الاشتراكات...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
          إدارة الاشتراكات
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          إدارة اشتراكات الشركات والباقات ({subscriptions.length})
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div style={{ marginBottom: '20px', padding: '14px 16px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <AlertCircle size={20} color='#991B1B' style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <p style={{ fontWeight: 600, color: '#991B1B', margin: '0 0 4px', fontSize: '14px' }}>خطأ</p>
            <p style={{ fontSize: '13px', color: '#7F1D1D', margin: 0 }}>{error}</p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>الاشتراكات النشطة</p>
          <p style={{ fontSize: '28px', fontWeight: 900, color: '#16A34A', margin: 0, textAlign: 'right' }}>
            {subscriptions.filter(s => s.status === 'active').length}
          </p>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>إجمالي الإيرادات الشهرية</p>
          <p style={{ fontSize: '28px', fontWeight: 900, color: '#0369A1', margin: 0, textAlign: 'right' }}>
            {subscriptions.filter(s => s.status === 'active').reduce((sum, s) => sum + s.amount, 0).toLocaleString()} ر.س
          </p>
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>الاشتراكات منتهية الصلاحية</p>
          <p style={{ fontSize: '28px', fontWeight: 900, color: '#DC2626', margin: 0, textAlign: 'right' }}>
            {subscriptions.filter(s => s.status === 'expired').length}
          </p>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الشركة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الباقة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>المبلغ</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>المستخدمون</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>تاريخ الانتهاء</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الحالة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569' }}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map(sub => (
              <tr key={sub.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A', fontWeight: 600, borderLeft: '1px solid #E2E8F0' }}>
                  {sub.tenant}
                </td>
                <td style={{ padding: '16px', fontSize: '13px', color: '#475569', borderLeft: '1px solid #E2E8F0' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    background: sub.plan === 'enterprise' ? '#F0E5FF' : sub.plan === 'pro' ? '#E0F2FE' : '#F0F0F0',
                    color: sub.plan === 'enterprise' ? '#7C3AED' : sub.plan === 'pro' ? '#0369A1' : '#64748B',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}>
                    {sub.plan === 'enterprise' ? 'مؤسسات' : sub.plan === 'pro' ? 'احترافية' : 'أساسية'}
                  </span>
                </td>
                <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A', fontWeight: 600, borderLeft: '1px solid #E2E8F0' }}>
                  {sub.amount.toLocaleString()} ر.س
                </td>
                <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A', borderLeft: '1px solid #E2E8F0' }}>
                  {sub.users}
                </td>
                <td style={{ padding: '16px', fontSize: '13px', color: '#64748B', borderLeft: '1px solid #E2E8F0' }}>
                  {sub.endDate}
                </td>
                <td style={{ padding: '16px', fontSize: '13px', borderLeft: '1px solid #E2E8F0' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    background: sub.status === 'active' ? '#DCFCE7' : '#FEE2E2',
                    color: sub.status === 'active' ? '#15803D' : '#DC2626',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}>
                    {sub.status === 'active' ? 'نشط' : 'منتهي'}
                  </span>
                </td>
                <td style={{ padding: '16px', fontSize: '13px' }}>
                  {sub.status !== 'active' && (
                    <button
                      onClick={() => handleRenew(sub.id)}
                      disabled={updateLoading === sub.id}
                      style={{
                        padding: '6px 12px',
                        background: updateLoading === sub.id ? '#E2E8F0' : '#16A34A',
                        color: updateLoading === sub.id ? '#94A3B8' : '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: updateLoading === sub.id ? 'not-allowed' : 'pointer',
                        opacity: updateLoading === sub.id ? 0.7 : 1,
                      }}
                    >
                      {updateLoading === sub.id ? 'جاري...' : 'تجديد'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
