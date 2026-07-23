import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, CreditCard, FileText, Users, BarChart3, Settings } from 'lucide-react'
import { getSupabase } from '../lib/api'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [stats, setStats] = useState({
    totalCompanies: 0,
    activeSubscriptions: 0,
    pendingReports: 0,
    approvedReports: 0,
    totalUsers: 0,
    totalRevenue: 0,
    averageTrustScore: 0,
    churnRate: 0,
  })
  const [loading, setLoading] = useState(true)
  const [kbStats, setKbStats] = useState({
    avgTrustScore: 0,
    fullTierCompanies: 0,
    preliminaryTierCompanies: 0,
    noDataCompanies: 0,
  })

  // Load real data from Supabase
  useEffect(() => {
    const loadDashboardStats = async () => {
      try {
        const supabase = getSupabase()

        // Get total companies count
        const { count: companiesCount } = await supabase
          .from('companies')
          .select('id', { count: 'exact' })

        // Get active subscriptions count
        const { count: activeSubCount } = await supabase
          .from('subscriptions')
          .select('id', { count: 'exact' })
          .eq('status', 'active')

        // Get pending reports count
        const { count: pendingCount } = await supabase
          .from('reports')
          .select('id', { count: 'exact' })
          .eq('status', 'pending_review')

        // Get approved reports count
        const { count: approvedCount } = await supabase
          .from('reports')
          .select('id', { count: 'exact' })
          .eq('status', 'approved')

        // Get total users count (excluding admins)
        const { count: usersCount } = await supabase
          .from('users')
          .select('id', { count: 'exact' })
          .eq('role', 'company_admin')

        // Get total revenue (sum of invoices)
        const { data: revenueData } = await supabase
          .from('invoices')
          .select('amount')
          .eq('status', 'paid')
        const totalRevenue = revenueData?.reduce((sum, inv) => sum + (inv.amount || 0), 0) || 0

        // Get average trust score
        const { data: trustScores } = await supabase
          .from('trust_scores')
          .select('score')
        const avgTrust = trustScores?.length > 0
          ? Math.round(trustScores.reduce((sum, ts) => sum + (ts.score || 0), 0) / trustScores.length)
          : 0

        // Calculate churn rate: cancelled subscriptions in last 30 days / total subscriptions
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        const { count: cancelledCount } = await supabase
          .from('subscriptions')
          .select('id', { count: 'exact' })
          .eq('status', 'cancelled')
          .gte('updated_at', thirtyDaysAgo.toISOString())

        const totalSubs = (activeSubCount || 0) + (cancelledCount || 0)
        const churnRate = totalSubs > 0 ? Math.round(((cancelledCount || 0) / totalSubs) * 100) : 0

        setStats({
          totalCompanies: companiesCount || 0,
          activeSubscriptions: activeSubCount || 0,
          pendingReports: pendingCount || 0,
          approvedReports: approvedCount || 0,
          totalUsers: usersCount || 0,
          totalRevenue: totalRevenue,
          averageTrustScore: avgTrust,
          churnRate: churnRate,
        })

        // Load Knowledge Base metrics
        try {
          // Count companies by tier (based on report counts)
          const { data: companies } = await supabase
            .from('v_company_knowledge_base')
            .select('id, total_reports_count')

          if (companies && companies.length > 0) {
            let full = 0, preliminary = 0, noData = 0
            companies.forEach(c => {
              const count = c.total_reports_count || 0
              if (count >= 5) full++
              else if (count >= 2) preliminary++
              else noData++
            })
            setKbStats({
              avgTrustScore: avgTrust,
              fullTierCompanies: full,
              preliminaryTierCompanies: preliminary,
              noDataCompanies: noData,
            })
          }
        } catch (kbErr) {
          console.warn('Could not load KB metrics:', kbErr)
        }
      } catch (err) {
        console.error('Error loading admin dashboard stats:', err)
      } finally {
        setLoading(false)
      }
    }

    loadDashboardStats()
  }, [])

  const quickActions = [
    { id: 1, title: 'مراجعة التقارير المعلقة', desc: `${stats.pendingReports} تقارير بانتظار`, icon: FileText, color: '#F59E0B', path: '/admin/reports', btnText: 'عرض التقارير' },
    { id: 2, title: 'إدارة الشركات', desc: `${stats.totalCompanies} شركة مسجلة`, icon: Building2, color: '#3B82F6', path: '/admin/companies', btnText: 'إدارة الشركات' },
    { id: 3, title: 'الاشتراكات النشطة', desc: `${stats.activeSubscriptions} اشتراكات نشطة`, icon: CreditCard, color: '#16A34A', path: '/admin/subscriptions', btnText: 'عرض الاشتراكات' },
    { id: 4, title: 'المستخدمون', desc: `${stats.totalUsers} مستخدم نشط`, icon: Users, color: '#8B5CF6', path: '/admin/users', btnText: 'إدارة المستخدمين' },
    { id: 5, title: '📚 مستودع الشركات المركزي', desc: 'المصدر الوحيد للحقيقة — كل الشركات وبيانات الثقة', icon: Building2, color: '#EC4899', path: '/admin/knowledge-base/companies', btnText: 'عرض المستودع' },
    { id: 6, title: '📋 مستودع التقارير المركزي', desc: 'جميع التقارير والموافقات والسجلات التاريخية', icon: FileText, color: '#8B5CF6', path: '/admin/knowledge-base/reports', btnText: 'إدارة التقارير' },
  ]

  const topCompanies = [
    { name: 'الراجحي للمقاولات', reports: 12, score: 84 },
    { name: 'البناء الحديث', reports: 8, score: 72 },
    { name: 'الصناعات المتقدمة', reports: 6, score: 91 },
    { name: 'النقل السريع', reports: 5, score: 68 },
    { name: 'الخدمات اللوجستية', reports: 4, score: 75 },
  ]

  return (
    <main style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)', minHeight: '100vh', padding: '32px' }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0', textAlign: 'right', letterSpacing: '-0.5px' }}>📊 لوحة التحكم الإدارية</h1>
          <p style={{ color: '#64748B', fontSize: '14px', margin: '0 0 0 0', textAlign: 'right' }}>مرحباً بك في نظام إدارة مرصد — نظرة عامة شاملة على أداء المنصة</p>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          {[
            { label: 'الشركات المسجلة', value: stats.totalCompanies, color: '#3B82F6', icon: '🏢' },
            { label: 'الاشتراكات النشطة', value: stats.activeSubscriptions, color: '#16A34A', icon: '💳' },
            { label: 'التقارير المعلقة', value: stats.pendingReports, color: '#F59E0B', icon: '📋' },
            { label: 'التقارير المعتمدة', value: stats.approvedReports, color: '#8B5CF6', icon: '✅' },
          ].map((kpi, idx) => (
            <div
              key={idx}
              style={{
                background: '#fff', border: '2px solid #E2E8F0', borderRadius: '16px', padding: '24px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.06)', transition: 'all 0.3s ease',
                animation: `fadeIn 0.6s ease-out ${idx * 0.1}s both`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'
                e.currentTarget.style.transform = 'translateY(-4px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ fontSize: '32px' }}>{kpi.icon}</div>
                <p style={{ color: '#64748B', fontSize: '12px', fontWeight: 700, margin: 0 }}>{kpi.label}</p>
              </div>
              <p style={{ fontSize: '36px', fontWeight: 900, color: kpi.color, margin: 0 }}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          {quickActions.map((action, idx) => (
            <div
              key={action.id}
              style={{
                background: '#fff', border: '2px solid #E2E8F0', borderRadius: '16px', padding: '24px',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)', transition: 'all 0.3s ease',
                animation: `slideUp 0.6s ease-out ${0.6 + idx * 0.08}s both`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.1)'
                e.currentTarget.style.transform = 'translateY(-6px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '12px',
                  background: `linear-gradient(135deg, ${action.color}30 0%, ${action.color}10 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${action.color}20`
                }}>
                  <action.icon size={24} color={action.color} />
                </div>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: 0 }}>{action.title}</h3>
                  <p style={{ fontSize: '12px', color: '#94A3B8', margin: '4px 0 0 0' }}>{action.desc}</p>
                </div>
              </div>
              <button
                onClick={() => navigate(action.path)}
                style={{
                  marginTop: 'auto',
                  background: `linear-gradient(135deg, ${action.color} 0%, ${action.color}dd 100%)`,
                  color: '#fff',
                  border: '0',
                  borderRadius: '12px',
                  padding: '12px 18px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: `0 4px 12px ${action.color}30`
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-2px)'
                  e.target.style.boxShadow = `0 6px 16px ${action.color}40`
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)'
                  e.target.style.boxShadow = `0 4px 12px ${action.color}30`
                }}>
                {action.btnText} →
              </button>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{
          borderBottom: '2px solid #E2E8F0', marginBottom: '28px',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end'
        }}>
          <div style={{ display: 'flex', gap: '28px' }}>
            {['overview', 'analytics', 'settings'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '14px 0',
                  borderBottom: activeTab === tab ? '3px solid #16A34A' : 'none',
                  background: 'none',
                  border: 'none',
                  color: activeTab === tab ? '#16A34A' : '#64748B',
                  fontWeight: activeTab === tab ? 700 : 500,
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'all 0.3s ease',
                  textAlign: 'center'
                }}
              >
                {tab === 'overview' && '📊 نظرة عامة'}
                {tab === 'analytics' && '📈 التحليلات'}
                {tab === 'settings' && '⚙️ الإعدادات'}
              </button>
            ))}
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', animation: 'fadeIn 0.4s ease-out' }}>
            {/* Top Companies */}
            <div style={{
              background: '#fff', border: '2px solid #E2E8F0', borderRadius: '16px', padding: '24px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 20px 0', textAlign: 'right' }}>🏆 أكثر الشركات تقارير</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {topCompanies.map((company, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '14px', background: '#F8FAFC', borderRadius: '12px',
                      border: '1px solid #E2E8F0', transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#EEF2FF'
                      e.currentTarget.style.transform = 'translateX(-4px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#F8FAFC'
                      e.currentTarget.style.transform = 'translateX(0)'
                    }}>
                    <div style={{ textAlign: 'right', flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{company.name}</div>
                      <div style={{ fontSize: '12px', color: '#94A3B8' }}>{company.reports} تقرير • {company.score}%</div>
                    </div>
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '50%',
                      background: `conic-gradient(#16A34A 0% ${company.score}%, #E2E8F0 ${company.score}% 100%)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px', fontWeight: 700, color: '#16A34A',
                      boxShadow: '0 2px 8px rgba(22, 163, 74, 0.15)'
                    }}>
                      {company.score}%
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div style={{
              background: '#fff', border: '2px solid #E2E8F0', borderRadius: '16px', padding: '24px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 20px 0', textAlign: 'right' }}>⏱️ النشاط الأخير</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { text: 'تقرير جديد من الراجحي', time: 'قبل 5 دقائق' },
                  { text: 'اشتراك جديد في الباقة الأساسية', time: 'قبل ساعة' },
                  { text: 'تقرير تمت الموافقة عليه', time: 'قبل ساعتين' },
                  { text: 'مستخدم جديد سجل', time: 'قبل 3 ساعات' },
                ].map((activity, idx) => (
                  <div key={idx} style={{ padding: '12px', borderBottom: idx < 3 ? '1px solid #F1F5F9' : 'none' }}>
                    <div style={{ fontSize: '13px', color: '#0F172A', fontWeight: 600, marginBottom: '4px' }}>{activity.text}</div>
                    <div style={{ fontSize: '12px', color: '#94A3B8' }}>{activity.time}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s ease-out' }}>
            {/* Performance Stats */}
            <div style={{
              background: '#fff', border: '2px solid #E2E8F0', borderRadius: '16px', padding: '24px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 20px 0', textAlign: 'right' }}>📊 إحصائيات الأداء</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                {[
                  { label: 'معدل الموافقة على التقارير', value: '92%', color: '#16A34A' },
                  { label: 'متوسط وقت المراجعة', value: '4 ساعات', color: '#3B82F6' },
                  { label: 'رضا المستخدمين', value: '4.8/5', color: '#F59E0B' },
                  { label: 'معدل الاحتفاظ', value: '87%', color: '#8B5CF6' },
                ].map((stat, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                      borderRadius: '12px', padding: '18px', textAlign: 'center',
                      border: '1px solid #E2E8F0', transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}>
                    <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 10px 0', fontWeight: 600 }}>{stat.label}</p>
                    <p style={{ fontSize: '28px', fontWeight: 900, color: stat.color, margin: 0 }}>{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Knowledge Base Metrics */}
            <div style={{
              background: '#fff', border: '2px solid #E2E8F0', borderRadius: '16px', padding: '24px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
            }}>
              <h3 style={{
                fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 20px 0',
                textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px'
              }}>
                📚 مؤشرات مستودع المعرفة
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                {[
                  { label: 'متوسط درجة الثقة', value: `${kbStats.avgTrustScore}%`, color: '#16A34A', desc: 'للشركات المعتمدة' },
                  { label: 'شركات برتبة كاملة', value: kbStats.fullTierCompanies, color: '#3B82F6', desc: '5+ تقارير معتمدة' },
                  { label: 'شركات برتبة أولية', value: kbStats.preliminaryTierCompanies, color: '#F59E0B', desc: '2-4 تقارير معتمدة' },
                  { label: 'شركات بدون بيانات', value: kbStats.noDataCompanies, color: '#94A3B8', desc: 'أقل من تقريرين' },
                ].map((stat, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                      borderRadius: '12px', padding: '18px', textAlign: 'right',
                      border: '1px solid #E2E8F0', transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}>
                    <p style={{ fontSize: '11px', color: '#94A3B8', margin: '0 0 8px 0', fontWeight: 700 }}>{stat.label}</p>
                    <p style={{ fontSize: '28px', fontWeight: 900, color: stat.color, margin: '0 0 6px 0' }}>{stat.value}</p>
                    <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>{stat.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Links to KB */}
            <div style={{
              background: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
              borderRadius: '16px', padding: '28px', color: '#fff',
              boxShadow: '0 8px 24px rgba(102, 126, 234, 0.3)'
            }}>
              <h3 style={{
                fontSize: '16px', fontWeight: 900, margin: '0 0 20px 0', textAlign: 'right',
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px'
              }}>
                ⚡ دخول سريع لمستودعات المعرفة
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <button
                  onClick={() => navigate('/admin/knowledge-base/companies')}
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '12px',
                    padding: '16px',
                    color: '#fff',
                    cursor: 'pointer',
                    textAlign: 'right',
                    fontSize: '13px',
                    fontWeight: 700,
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}>
                  🏢 مستودع الشركات
                </button>
                <button
                  onClick={() => navigate('/admin/knowledge-base/reports')}
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '12px',
                    padding: '16px',
                    color: '#fff',
                    cursor: 'pointer',
                    textAlign: 'right',
                    fontSize: '13px',
                    fontWeight: 700,
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }}>
                  📋 مستودع التقارير
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div style={{
            background: '#fff', border: '2px solid #E2E8F0', borderRadius: '16px', padding: '24px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.06)', animation: 'fadeIn 0.4s ease-out'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 20px 0', textAlign: 'right' }}>⚙️ الإعدادات</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { label: 'إعدادات النظام', desc: 'اضبط إعدادات المنصة العامة', path: '/admin/settings', icon: '⚙️' },
                { label: 'إدارة الأدوار والصلاحيات', desc: 'تحكم في الأدوار والصلاحيات', path: '/admin/roles', icon: '🔐' },
                { label: 'نسخ احتياطية', desc: 'أدر النسخ الاحتياطية للبيانات', path: '/admin/backup', icon: '💾' },
                { label: 'السجلات والتدقيق', desc: 'عرض سجلات النشاط', path: '/admin/logs', icon: '📋' },
              ].map((setting, idx) => (
                <button
                  key={idx}
                  onClick={() => navigate(setting.path)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px',
                    background: '#F8FAFC',
                    border: '2px solid #E2E8F0',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    textAlign: 'right',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#EEF2FF'
                    e.currentTarget.style.borderColor = '#E0E7FF'
                    e.currentTarget.style.transform = 'translateX(-4px)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#F8FAFC'
                    e.currentTarget.style.borderColor = '#E2E8F0'
                    e.currentTarget.style.transform = 'translateX(0)'
                  }}>
                  <span style={{ fontSize: '18px' }}>←</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>{setting.icon}</span>
                      {setting.label}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0 0' }}>{setting.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
