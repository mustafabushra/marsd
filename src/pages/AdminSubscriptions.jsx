import { useState, useEffect } from 'react'

export default function AdminSubscriptions() {
  const [subscriptions, setSubscriptions] = useState([
    {
      id: 1,
      tenant: 'شركة الراجحي التجارية',
      plan: 'pro',
      status: 'active',
      startDate: '2026-06-15',
      endDate: '2026-09-15',
      amount: 799,
      users: 5,
    },
    {
      id: 2,
      tenant: 'مجموعة النور للاستثمار',
      plan: 'enterprise',
      status: 'active',
      startDate: '2026-05-20',
      endDate: '2027-05-20',
      amount: 5000,
      users: 12,
    },
    {
      id: 3,
      tenant: 'الشركة العربية للتوريد',
      plan: 'basic',
      status: 'expired',
      startDate: '2026-04-10',
      endDate: '2026-07-10',
      amount: 299,
      users: 3,
    },
  ])

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchSubscriptions()
  }, [])

  const fetchSubscriptions = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/subscriptions')
      if (response.ok) {
        const data = await response.json()
        setSubscriptions(data)
      }
    } catch (err) {
      console.log('Using mock data:', err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRenew = async (id) => {
    try {
      const response = await fetch(`/api/subscriptions/${id}/renew`, { method: 'POST' })
      if (response.ok) {
        setSubscriptions(subscriptions.map(s =>
          s.id === id ? { ...s, status: 'active', startDate: new Date().toISOString().split('T')[0], endDate: new Date(Date.now() + 90*24*60*60*1000).toISOString().split('T')[0] } : s
        ))
      }
    } catch (err) {
      setError('فشل تجديد الاشتراك')
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
          إدارة الاشتراكات
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          إدارة اشتراكات الشركات والباقات
        </p>
      </div>

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
                  {sub.status === 'expired' && (
                    <button
                      onClick={() => handleRenew(sub.id)}
                      style={{
                        padding: '6px 12px',
                        background: '#16A34A',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      تجديد
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
