/**
 * Admin Dashboard Page
 * Main dashboard for platform administrators
 * Displays KPIs, analytics, and system overview
 */

import React, { useState, useEffect } from 'react'
import { useApi } from '../../hooks/useApi'
import { AdminDashboardData } from '../../types'
import Button from '../../components/common/Button'

const AdminDashboard: React.FC = () => {
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'alerts'>('overview')

  // Verify admin role
  const token = localStorage.getItem('accessToken')
  const userRole = localStorage.getItem('userRole')

  useEffect(() => {
    if (!token || userRole !== 'platform_admin') {
      window.location.href = '/login'
      return
    }

    fetchDashboard()
  }, [])

  const fetchDashboard = async () => {
    try {
      const response = await fetch('/api/admin/dashboard', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard')
      }

      const data = await response.json()
      setDashboard(data)
    } catch (error) {
      console.error('Error fetching dashboard:', error)
    }
  }

  if (!dashboard) {
    return (
      <div style={loadingContainerStyles}>
        <div style={loadingSpinnerStyles} />
        <p style={loadingTextStyles}>جاري تحميل لوحة التحكم...</p>
      </div>
    )
  }

  const kpis = [
    {
      label: 'إجمالي الشركات',
      value: dashboard.overview.totalCompanies,
      color: '#1E2A52',
      icon: '🏢',
    },
    {
      label: 'الاشتراكات النشطة',
      value: dashboard.overview.activeSubscriptions,
      color: '#16A34A',
      icon: '💳',
    },
    {
      label: 'التقارير المعلقة',
      value: dashboard.overview.pendingReports,
      color: '#F59E0B',
      icon: '📄',
    },
    {
      label: 'الإيراد الإجمالي',
      value: `﷼${(dashboard.overview.totalRevenue || 0).toLocaleString()}`,
      color: '#7C3AED',
      icon: '💰',
    },
  ]

  return (
    <div style={containerStyles}>
      <div style={contentWrapperStyles}>
        {/* Header */}
        <div style={headerStyles}>
          <h1 style={titleStyles}>لوحة التحكم</h1>
          <p style={subtitleStyles}>مرحباً بك في نظام إدارة مرصد</p>
        </div>

        {/* KPI Cards */}
        <div style={kpiGridStyles}>
          {kpis.map((kpi, idx) => (
            <div key={idx} style={kpiCardStyles}>
              <div style={kpiIconStyles}>{kpi.icon}</div>
              <div style={kpiContentStyles}>
                <p style={kpiLabelStyles}>{kpi.label}</p>
                <p style={{ ...kpiValueStyles, color: kpi.color }}>{kpi.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={tabContainerStyles}>
          <div style={tabHeaderStyles}>
            {(['overview', 'analytics', 'alerts'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  ...tabButtonStyles,
                  borderBottomColor: activeTab === tab ? '#16A34A' : 'transparent',
                  color: activeTab === tab ? '#16A34A' : '#64748B',
                  fontWeight: activeTab === tab ? 600 : 500,
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
          <div style={tabContentStyles}>
            <div style={gridColumnsStyles}>
              {/* Reports Status */}
              <div style={cardStyles}>
                <h3 style={cardTitleStyles}>حالة التقارير</h3>
                <div style={statusContainerStyles}>
                  <div style={statusItemStyles}>
                    <span style={statusLabelStyles}>قيد الانتظار</span>
                    <span style={{ ...statusCountStyles, color: '#F59E0B' }}>
                      {dashboard.overview.pendingReports}
                    </span>
                  </div>
                  <div style={statusItemStyles}>
                    <span style={statusLabelStyles}>معتمدة</span>
                    <span style={{ ...statusCountStyles, color: '#16A34A' }}>
                      {dashboard.recentActivity.length}
                    </span>
                  </div>
                </div>
                <a href="/admin/reports" style={viewMoreStyles}>
                  ← عرض صف التقارير
                </a>
              </div>

              {/* Quick Actions */}
              <div style={cardStyles}>
                <h3 style={cardTitleStyles}>إجراءات سريعة</h3>
                <div style={actionsListStyles}>
                  <a href="/admin/reports" style={actionItemStyles}>
                    <p style={actionTitleStyles}>مراجعة التقارير المعلقة</p>
                    <p style={actionSubtitleStyles}>
                      {dashboard.overview.pendingReports} تقارير بانتظار
                    </p>
                  </a>
                  <a href="/admin/companies" style={actionItemStyles}>
                    <p style={actionTitleStyles}>إدارة الشركات</p>
                    <p style={actionSubtitleStyles}>
                      {dashboard.overview.totalCompanies} شركة مسجلة
                    </p>
                  </a>
                  <a href="/admin/subscriptions" style={actionItemStyles}>
                    <p style={actionTitleStyles}>الاشتراكات</p>
                    <p style={actionSubtitleStyles}>
                      {dashboard.overview.activeSubscriptions} نشطة
                    </p>
                  </a>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div style={cardStyles}>
              <h3 style={cardTitleStyles}>النشاط الأخير</h3>
              <div style={activityListStyles}>
                {dashboard.recentActivity.slice(0, 5).map((log) => (
                  <div key={log.id} style={activityItemStyles}>
                    <div style={activityInfoStyles}>
                      <p style={activityActionStyles}>{log.action}</p>
                      <p style={activityUserStyles}>{log.userEmail}</p>
                    </div>
                    <p style={activityTimeStyles}>
                      {new Date(log.timestamp).toLocaleDateString('ar-SA')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div style={cardStyles}>
            <h3 style={cardTitleStyles}>تحليلات الأداء</h3>
            <div style={analyticsGridStyles}>
              <div style={analyticsTileStyles}>
                <p style={analyticsTileLabelStyles}>إجمالي المستخدمين</p>
                <p style={{ ...analyticsTileValueStyles, color: '#3B82F6' }}>
                  {dashboard.overview.activeUsers}
                </p>
              </div>
              <div style={analyticsTileStyles}>
                <p style={analyticsTileLabelStyles}>الشركات المعلقة</p>
                <p style={{ ...analyticsTileValueStyles, color: '#F59E0B' }}>
                  {dashboard.overview.totalCompanies - dashboard.overview.suspendedCompanies}
                </p>
              </div>
              <div style={analyticsTileStyles}>
                <p style={analyticsTileLabelStyles}>معدل الموافقة</p>
                <p style={{ ...analyticsTileValueStyles, color: '#16A34A' }}>
                  {dashboard.recentActivity.length > 0
                    ? Math.round(
                        ((dashboard.overview.totalCompanies - dashboard.overview.pendingReports) /
                          dashboard.overview.totalCompanies) *
                          100
                      )
                    : 0}
                  %
                </p>
              </div>
              <div style={analyticsTileStyles}>
                <p style={analyticsTileLabelStyles}>الإيراد الشهري</p>
                <p style={{ ...analyticsTileValueStyles, color: '#7C3AED' }}>
                  ﷼{(dashboard.overview.totalRevenue || 0).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Alerts Tab */}
        {activeTab === 'alerts' && (
          <div style={alertsContainerStyles}>
            {dashboard.overview.pendingReports > 10 && (
              <div style={alertBoxStyles('#FEF3C7', '#FCD34D', '#92400E')}>
                <div style={alertIconStyles}>⚠️</div>
                <div>
                  <p style={alertTitleStyles}>تقارير معلقة كثيرة</p>
                  <p style={alertDescriptionStyles}>
                    يوجد {dashboard.overview.pendingReports} تقارير بانتظار المراجعة
                  </p>
                </div>
              </div>
            )}

            {dashboard.overview.suspendedCompanies > 0 && (
              <div style={alertBoxStyles('#FEE2E2', '#FECACA', '#991B1B')}>
                <div style={alertIconStyles}>🚫</div>
                <div>
                  <p style={alertTitleStyles}>شركات موقوفة</p>
                  <p style={alertDescriptionStyles}>
                    هناك {dashboard.overview.suspendedCompanies} شركة موقوفة تحتاج مراجعة
                  </p>
                </div>
              </div>
            )}

            {dashboard.overview.pendingReports === 0 && dashboard.overview.suspendedCompanies === 0 && (
              <div style={alertBoxStyles('#F0FDF4', '#BBFB5E', '#166534')}>
                <div style={alertIconStyles}>✅</div>
                <div>
                  <p style={alertTitleStyles}>كل شيء على ما يرام</p>
                  <p style={alertDescriptionStyles}>
                    لا توجد تنبيهات حالياً. المنصة تعمل بشكل سلس
                  </p>
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

// Styles
const containerStyles: React.CSSProperties = {
  background: '#F8FAFC',
  minHeight: '100vh',
  padding: '32px',
  fontFamily: 'Tajawal, sans-serif',
}

const contentWrapperStyles: React.CSSProperties = {
  maxWidth: '1400px',
  margin: '0 auto',
}

const loadingContainerStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100vh',
  background: '#F8FAFC',
  gap: '16px',
}

const loadingSpinnerStyles: React.CSSProperties = {
  width: '40px',
  height: '40px',
  border: '4px solid #E2E8F0',
  borderTop: '4px solid #16A34A',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
}

const loadingTextStyles: React.CSSProperties = {
  color: '#64748B',
  fontSize: '14px',
  margin: 0,
}

const headerStyles: React.CSSProperties = {
  marginBottom: '32px',
  textAlign: 'right',
}

const titleStyles: React.CSSProperties = {
  fontSize: '32px',
  fontWeight: 900,
  color: '#0F172A',
  margin: '0 0 8px 0',
}

const subtitleStyles: React.CSSProperties = {
  color: '#64748B',
  fontSize: '14px',
  margin: 0,
}

const kpiGridStyles: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '20px',
  marginBottom: '32px',
}

const kpiCardStyles: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '12px',
  padding: '24px',
  display: 'flex',
  gap: '16px',
  alignItems: 'flex-start',
}

const kpiIconStyles: React.CSSProperties = {
  fontSize: '32px',
  lineHeight: 1,
}

const kpiContentStyles: React.CSSProperties = {
  flex: 1,
  textAlign: 'right',
}

const kpiLabelStyles: React.CSSProperties = {
  color: '#64748B',
  fontSize: '13px',
  fontWeight: 700,
  margin: '0 0 8px 0',
}

const kpiValueStyles: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: 900,
  margin: 0,
}

const tabContainerStyles: React.CSSProperties = {
  marginBottom: '32px',
  borderBottom: '1px solid #E2E8F0',
}

const tabHeaderStyles: React.CSSProperties = {
  display: 'flex',
  gap: '32px',
  justifyContent: 'flex-end',
}

const tabButtonStyles: React.CSSProperties = {
  padding: '12px 0',
  borderBottom: '2px solid transparent',
  background: 'none',
  border: 'none',
  color: '#64748B',
  fontWeight: 500,
  cursor: 'pointer',
  fontSize: '14px',
  transition: 'all 0.3s',
  fontFamily: 'Tajawal, sans-serif',
}

const tabContentStyles: React.CSSProperties = {
  animation: 'fadeIn 0.3s ease-in',
}

const gridColumnsStyles: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '20px',
  marginBottom: '20px',
}

const cardStyles: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '12px',
  padding: '24px',
}

const cardTitleStyles: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 900,
  color: '#0F172A',
  margin: '0 0 20px 0',
  textAlign: 'right',
}

const statusContainerStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  marginBottom: '16px',
}

const statusItemStyles: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '12px 0',
  borderBottom: '1px solid #E2E8F0',
  alignItems: 'center',
}

const statusLabelStyles: React.CSSProperties = {
  color: '#64748B',
  fontSize: '14px',
}

const statusCountStyles: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 900,
}

const viewMoreStyles: React.CSSProperties = {
  color: '#16A34A',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: '14px',
  display: 'inline-block',
  marginTop: '8px',
}

const actionsListStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const actionItemStyles: React.CSSProperties = {
  display: 'block',
  padding: '12px',
  background: '#F1F5F9',
  borderRadius: '8px',
  textDecoration: 'none',
  cursor: 'pointer',
  transition: 'background 0.3s',
}

const actionTitleStyles: React.CSSProperties = {
  fontWeight: 600,
  color: '#0F172A',
  margin: '0 0 4px 0',
  fontSize: '14px',
  textAlign: 'right',
}

const actionSubtitleStyles: React.CSSProperties = {
  fontSize: '12px',
  color: '#64748B',
  margin: 0,
  textAlign: 'right',
}

const activityListStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
}

const activityItemStyles: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 0',
  borderBottom: '1px solid #E2E8F0',
}

const activityInfoStyles: React.CSSProperties = {
  flex: 1,
}

const activityActionStyles: React.CSSProperties = {
  fontWeight: 600,
  color: '#0F172A',
  margin: '0 0 4px 0',
  fontSize: '14px',
}

const activityUserStyles: React.CSSProperties = {
  fontSize: '12px',
  color: '#64748B',
  margin: 0,
}

const activityTimeStyles: React.CSSProperties = {
  fontSize: '12px',
  color: '#94A3B8',
  margin: 0,
  textAlign: 'left',
}

const analyticsGridStyles: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '16px',
  marginTop: '20px',
}

const analyticsTileStyles: React.CSSProperties = {
  background: '#F8FAFC',
  borderRadius: '8px',
  padding: '16px',
  textAlign: 'center',
}

const analyticsTileLabelStyles: React.CSSProperties = {
  color: '#64748B',
  fontSize: '12px',
  margin: '0 0 8px 0',
}

const analyticsTileValueStyles: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 900,
  margin: 0,
}

const alertsContainerStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
}

const alertBoxStyles = (bgColor: string, borderColor: string, textColor: string): React.CSSProperties => ({
  display: 'flex',
  gap: '12px',
  padding: '16px',
  background: bgColor,
  border: `1px solid ${borderColor}`,
  borderRadius: '12px',
  alignItems: 'flex-start',
})

const alertIconStyles: React.CSSProperties = {
  fontSize: '20px',
  lineHeight: 1,
}

const alertTitleStyles: React.CSSProperties = {
  fontWeight: 600,
  margin: '0 0 4px 0',
  fontSize: '14px',
  textAlign: 'right',
}

const alertDescriptionStyles: React.CSSProperties = {
  fontSize: '13px',
  margin: 0,
  textAlign: 'right',
}

export default AdminDashboard
