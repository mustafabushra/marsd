import { useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { useNavigate } from 'react-router-dom'
import { getSupabase } from '../lib/api'
import { AlertIcon } from '../components/icons'
import { useUserRole } from '../hooks/useUserRole'
import { useSystemStatus } from '../hooks/useSystemStatus'

export default function Watchlist() {
  const navigate = useNavigate()
  const { user } = useUser()
  const { role, loading: roleLoading } = useUserRole()
  const systemStatus = useSystemStatus()
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState([])
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    const loadWatchlist = async () => {
      try {
        const supabase = getSupabase()

        // Get current user's tenant
        const { data: userData } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', user?.id)
          .single()

        if (!userData?.tenant_id) {
          setLoading(false)
          return
        }

        // Get watchlist items with company and trust score data
        const { data: watchlistData } = await supabase
          .from('watchlist_items')
          .select(`
            id,
            company_id,
            companies (
              id,
              name,
              cr_number,
              city
            ),
            trust_scores (
              score,
              risk_band,
              tier,
              approved_reports
            )
          `)
          .eq('tenant_id', userData.tenant_id)

        const formatted = (watchlistData || []).map(w => {
          const score = w.trust_scores?.score || 0
          return {
            id: w.id,
            name: w.companies?.name || 'شركة مجهولة',
            crNumber: w.companies?.cr_number,
            city: w.companies?.city,
            score: score.toString(),
            gaugeBg: `conic-gradient(#16A34A 0% ${Math.min(score, 100)}%,#E2E8F0 ${Math.min(score, 100)}% 100%)`,
            pts: '10,25 20,18 30,22 40,15 50,20 60,12 70,18 80,10',
            lineColor: score >= 70 ? '#16A34A' : score >= 40 ? '#F59E0B' : '#DC2626',
            trend: '→ ±0',
            tBg: '#F1F5F9',
            tColor: '#64748B'
          }
        })

        setCompanies(formatted)

        // Simple alerts based on scores
        if (formatted.length > 0) {
          const alertsList = formatted
            .filter(c => parseInt(c.score) < 50)
            .map((c, idx) => ({
              title: `${c.name} — مؤشر ثقة منخفض (${c.score})`,
              time: 'مراقبة جارية',
              color: '#DC2626'
            }))
            .slice(0, 5)

          setAlerts(alertsList.length > 0 ? alertsList : [
            { title: 'جميع الشركات في قائمتك تتمتع بمؤشرات ثقة جيدة', time: 'الآن', color: '#16A34A' }
          ])
        }
      } catch (err) {
        console.error('Error loading watchlist:', err)
      } finally {
        setLoading(false)
      }
    }

    if (user?.id) {
      loadWatchlist()
    }
  }, [user?.id])

  const handleRemove = async (itemId, companyName) => {
    try {
      const supabase = getSupabase()
      const { error } = await supabase
        .from('watchlist_items')
        .delete()
        .eq('id', itemId)

      if (error) throw error

      setCompanies(companies.filter(c => c.id !== itemId))

      // Audit log (users.id === Clerk user id)
      await supabase
        .from('audit_logs')
        .insert([{
          actor_id: user?.id,
          action: 'removed_from_watchlist',
          entity: 'watchlist',
          entity_id: itemId,
          meta: JSON.stringify({ company_name: companyName }),
          created_at: new Date().toISOString()
        }])
        .catch(err => console.warn('Audit log warning:', err))
    } catch (err) {
      console.error('Failed to remove from watchlist:', err)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '44px', marginBottom: '16px', animation: 'spin 2s linear infinite' }}>⏳</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#64748B' }}>جاري تحميل قائمة المراقبة...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '18px' }}>
      {/* Left side: Companies */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: 0 }}>الشركات المُتابَعة</h3>
          <button
            onClick={() => navigate('/search')}
            disabled={!systemStatus.accountActive}
            title={!systemStatus.accountActive ? 'الحساب معلق' : ''}
            style={{
              background: systemStatus.accountActive ? '#16A34A' : '#94A3B8',
              color: '#fff', border: 0, borderRadius: '10px', padding: '10px 18px',
              fontSize: '13.5px', fontWeight: 800, cursor: systemStatus.accountActive ? 'pointer' : 'not-allowed',
              opacity: systemStatus.accountActive ? 1 : 0.6, fontFamily: 'inherit'
            }}>
            + إضافة شركة
          </button>
        </div>
        {companies.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ color: '#CBD5E1', marginBottom: '16px', fontSize: '44px' }}>📋</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>لا توجد شركات في قائمتك</div>
            <div style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '20px' }}>ابدأ بالبحث عن شركات وأضفها للمراقبة للحصول على تنبيهات</div>
            <button
              onClick={() => navigate('/search')}
              style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '11px', padding: '13px 28px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              🔍 البحث عن الشركات
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {companies.map((w) => (
              <div
                key={w.id}
                style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '18px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: w.gaugeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 900, color: '#1E2A52' }}>{w.score}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{w.name}</div>
                  <div style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 600, marginTop: '2px' }}>مؤشر الثقة الحالي</div>
                </div>
                <svg viewBox="0 0 90 32" style={{ width: '96px', height: '34px', flex: 'none' }}>
                  <polyline points={w.pts} fill="none" stroke={w.lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></polyline>
                </svg>
                <span style={{ background: w.tBg, color: w.tColor, borderRadius: '8px', padding: '6px 13px', fontSize: '13.5px', fontWeight: 800, flex: 'none' }}>{w.trend}</span>
                <button
                  onClick={() => handleRemove(w.id, w.name)}
                  style={{
                    background: '#F1F5F9', color: '#64748B', border: 0, borderRadius: '9px',
                    width: '34px', height: '34px', cursor: 'pointer', fontSize: '15px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', fontFamily: 'inherit'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#64748B' }}
                  title="حذف من القائمة">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right side: Alerts */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px', alignSelf: 'start' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px' }}>التنبيهات</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {alerts.map((alert, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '11px' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: alert.color, marginTop: '5px', flex: 'none' }}></span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155', lineHeight: 1.5 }}>{alert.title}</div>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '3px' }}>{alert.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
