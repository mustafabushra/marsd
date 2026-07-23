import { useState, useEffect } from 'react'
import { getSupabase } from '../lib/api'
import { AlertCircle } from 'lucide-react'

export default function AdminTenants() {
  const [tenants, setTenants] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updateLoading, setUpdateLoading] = useState(null)

  useEffect(() => {
    fetchTenants()
  }, [])

  const fetchTenants = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const supabase = getSupabase()

      // Fetch tenants with subscriptions and report counts
      const { data: tenantsData, error: tenantsError } = await supabase
        .from('tenants')
        .select(`
          *,
          subscriptions (*),
          users (id),
          reports (id)
        `)

      if (tenantsError) throw new Error(tenantsError.message)

      // Format the data
      const formatted = (tenantsData || []).map(t => ({
        id: t.id,
        name: t.name,
        crNumber: t.cr_number || '—',
        status: t.status || 'active',
        users: t.users?.length || 0,
        subscriptionPlan: t.subscriptions?.[0]?.plan_name || 'basic',
        joinDate: new Date(t.created_at).toLocaleDateString('ar-SA'),
        reports: t.reports?.length || 0,
      }))

      setTenants(formatted)
    } catch (err) {
      setError(err.message || 'حدث خطأ في تحميل المشتركين')
      console.error('Error fetching tenants:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const filtered = tenants.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.crNumber.includes(searchTerm)
  )

  const handleSuspend = async (tenantId) => {
    try {
      setUpdateLoading(tenantId)
      const supabase = getSupabase()
      const tenant = tenants.find(t => t.id === tenantId)
      const newStatus = tenant.status === 'active' ? 'suspended' : 'active'

      const { error } = await supabase
        .from('tenants')
        .update({ status: newStatus })
        .eq('id', tenantId)

      if (error) throw new Error(error.message)

      setTenants(tenants.map(t =>
        t.id === tenantId ? { ...t, status: newStatus } : t
      ))
      setError(null)
    } catch (err) {
      setError(err.message || 'فشل تحديث حالة المشترك')
      console.error('Error updating tenant:', err)
    } finally {
      setUpdateLoading(null)
    }
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8FAFC' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block', width: '40px', height: '40px', border: '4px solid #E2E8F0', borderTop: '4px solid #16A34A', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '16px' }}></div>
          <p style={{ color: '#64748B', fontSize: '14px' }}>جاري تحميل المشتركين...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
          إدارة المشتركين
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          إدارة حسابات الشركات المشتركة ({filtered.length})
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
                    disabled={updateLoading === tenant.id}
                    style={{
                      padding: '6px 12px',
                      background: updateLoading === tenant.id
                        ? '#E2E8F0'
                        : tenant.status === 'active'
                        ? '#FEE2E2'
                        : '#E0F2FE',
                      color: updateLoading === tenant.id
                        ? '#94A3B8'
                        : tenant.status === 'active'
                        ? '#DC2626'
                        : '#0369A1',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: updateLoading === tenant.id ? 'not-allowed' : 'pointer',
                      opacity: updateLoading === tenant.id ? 0.7 : 1,
                    }}
                  >
                    {updateLoading === tenant.id
                      ? 'جاري...'
                      : tenant.status === 'active'
                      ? 'علق'
                      : 'فعّل'}
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

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
