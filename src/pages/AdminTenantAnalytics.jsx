import { useState } from 'react'

export default function AdminTenantAnalytics() {
  const [dateRange, setDateRange] = useState({ from: '2026-07-01', to: '2026-07-15' })
  const [topTenants] = useState([
    { rank: 1, name: 'شركة الراجحي التجارية', reports: 45, users: 12, revenue: 4500 },
    { rank: 2, name: 'مجموعة النور للاستثمار', reports: 38, users: 9, revenue: 3800 },
    { rank: 3, name: 'الشركة العربية للتوريد', reports: 32, users: 8, revenue: 3200 },
    { rank: 4, name: 'شركة النمو السريع', reports: 28, users: 7, revenue: 2800 },
    { rank: 5, name: 'الشركة الدولية', reports: 24, users: 6, revenue: 2400 },
  ])

  const [metrics] = useState({
    totalTenants: 1247,
    activeTenantsThisMonth: 892,
    newTenants: 45,
    churnRate: 3.2,
    avgReportsPerTenant: 2.8,
    totalRevenue: '45,230,000 ر.س',
  })

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
          تحليلات الشركات
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          تحليل شامل لأداء المشتركين
        </p>
      </div>

      {/* Date Range Filter */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'flex-end', flexDirection: 'row-reverse' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px', textAlign: 'right' }}>من</label>
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid #E2E8F0',
              borderRadius: '6px',
              fontSize: '13px',
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px', textAlign: 'right' }}>إلى</label>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 10px',
              border: '1px solid #E2E8F0',
              borderRadius: '6px',
              fontSize: '13px',
            }}
          />
        </div>
        <button style={{
          padding: '8px 16px',
          background: '#16A34A',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
        }}>
          تطبيق
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>إجمالي الشركات</p>
          <p style={{ fontSize: '28px', fontWeight: 900, color: '#1E2A52', margin: 0, textAlign: 'right' }}>{metrics.totalTenants}</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>النشطة هذا الشهر</p>
          <p style={{ fontSize: '28px', fontWeight: 900, color: '#16A34A', margin: 0, textAlign: 'right' }}>{metrics.activeTenantsThisMonth}</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>شركات جديدة</p>
          <p style={{ fontSize: '28px', fontWeight: 900, color: '#0369A1', margin: 0, textAlign: 'right' }}>{metrics.newTenants}</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>معدل الخروج</p>
          <p style={{ fontSize: '28px', fontWeight: 900, color: '#F59E0B', margin: 0, textAlign: 'right' }}>{metrics.churnRate}%</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>متوسط التقارير</p>
          <p style={{ fontSize: '28px', fontWeight: 900, color: '#7C3AED', margin: 0, textAlign: 'right' }}>{metrics.avgReportsPerTenant}</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>إجمالي الإيرادات</p>
          <p style={{ fontSize: '20px', fontWeight: 900, color: '#059669', margin: 0, textAlign: 'right' }}>
            {metrics.totalRevenue}
          </p>
        </div>
      </div>

      {/* Top Tenants Table */}
      <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>#</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>اسم الشركة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>التقارير</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>المستخدمون</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569' }}>الإيرادات (ر.س)</th>
            </tr>
          </thead>
          <tbody>
            {topTenants.map(tenant => (
              <tr key={tenant.rank} style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A', fontWeight: 700, borderLeft: '1px solid #E2E8F0' }}>
                  {tenant.rank}
                </td>
                <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A', fontWeight: 600, borderLeft: '1px solid #E2E8F0' }}>
                  {tenant.name}
                </td>
                <td style={{ padding: '16px', fontSize: '13px', color: '#64748B', borderLeft: '1px solid #E2E8F0' }}>
                  {tenant.reports}
                </td>
                <td style={{ padding: '16px', fontSize: '13px', color: '#64748B', borderLeft: '1px solid #E2E8F0' }}>
                  {tenant.users}
                </td>
                <td style={{ padding: '16px', fontSize: '13px', color: '#0F172A', fontWeight: 600 }}>
                  {tenant.revenue.toLocaleString()} ر.س
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Insights */}
      <div style={{ background: '#E0F2FE', border: '1px solid #BAE6FD', borderRadius: '12px', padding: '16px', marginTop: '24px' }}>
        <p style={{ fontSize: '13px', color: '#0369A1', fontWeight: 600, margin: '0 0 8px 0', textAlign: 'right' }}>💡 الرؤى:</p>
        <ul style={{ fontSize: '12px', color: '#0369A1', margin: 0, paddingRight: '20px', textAlign: 'right', lineHeight: 1.6 }}>
          <li>أعلى أداء: شركة الراجحي بـ 45 تقريراً في هذا الشهر</li>
          <li>معدل النمو: إضافة 45 شركة جديدة هذا الشهر (زيادة 4.8%)</li>
          <li>متوسط الاستخدام: المستخدمون يقومون بـ 2.8 تقرير للشركة الواحدة</li>
        </ul>
      </div>
    </div>
  )
}
