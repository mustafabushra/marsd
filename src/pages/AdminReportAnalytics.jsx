import { useState } from 'react'

export default function AdminReportAnalytics() {
  const [dateRange, setDateRange] = useState({ from: '2026-07-01', to: '2026-07-15' })

  const stats = {
    totalReports: 2458,
    pendingReports: 127,
    completedReports: 2331,
    averageTime: 4.2,
    weeklyTrend: [
      { week: 'الأسبوع 1', reports: 450 },
      { week: 'الأسبوع 2', reports: 620 },
      { week: 'الأسبوع 3', reports: 580 },
      { week: 'الأسبوع 4', reports: 808 },
    ],
    topSectors: [
      { sector: 'البناء والمقاولات', count: 385, percentage: 15.7 },
      { sector: 'التسويق والدعاية', count: 312, percentage: 12.7 },
      { sector: 'الخدمات المالية', count: 287, percentage: 11.7 },
      { sector: 'الاستيراد والتصدير', count: 245, percentage: 10.0 },
      { sector: 'غيرها', count: 1229, percentage: 49.9 },
    ],
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
          تحليلات التقارير
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
          إحصائيات وتحليلات شاملة عن التقارير
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
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>إجمالي التقارير</p>
          <p style={{ fontSize: '28px', fontWeight: 900, color: '#1E2A52', margin: 0, textAlign: 'right' }}>{stats.totalReports}</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>المكتملة</p>
          <p style={{ fontSize: '28px', fontWeight: 900, color: '#16A34A', margin: 0, textAlign: 'right' }}>{stats.completedReports}</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>قيد المعالجة</p>
          <p style={{ fontSize: '28px', fontWeight: 900, color: '#F59E0B', margin: 0, textAlign: 'right' }}>{stats.pendingReports}</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
          <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px 0', textAlign: 'right' }}>الوقت المتوسط</p>
          <p style={{ fontSize: '28px', fontWeight: 900, color: '#0369A1', margin: 0, textAlign: 'right' }}>{stats.averageTime}</p>
          <p style={{ fontSize: '12px', color: '#94A3B8', margin: '4px 0 0 0', textAlign: 'right' }}>ساعات</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
        {/* Weekly Trend */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>
            الاتجاه الأسبوعي
          </h2>
          <div style={{ height: '250px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap: '12px' }}>
            {stats.weeklyTrend.map((item, idx) => (
              <div key={idx} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    width: '40px',
                    height: `${(item.reports / 800) * 200}px`,
                    background: '#16A34A',
                    borderRadius: '8px 8px 0 0',
                    marginBottom: '8px',
                  }}
                />
                <p style={{ fontSize: '11px', color: '#64748B', margin: 0 }}>
                  {item.reports}
                </p>
                <p style={{ fontSize: '11px', color: '#94A3B8', margin: '2px 0 0 0' }}>
                  {item.week}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Top Sectors */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>
            أكثر القطاعات
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {stats.topSectors.map((item, idx) => (
              <div key={idx}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>
                    {item.percentage}%
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', textAlign: 'right' }}>
                    {item.sector}
                  </span>
                </div>
                <div style={{
                  height: '8px',
                  background: '#E2E8F0',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}>
                  <div
                    style={{
                      height: '100%',
                      background: '#16A34A',
                      width: `${item.percentage}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
