import { useState, useEffect } from 'react'
import { Building2, CreditCard, FileText, TrendingUp, AlertCircle, Users } from 'lucide-react'

export default function AdminDashboard() {
  const [dashboard, setDashboard] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      // Mock dashboard data
      const mockDashboard = {
        overview: {
          totalTenants: 47,
          activeSubscriptions: 38,
          pendingReports: 12,
          approvedReports: 145,
          totalRevenue: 125400,
        },
        recentActivity: [
          { id: 1, type: 'new_report', description: 'تقرير جديد من شركة النور', date: new Date().toISOString() },
          { id: 2, type: 'subscription', description: 'تجديد اشتراك شركة الرؤية', date: new Date(Date.now() - 3600000).toISOString() },
        ],
      }

      const mockAnalytics = {
        topCompanies: [
          { name: 'شركة نجد للمقاولات', reports: 15, trustScore: 94 },
          { name: 'الرياض للتجارة', reports: 12, trustScore: 88 },
          { name: 'التقنية المتقدمة', reports: 10, trustScore: 92 },
        ],
        pendingReviews: 12,
        reportsByStatus: { approved: 145, pending: 12, rejected: 8 },
      }

      setDashboard(mockDashboard)
      setAnalytics(mockAnalytics)
      setLoading(false)
    } catch (error) {
      console.error('Error fetching dashboard:', error)
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8FAFC' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block', width: '40px', height: '40px', border: '4px solid #E2E8F0', borderTop: '4px solid #16A34A', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '16px' }}></div>
          <p style={{ color: '#64748B', fontSize: '14px' }}>جاري تحميل لوحة التحكم...</p>
        </div>
      </div>
    )
  }

  const kpis = [
    { label: 'إجمالي الشركات', value: dashboard?.overview?.totalTenants || 0, color: '#1E2A52', icon: Building2 },
    { label: 'الاشتراكات النشطة', value: dashboard?.overview?.activeSubscriptions || 0, color: '#16A34A', icon: CreditCard },
    { label: 'التقارير المعلقة', value: dashboard?.overview?.pendingReports || 0, color: '#F59E0B', icon: FileText },
    { label: 'الإيراد الإجمالي', value: `﷼${(dashboard?.overview?.totalRevenue || 0).toLocaleString()}`, color: '#7C3AED', icon: TrendingUp }
  ]

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', padding: '32px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0', textAlign: 'right' }}>لوحة التحكم</h1>
          <p style={{ color: '#64748B', fontSize: '14px', margin: '0 0 0 0', textAlign: 'right' }}>مرحباً بك في نظام إدارة مرصد</p>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }}>
          {kpis.map((k, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexDirection: 'row-reverse' }}>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: '#64748B', fontSize: '13px', fontWeight: 700, margin: '0 0 12px 0' }}>{k.label}</p>
                  <p style={{ fontSize: '28px', fontWeight: 900, color: k.color, margin: 0 }}>{k.value}</p>
                </div>
                <div style={{ width: '48px', height: '48px', background: `${k.color}15`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <k.icon size={24} color={k.color} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ marginBottom: '24px', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', gap: '32px' }}>
            {['overview', 'analytics', 'alerts'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '12px 0',
                  borderBottom: activeTab === tab ? '2px solid #16A34A' : 'none',
                  background: 'none',
                  border: 'none',
                  color: activeTab === tab ? '#16A34A' : '#64748B',
                  fontWeight: activeTab === tab ? 600 : 500,
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'all 0.3s'
                }}
              >
                {tab === 'overview' && 'نظرة عامة'}
                {tab === 'analytics' && 'التحليلات'}
                {tab === 'alerts' && 'التنبيهات'}
              </button>
            ))}
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Reports Status */}
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 20px 0', textAlign: 'right' }}>حالة التقارير</h3>
              <div style={{ space: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #E2E8F0', flexDirection: 'row-reverse' }}>
                  <span style={{ color: '#64748B', fontSize: '14px' }}>قيد الانتظار</span>
                  <span style={{ fontSize: '20px', fontWeight: 900, color: '#F59E0B' }}>{dashboard?.overview?.pendingReports || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', flexDirection: 'row-reverse' }}>
                  <span style={{ color: '#64748B', fontSize: '14px' }}>معتمدة</span>
                  <span style={{ fontSize: '20px', fontWeight: 900, color: '#16A34A' }}>{dashboard?.overview?.approvedReports || 0}</span>
                </div>
                <div style={{ marginTop: '16px', textAlign: 'right' }}>
                  <a href="/admin/reports" style={{ color: '#16A34A', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }}>
                    ← عرض صف التقارير
                  </a>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 20px 0', textAlign: 'right' }}>إجراءات سريعة</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <a href="/admin/reports" style={{ display: 'block', padding: '12px', background: '#F1F5F9', borderRadius: '8px', textDecoration: 'none', cursor: 'pointer', transition: 'background 0.3s', textAlign: 'right' }} onMouseEnter={(e) => e.target.style.background = '#E2E8F0'} onMouseLeave={(e) => e.target.style.background = '#F1F5F9'}>
                  <p style={{ fontWeight: 600, color: '#0F172A', margin: '0 0 4px 0', fontSize: '14px' }}>مراجعة التقارير المعلقة</p>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>{dashboard?.overview?.pendingReports} تقارير بانتظار</p>
                </a>
                <a href="/admin/tenants" style={{ display: 'block', padding: '12px', background: '#F1F5F9', borderRadius: '8px', textDecoration: 'none', cursor: 'pointer', transition: 'background 0.3s', textAlign: 'right' }} onMouseEnter={(e) => e.target.style.background = '#E2E8F0'} onMouseLeave={(e) => e.target.style.background = '#F1F5F9'}>
                  <p style={{ fontWeight: 600, color: '#0F172A', margin: '0 0 4px 0', fontSize: '14px' }}>إدارة الشركات</p>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>{dashboard?.overview?.totalTenants} شركة مسجلة</p>
                </a>
                <a href="/admin/subscriptions" style={{ display: 'block', padding: '12px', background: '#F1F5F9', borderRadius: '8px', textDecoration: 'none', cursor: 'pointer', transition: 'background 0.3s', textAlign: 'right' }} onMouseEnter={(e) => e.target.style.background = '#E2E8F0'} onMouseLeave={(e) => e.target.style.background = '#F1F5F9'}>
                  <p style={{ fontWeight: 600, color: '#0F172A', margin: '0 0 4px 0', fontSize: '14px' }}>الاشتراكات</p>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>{dashboard?.overview?.activeSubscriptions} نشطة</p>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && analytics && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 24px' }}>تحليلات الأداء</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div style={{ background: '#F0F4FF', borderRadius: '8px', padding: '16px' }}>
                <p style={{ color: '#64748B', fontSize: '12px', margin: '0 0 8px' }}>التقارير المرسلة</p>
                <p style={{ fontSize: '24px', fontWeight: 900, color: '#3B82F6', margin: 0 }}>{analytics.reports?.submitted || 0}</p>
              </div>
              <div style={{ background: '#F0FDF4', borderRadius: '8px', padding: '16px' }}>
                <p style={{ color: '#64748B', fontSize: '12px', margin: '0 0 8px' }}>التقارير المعتمدة</p>
                <p style={{ fontSize: '24px', fontWeight: 900, color: '#16A34A', margin: 0 }}>{analytics.reports?.approved || 0}</p>
              </div>
              <div style={{ background: '#FEF3C7', borderRadius: '8px', padding: '16px' }}>
                <p style={{ color: '#64748B', fontSize: '12px', margin: '0 0 8px' }}>نسبة الموافقة</p>
                <p style={{ fontSize: '24px', fontWeight: 900, color: '#F59E0B', margin: 0 }}>{analytics.reports?.approval_rate?.toFixed(1)}%</p>
              </div>
              <div style={{ background: '#F3E8FF', borderRadius: '8px', padding: '16px' }}>
                <p style={{ color: '#64748B', fontSize: '12px', margin: '0 0 8px' }}>الإيراد الإجمالي</p>
                <p style={{ fontSize: '24px', fontWeight: 900, color: '#7C3AED', margin: 0 }}>﷼{(analytics.revenue || 0).toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}

        {/* Alerts Tab */}
        {activeTab === 'alerts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {dashboard?.overview?.pendingReports > 10 && (
              <div style={{ display: 'flex', gap: '12px', padding: '16px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '12px' }}>
                <AlertCircle size={20} color='#F59E0B' style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <p style={{ fontWeight: 600, color: '#92400E', margin: '0 0 4px', fontSize: '14px' }}>تقارير معلقة كثيرة</p>
                  <p style={{ fontSize: '13px', color: '#A16207', margin: 0 }}>يوجد {dashboard.overview.pendingReports} تقارير بانتظار المراجعة</p>
                </div>
              </div>
            )}

            {!dashboard?.overview?.pendingReports && (
              <div style={{ display: 'flex', gap: '12px', padding: '16px', background: '#F0FDF4', border: '1px solid #BBFB5E', borderRadius: '12px' }}>
                <AlertCircle size={20} color='#16A34A' style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <p style={{ fontWeight: 600, color: '#166534', margin: '0 0 4px', fontSize: '14px' }}>كل شيء على ما يرام</p>
                  <p style={{ fontSize: '13px', color: '#22C55E', margin: 0 }}>لا توجد تنبيهات حالياً. المنصة تعمل بشكل سلس</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
