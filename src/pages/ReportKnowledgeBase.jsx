import { useState, useEffect } from 'react'
import { getSupabase } from '../lib/api'

export default function ReportKnowledgeBase() {
  const [reports, setReports] = useState([])
  const [thisMonth, setThisMonth] = useState(0)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      setLoading(true)
      const supabase = getSupabase()
      const { data } = await supabase
        .from('reports')
        .select('id, approved_at, category, companies:target_company_id ( name, sector )')
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .limit(500)
      const rows = data || []
      setReports(rows)
      const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0)
      setThisMonth(rows.filter((r) => r.approved_at && new Date(r.approved_at) >= startMonth).length)
    } catch (err) {
      console.error('Error loading reports repository:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = reports.filter((r) => {
    const q = query.trim()
    return !q || (r.companies?.name || '').includes(q)
  })

  const kpis = [
    { label: 'إجمالي التقارير المعتمدة', value: reports.length.toLocaleString('en-US'), color: '#1E2A52' },
    { label: 'معتمدة هذا الشهر', value: thisMonth.toLocaleString('en-US'), color: '#16A34A' },
    { label: 'حالة الأرشيف', value: 'محدّث', color: '#7C3AED' },
  ]

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: '#64748B', fontWeight: 600 }}>جاري تحميل الأرشيف...</div>

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '14px', marginBottom: '18px' }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px 20px' }}>
            <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 700, marginBottom: '8px' }}>{k.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '12px', padding: '14px 18px', marginBottom: '18px', display: 'flex', gap: '11px', alignItems: 'center' }}>
        <span style={{ fontSize: '18px' }}>🛡</span>
        <span style={{ fontSize: '13.5px', color: '#3730A3', fontWeight: 700 }}>أرشيف التقارير المعتمدة فقط — لا تُعرض هوية الشركة المُبلِّغة حفاظاً على خصوصية المساهمين.</span>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '11px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '11px', padding: '0 14px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث باسم الشركة المُبلَّغ عنها" style={{ flex: 1, border: 0, background: 'transparent', padding: '12px 0', fontSize: '14.5px', outline: 'none', textAlign: 'right', fontFamily: 'inherit' }} />
        </div>
        <span style={{ alignSelf: 'center', fontSize: '13px', color: '#94A3B8', fontWeight: 700 }}>{filtered.length} تقرير</span>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 1.4fr 1.2fr', padding: '14px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '12.5px', fontWeight: 800, color: '#64748B' }}>
          <span>معرّف التقرير</span><span>الشركة المُبلَّغ عنها</span><span>القطاع</span><span>تاريخ الاعتماد</span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8', fontSize: '14px' }}>لا توجد تقارير معتمدة بعد</div>
        ) : filtered.map((r) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 1.4fr 1.2fr', padding: '13px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#1E2A52', fontFamily: 'monospace' }}>RPT-{String(r.id).slice(0, 8)}</span>
            <span style={{ fontSize: '14px', color: '#0F172A', fontWeight: 700 }}>{r.companies?.name || '—'}</span>
            <span style={{ fontSize: '13.5px', color: '#334155' }}>{r.companies?.sector || '—'}</span>
            <span style={{ fontSize: '12.5px', color: '#94A3B8' }}>{r.approved_at ? new Date(r.approved_at).toLocaleDateString('en-GB') : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
