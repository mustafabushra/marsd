import { useState, useEffect } from 'react'

export default function AdminTenants() {
  const [tenants, setTenants] = useState([
    {
      id: 1,
      name: 'شركة الراجحي التجارية',
      crNumber: '1010012345',
      status: 'active',
      users: 5,
      subscriptionPlan: 'pro',
      joinDate: '2026-06-15',
      reports: 8,
    },
    {
      id: 2,
      name: 'مجموعة النور للاستثمار',
      crNumber: '1010098765',
      status: 'active',
      users: 12,
      subscriptionPlan: 'enterprise',
      joinDate: '2026-05-20',
      reports: 24,
    },
    {
      id: 3,
      name: 'الشركة العربية للتوريد',
      crNumber: '1010054321',
      status: 'suspended',
      users: 3,
      subscriptionPlan: 'basic',
      joinDate: '2026-04-10',
      reports: 2,
    },
  ])

  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    fetchTenants()
  }, [])

  const fetchTenants = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/tenants')
      if (response.ok) {
        const data = await response.json()
        setTenants(data)
      }
    } catch (err) {
      console.log('Using mock data:', err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const filtered = tenants.filter(t =>
    t.name.includes(searchTerm) || t.crNumber.includes(searchTerm)
  )

  const handleSuspend = async (id) => {
    try {
      const response = await fetch(`/api/tenants/${id}/toggle-status`, { method: 'POST' })
      if (response.ok) {
        setTenants(tenants.map(t =>
          t.id === id ? { ...t, status: t.status === 'suspended' ? 'active' : 'suspended' } : t
        ))
      }
    } catch (err) {
      console.error('Failed to update tenant status:', err)
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
          إدارة المشتركين
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          إدارة حسابات الشركات المشتركة
        </p>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="ابحث برقم السجل أو اسم الشركة..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 14px',
            border: '1.5px solid #E2E8F0',
            borderRadius: '10px',
            fontSize: '14px',
            fontFamily: 'Tajawal',
            textAlign: 'right',
          }}
        />
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>اسم الشركة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>السجل التجاري</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>المستخدمون</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الباقة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>التقارير</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الحالة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569' }}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(tenant => (
              <tr key={tenant.id} style={{ borderBottom: '1px solid #E2E8F0', '&:hover': { background: '#F8FAFC' } }}>
                <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A', fontWeight: 600, borderLeft: '1px solid #E2E8F0' }}>
                  {tenant.name}
                </td>
                <td style={{ padding: '16px', fontSize: '13px', color: '#64748B', borderLeft: '1px solid #E2E8F0', fontFamily: 'monospace' }}>
                  {tenant.crNumber}
                </td>
                <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A', borderLeft: '1px solid #E2E8F0' }}>
                  {tenant.users}
                </td>
                <td style={{ padding: '16px', fontSize: '13px', color: '#475569', borderLeft: '1px solid #E2E8F0' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    background: tenant.subscriptionPlan === 'enterprise' ? '#F0E5FF' : tenant.subscriptionPlan === 'pro' ? '#E0F2FE' : '#F0F0F0',
                    color: tenant.subscriptionPlan === 'enterprise' ? '#7C3AED' : tenant.subscriptionPlan === 'pro' ? '#0369A1' : '#64748B',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}>
                    {tenant.subscriptionPlan === 'enterprise' ? 'مؤسسات' : tenant.subscriptionPlan === 'pro' ? 'احترافية' : 'أساسية'}
                  </span>
                </td>
                <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A', borderLeft: '1px solid #E2E8F0' }}>
                  {tenant.reports}
                </td>
                <td style={{ padding: '16px', fontSize: '13px', borderLeft: '1px solid #E2E8F0' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    background: tenant.status === 'active' ? '#DCFCE7' : '#FEE2E2',
                    color: tenant.status === 'active' ? '#15803D' : '#DC2626',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}>
                    {tenant.status === 'active' ? 'نشط' : 'معلق'}
                  </span>
                </td>
                <td style={{ padding: '16px', fontSize: '13px' }}>
                  <button
                    onClick={() => handleSuspend(tenant.id)}
                    style={{
                      padding: '6px 12px',
                      background: tenant.status === 'active' ? '#FEE2E2' : '#E0F2FE',
                      color: tenant.status === 'active' ? '#DC2626' : '#0369A1',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {tenant.status === 'active' ? 'علق' : 'فعّل'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div style={{
          background: '#fff',
          border: '1px dashed #CBD5E1',
          borderRadius: '12px',
          padding: '40px 24px',
          textAlign: 'center',
          color: '#64748B',
          marginTop: '12px',
        }}>
          <p style={{ fontSize: '16px', margin: 0 }}>لا توجد نتائج</p>
        </div>
      )}
    </div>
  )
}
