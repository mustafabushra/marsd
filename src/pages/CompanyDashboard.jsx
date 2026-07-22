import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

export default function CompanyDashboard() {
  const navigate = useNavigate()
  const { user } = useUser()
  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState('الشركة')
  const [kpis, setKpis] = useState([
    { label: 'مساهماتي', value: '—', icon: '📋', color: '#7C3AED', sub: '' },
    { label: 'شركات في قوائمي', value: '—', icon: '⭐', color: '#F59E0B', sub: '' },
    { label: 'تقاريري المعتمدة', value: '—', icon: '✓', color: '#16A34A', sub: '' },
    { label: 'رصيدي من النقاط', value: '—', icon: '💎', color: '#1E2A52', sub: '' }
  ])
  const [activity, setActivity] = useState([])
  const [contribPct, setContribPct] = useState('0')

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const supabase = getSupabase()

        // Get current user's tenant info
        const { data: userData } = await supabase
          .from('users')
          .select('tenant_id, first_name, last_name')
          .eq('id', user?.id)
          .single()

        if (!userData?.tenant_id) {
          setLoading(false)
          return
        }

        // Get tenant (company) name
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', userData.tenant_id)
          .single()

        if (tenantData) setCompanyName(tenantData.name)

        // Get submitted reports count
        const { count: reportsCount } = await supabase
          .from('reports')
          .select('id', { count: 'exact' })
          .eq('reporter_tenant_id', userData.tenant_id)

        // Get approved reports count
        const { count: approvedCount } = await supabase
          .from('reports')
          .select('id', { count: 'exact' })
          .eq('reporter_tenant_id', userData.tenant_id)
          .eq('status', 'approved')

        // Get watchlist count
        const { count: watchlistCount } = await supabase
          .from('watchlist_items')
          .select('id', { count: 'exact' })
          .eq('tenant_id', userData.tenant_id)

        // Get credits balance
        const { data: creditsData } = await supabase
          .rpc('get_credit_balance', { p_tenant_id: userData.tenant_id })

        // Get recent notifications (activity)
        const { data: notificationsData } = await supabase
          .from('notifications')
          .select('id, type, message, created_at')
          .eq('tenant_id', userData.tenant_id)
          .order('created_at', { ascending: false })
          .limit(5)

        setKpis([
          { label: 'مساهماتي', value: (reportsCount || 0).toString(), icon: '📋', color: '#7C3AED', sub: `${approvedCount || 0} معتمدة` },
          { label: 'شركات في قوائمي', value: (watchlistCount || 0).toString(), icon: '⭐', color: '#F59E0B', sub: 'تحت المراقبة' },
          { label: 'تقاريري المعتمدة', value: (approvedCount || 0).toString(), icon: '✓', color: '#16A34A', sub: 'من إجمالي مساهماتي' },
          { label: 'رصيدي من النقاط', value: (creditsData || 0).toString(), icon: '💎', color: '#1E2A52', sub: 'نقاط متراكمة' }
        ])

        const formattedActivity = (notificationsData || []).map(n => ({
          title: n.message || 'تحديث جديد',
          time: new Date(n.created_at).toLocaleDateString('ar-SA'),
          dot: '#16A34A'
        }))

        if (formattedActivity.length === 0) {
          formattedActivity.push(
            { title: 'أهلاً بك في مرصد! ابدأ بالبحث عن شركات', time: 'الآن', dot: '#3B82F6' }
          )
        }

        setActivity(formattedActivity)
        setContribPct(Math.min(Math.floor((approvedCount || 0) * 10 / 10), 100))
      } catch (err) {
        console.error('Error loading dashboard:', err)
      } finally {
        setLoading(false)
      }
    }

    if (user?.id) {
      loadDashboardData()
    }
  }, [user?.id])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        جاري التحميل...
      </div>
    )
  }

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '28px' }}>
      <div style={{ marginBottom: '22px' }}>
        <h1 style={{ fontSize: '25px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', letterSpacing: '-0.5px', textAlign: 'right' }}>أهلاً، {companyName} 👋</h1>
        <p style={{ fontSize: '15px', color: '#64748B', margin: 0, fontWeight: 600, textAlign: 'right' }}>نظرة سريعة على نشاطك ومساهماتك في المنصة</p>
      </div>

      {/* Search Box */}
      <div style={{ marginBottom: '22px' }}>
        <button
          onClick={() => navigate('/search')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '11px',
            background: '#F8FAFC',
            border: '1.5px solid #E2E8F0',
            borderRadius: '12px',
            padding: '14px 16px',
            fontSize: '15px',
            color: '#94A3B8',
            cursor: 'pointer',
            fontWeight: 700,
            width: '100%',
            maxWidth: '340px',
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => e.target.style.background = '#F1F5F9'}
          onMouseLeave={(e) => e.target.style.background = '#F8FAFC'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7"></circle>
            <path d="m21 21-4.3-4.3"></path>
          </svg>
          ابحث عن شركة...
        </button>
      </div>

      {/* KPIs Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '18px', marginBottom: '18px' }}>
        {kpis.map((k, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <span style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 700, textAlign: 'right' }}>{k.label}</span>
              <span style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.color, fontSize: '16px', flexShrink: 0 }}>
                {k.icon}
              </span>
            </div>
            <div style={{ fontSize: '32px', fontWeight: 900, color: k.color, lineHeight: 1, textAlign: 'right' }}>{k.value}</div>
            <div style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 600, marginTop: '6px', textAlign: 'right' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Bottom Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '18px' }}>
        {/* Activity */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px' }}>
          <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 18px 0', textAlign: 'right' }}>نشاط حديث</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {activity.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: '13px', padding: '13px 0', borderBottom: '1px solid #F1F5F9', flexDirection: 'row-reverse' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: a.dot, marginTop: '5px', flex: 'none' }}></span>
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#334155', lineHeight: 1.5 }}>{a.title}</div>
                  <div style={{ fontSize: '12.5px', color: '#94A3B8', marginTop: '3px' }}>{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Give to Get */}
          <div style={{ background: 'linear-gradient(135deg,#1E2A52,#16A34A)', borderRadius: '16px', padding: '24px', color: '#fff' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, marginBottom: '8px', textAlign: 'right' }}>فلسفة Give to Get</div>
            <p style={{ fontSize: '13.5px', color: '#DCFCE7', margin: '0 0 16px 0', lineHeight: 1.6, textAlign: 'right' }}>كل ما ساهمت أكثر، استفدت أكثر — {contribPct >= 50 ? 'أنت مساهم مميز!' : 'استمر في المساهمة'}</p>
            <div style={{ height: '12px', background: 'rgba(255,255,255,.1)', borderRadius: '8px', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{ width: `${contribPct}%`, height: '100%', background: 'linear-gradient(90deg,#16A34A,#4ADE80)', borderRadius: '8px' }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', fontWeight: 600, textAlign: 'right' }}>
              <span>{contribPct}%</span>
              <span>من أهداف المساهمة</span>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: '0 0 14px 0', textAlign: 'right' }}>إجراءات سريعة</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={() => navigate('/search')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '11px', padding: '14px 16px', fontSize: '14.5px', fontWeight: 800, color: '#1E2A52', cursor: 'pointer', textAlign: 'right', transition: 'all 0.2s' }} onMouseEnter={(e) => e.target.style.background = '#F1F5F9'} onMouseLeave={(e) => e.target.style.background = '#F8FAFC'}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
                بحث جديد
              </button>
              <button onClick={() => navigate('/add-report')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: '#16A34A', border: 0, borderRadius: '11px', padding: '14px 16px', fontSize: '14.5px', fontWeight: 800, color: '#fff', cursor: 'pointer', textAlign: 'right', transition: 'all 0.2s' }} onMouseEnter={(e) => e.target.style.background = '#15A34A'} onMouseLeave={(e) => e.target.style.background = '#16A34A'}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                إضافة تقرير
              </button>
              <button onClick={() => navigate('/add-company')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '11px', padding: '14px 16px', fontSize: '14.5px', fontWeight: 800, color: '#1E2A52', cursor: 'pointer', textAlign: 'right', transition: 'all 0.2s' }} onMouseEnter={(e) => e.target.style.background = '#F1F5F9'} onMouseLeave={(e) => e.target.style.background = '#F8FAFC'}>
                🏢 إضافة شركة
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
