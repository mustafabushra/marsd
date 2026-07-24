import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabase } from '../lib/api'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalCompanies: 0,
    activeSubscriptions: 0,
    pendingReports: 0,
    approvedToday: 0,
    companyRequests: 0,
  })
  const [risk, setRisk] = useState({ low: 0, med: 0, high: 0 })
  const [sectors, setSectors] = useState([])

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = getSupabase()

        const [{ count: companiesCount }, { count: activeSubCount }, { count: pendingCount }] = await Promise.all([
          supabase.from('companies').select('id', { count: 'exact', head: true }),
          supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
        ])

        // Approved today
        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
        const { count: approvedTodayCount } = await supabase
          .from('reports').select('id', { count: 'exact', head: true })
          .eq('status', 'approved').gte('approved_at', startOfToday.toISOString())

        // Pending company data requests
        let companyReqCount = 0
        try {
          const { count } = await supabase
            .from('company_data_requests').select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
          companyReqCount = count || 0
        } catch (e) { /* table may not exist in older envs */ }

        setStats({
          totalCompanies: companiesCount || 0,
          activeSubscriptions: activeSubCount || 0,
          pendingReports: pendingCount || 0,
          approvedToday: approvedTodayCount || 0,
          companyRequests: companyReqCount,
        })

        // Risk distribution from trust scores
        const { data: scores } = await supabase.from('trust_scores').select('score')
        const r = { low: 0, med: 0, high: 0 }
        ;(scores || []).forEach((s) => {
          const v = s.score || 0
          if (v >= 70) r.low++
          else if (v >= 40) r.med++
          else r.high++
        })
        setRisk(r)

        // Top sectors (group companies by sector)
        const { data: companyRows } = await supabase.from('companies').select('sector')
        const counts = {}
        ;(companyRows || []).forEach((c) => {
          const key = (c.sector || '').trim()
          if (!key) return
          counts[key] = (counts[key] || 0) + 1
        })
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
        const max = top.length ? top[0][1] : 1
        setSectors(top.map(([name, val]) => ({ name, val, pct: Math.round((val / max) * 100) })))
      } catch (err) {
        console.error('Error loading admin dashboard:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const riskTotal = risk.low + risk.med + risk.high || 1
  const lowPct = (risk.low / riskTotal) * 100
  const medPct = (risk.med / riskTotal) * 100
  const donut = `conic-gradient(#16A34A 0% ${lowPct}%, #F59E0B ${lowPct}% ${lowPct + medPct}%, #DC2626 ${lowPct + medPct}% 100%)`
  const pctOf = (n) => Math.round((n / riskTotal) * 100)

  const kpis = [
    { label: 'إجمالي الشركات', value: stats.totalCompanies.toLocaleString('en-US'), sub: 'في سجلات مرصد', color: '#1E2A52' },
    { label: 'تقارير قيد المراجعة', value: stats.pendingReports, sub: 'بحاجة لإجراء', color: '#F59E0B' },
    { label: 'التقارير المعتمدة اليوم', value: stats.approvedToday, sub: 'خلال اليوم', color: '#16A34A' },
    { label: 'الاشتراكات النشطة', value: stats.activeSubscriptions.toLocaleString('en-US'), sub: 'حسابات مدفوعة', color: '#7C3AED' },
  ]

  const opsPending = stats.pendingReports + stats.companyRequests

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '18px', marginBottom: '18px' }}>
        {kpis.map((k, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px' }}>
            <div style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 700, marginBottom: '12px' }}>{k.label}</div>
            <div style={{ fontSize: '32px', fontWeight: 900, color: k.color, lineHeight: 1 }}>{loading ? '…' : k.value}</div>
            <div style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 600, marginTop: '6px' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Growth + Risk distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '18px', marginBottom: '18px' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 18px' }}>نمو عدد الشركات</h3>
          <svg viewBox="0 0 460 160" style={{ width: '100%', height: '170px' }}>
            <defs>
              <linearGradient id="gb" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#1E2A52" stopOpacity=".2" />
                <stop offset="1" stopColor="#1E2A52" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" y1="40" x2="460" y2="40" stroke="#F1F5F9" />
            <line x1="0" y1="80" x2="460" y2="80" stroke="#F1F5F9" />
            <line x1="0" y1="120" x2="460" y2="120" stroke="#F1F5F9" />
            <path d="M0,130 L77,118 L154,122 L231,90 L308,78 L385,52 L460,34 L460,160 L0,160 Z" fill="url(#gb)" />
            <polyline points="0,130 77,118 154,122 231,90 308,78 385,52 460,34" fill="none" stroke="#1E2A52" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94A3B8', fontWeight: 600, marginTop: '8px' }}>
            <span>يناير</span><span>فبراير</span><span>مارس</span><span>أبريل</span><span>مايو</span><span>يونيو</span>
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 18px' }}>توزيع مستويات المخاطر</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div style={{ width: '130px', height: '130px', borderRadius: '50%', background: donut, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '20px', fontWeight: 900, color: '#1E2A52' }}>{riskTotal === 1 && !risk.low && !risk.med && !risk.high ? 0 : riskTotal}</span>
                <span style={{ fontSize: '11px', color: '#94A3B8' }}>شركة مُقيّمة</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { c: '#16A34A', label: 'منخفض', pct: pctOf(risk.low) },
                { c: '#F59E0B', label: 'متوسط', pct: pctOf(risk.med) },
                { c: '#DC2626', label: 'مرتفع', pct: pctOf(risk.high) },
              ].map((row) => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '4px', background: row.c }}></span>
                  <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 700 }}>{row.label} — {row.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top sectors + Operations center */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '18px' }}>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 18px' }}>أكثر القطاعات نشاطاً</h3>
          {sectors.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94A3B8', padding: '24px', fontSize: '14px' }}>لا توجد بيانات قطاعات بعد</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {sectors.map((s) => (
                <div key={s.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    <span>{s.name}</span><span style={{ color: '#94A3B8' }}>{s.val.toLocaleString('en-US')}</span>
                  </div>
                  <div style={{ height: '9px', background: '#F1F5F9', borderRadius: '6px', overflow: 'hidden' }}>
                    <div style={{ width: `${s.pct}%`, height: '100%', background: '#1E2A52', borderRadius: '6px' }}></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: 0 }}>مركز العمليات</h3>
            <span style={{ background: '#FEF2F2', color: '#B91C1C', borderRadius: '999px', padding: '4px 12px', fontSize: '12.5px', fontWeight: 900 }}>{opsPending} معلّق</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button onClick={() => navigate('/admin/reports')} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '13px 15px', cursor: 'pointer', textAlign: 'right', width: '100%', fontFamily: 'inherit' }}>
              <span style={{ width: '36px', height: '36px', borderRadius: '9px', background: '#F59E0B', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '14px', flex: 'none' }}>{stats.pendingReports}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>تقارير بانتظار المراجعة</div>
                <div style={{ fontSize: '12px', color: '#B45309', marginTop: '1px' }}>اعتماد أو رفض تقارير الأعضاء</div>
              </div>
              <span style={{ color: '#94A3B8', fontWeight: 900 }}>‹</span>
            </button>
            <button onClick={() => navigate('/admin/requests')} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '13px 15px', cursor: 'pointer', textAlign: 'right', width: '100%', fontFamily: 'inherit' }}>
              <span style={{ width: '36px', height: '36px', borderRadius: '9px', background: '#16A34A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '14px', flex: 'none' }}>{stats.companyRequests}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>طلبات إضافة/تعديل شركات</div>
                <div style={{ fontSize: '12px', color: '#15803D', marginTop: '1px' }}>التحقق من السجل قبل النشر</div>
              </div>
              <span style={{ color: '#94A3B8', fontWeight: 900 }}>‹</span>
            </button>
            <button onClick={() => navigate('/admin/bulk-import')} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: '12px', padding: '13px 15px', cursor: 'pointer', textAlign: 'right', width: '100%', fontFamily: 'inherit' }}>
              <span style={{ width: '36px', height: '36px', borderRadius: '9px', background: '#7C3AED', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flex: 'none' }}>⬆</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>رفع دفعة شركات</div>
                <div style={{ fontSize: '12px', color: '#6D28D9', marginTop: '1px' }}>استيراد جماعي من Excel</div>
              </div>
              <span style={{ color: '#94A3B8', fontWeight: 900 }}>‹</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
