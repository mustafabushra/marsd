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

      // Audit log
      const { data: user } = await supabase.auth.getUser()
      await supabase
        .from('audit_logs')
        .insert([{
          actor_id: user.user?.id,
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
      <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)' }}>
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'spin 2s linear infinite' }}>⏳</div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#64748B' }}>جاري تحميل قائمة المراقبة...</div>
        </div>
      </main>
    )
  }

  return (
    <main style={{ background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)', minHeight: '100vh', padding: '28px 32px' }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '28px', animation: 'fadeIn 0.6s ease-out' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0', textAlign: 'right' }}>⭐ قائمة المراقبة</h1>
          <p style={{ color: '#64748B', fontSize: '14px', margin: '0 0 0 0', textAlign: 'right' }}>تابع الشركات المهمة وحصل على تنبيهات فورية عند تغييرات مؤشر الثقة</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '20px' }}>
          {/* Left side: Companies */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexDirection: 'row-reverse' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 0 0', textAlign: 'right' }}>📊 الشركات المُتابَعة ({companies.length})</h3>
              <button
                onClick={() => navigate('/search')}
                disabled={!systemStatus.accountActive}
                title={!systemStatus.accountActive ? 'الحساب معلق' : ''}
                style={{
                  background: systemStatus.accountActive ? 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)' : '#D1D5DB',
                  color: '#fff',
                  border: '0',
                  borderRadius: '12px',
                  padding: '10px 20px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: systemStatus.accountActive ? 'pointer' : 'not-allowed',
                  opacity: systemStatus.accountActive ? 1 : 0.6,
                  transition: 'all 0.3s ease',
                  boxShadow: systemStatus.accountActive ? '0 4px 12px rgba(22, 163, 74, 0.25)' : 'none'
                }}
                onMouseEnter={(e) => {
                  if (systemStatus.accountActive) {
                    e.target.style.transform = 'translateY(-2px)'
                    e.target.style.boxShadow = '0 6px 16px rgba(22, 163, 74, 0.35)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (systemStatus.accountActive) {
                    e.target.style.transform = 'translateY(0)'
                    e.target.style.boxShadow = '0 4px 12px rgba(22, 163, 74, 0.25)'
                  }
                }}>
                + إضافة
              </button>
            </div>
            {companies.length === 0 ? (
              <div style={{
                background: '#fff', border: '2px solid #E2E8F0', borderRadius: '16px', padding: '48px 32px',
                textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', animation: 'fadeIn 0.6s ease-out 0.1s both'
              }}>
                <div style={{ color: '#CBD5E1', marginBottom: '16px', fontSize: '48px' }}>📋</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>لا توجد شركات في قائمتك</div>
                <div style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '20px' }}>ابدأ بالبحث عن شركات وأضفها للمراقبة للحصول على تنبيهات</div>
                <button
                  onClick={() => navigate('/search')}
                  style={{
                    background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                    color: '#fff', border: 0, borderRadius: '12px', padding: '12px 28px',
                    fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'translateY(-2px)'
                    e.target.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.35)'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)'
                    e.target.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.25)'
                  }}>
                  🔍 البحث عن الشركات
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', animation: 'fadeIn 0.6s ease-out 0.1s both' }}>
                {companies.map((w, idx) => (
                  <div
                    key={w.id}
                    style={{
                      background: '#fff', border: '2px solid #E2E8F0', borderRadius: '16px', padding: '18px 20px',
                      display: 'flex', alignItems: 'center', gap: '18px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                      transition: 'all 0.3s ease',
                      animation: `fadeIn 0.6s ease-out ${0.1 + idx * 0.08}s both`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.1)'
                      e.currentTarget.style.transform = 'translateY(-2px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }}>
                    <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: w.gaugeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                      <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 900, color: '#1E2A52' }}>{w.score}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{w.name}</div>
                      <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600, marginTop: '4px' }}>📍 {w.city || 'السعودية'}</div>
                    </div>
                    <svg viewBox="0 0 90 32" style={{ width: '96px', height: '34px', flex: 'none' }}>
                      <polyline points={w.pts} fill="none" stroke={w.lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></polyline>
                    </svg>
                    <span style={{ background: w.tBg, color: w.tColor, borderRadius: '10px', padding: '8px 14px', fontSize: '12px', fontWeight: 800, flex: 'none', border: '1px solid #E2E8F0' }}>{w.trend}</span>
                    <button
                      onClick={() => handleRemove(w.id, w.name)}
                      style={{
                        background: '#FEE2E2',
                        color: '#DC2626',
                        border: '0',
                        borderRadius: '10px',
                        width: '36px',
                        height: '36px',
                        cursor: 'pointer',
                        fontSize: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 'none',
                        transition: 'all 0.3s ease',
                        fontWeight: 700
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = '#FECACA'
                        e.target.style.transform = 'scale(1.1)'
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = '#FEE2E2'
                        e.target.style.transform = 'scale(1)'
                      }}
                      title="حذف من القائمة">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right side: Alerts */}
          <div style={{
            background: '#fff', border: '2px solid #E2E8F0', borderRadius: '16px', padding: '24px',
            alignSelf: 'start', boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
            animation: 'slideInRight 0.6s ease-out 0.2s both'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 20px 0', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>🔔 التنبيهات</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {alerts.map((alert, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex', gap: '12px', flexDirection: 'row-reverse',
                    padding: '12px', background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
                    borderRadius: '12px', border: '1px solid #E2E8F0',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)'
                  }}>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '50%', background: alert.color,
                    marginTop: '0px', flex: 'none', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '12px'
                  }} title={alert.color === '#DC2626' ? 'تنبيه هام' : 'تنبيه إيجابي'}>
                    {alert.color === '#DC2626' ? '!' : '✓'}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', lineHeight: 1.5 }}>{alert.title}</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>{alert.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
