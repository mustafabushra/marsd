import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { getSupabase, searchCompaniesKnowledgeBase, trustScoreOf } from '../lib/api'
import { useEntitlements } from '../hooks/useEntitlements'
import { UNLIMITED } from '../lib/entitlements'
import { FeatureGate } from '../components/LimitGate'

// Fallback only. How many companies may be compared is a plan limit
// (compare_items); this is what applies when a plan does not name one.
const MAX = 4

const riskOf = (s) => {
  if (s == null) return { label: 'بيانات غير كافية', bg: '#F1F5F9', c: '#64748B' }
  if (s >= 70) return { label: 'مخاطر منخفضة', bg: '#ECFDF5', c: '#15803D' }
  if (s >= 40) return { label: 'مخاطر متوسطة', bg: '#FFFBEB', c: '#B45309' }
  return { label: 'مخاطر مرتفعة', bg: '#FEF2F2', c: '#B91C1C' }
}
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'))

const METRICS = [
  { key: 'sector', label: 'القطاع', type: 'text' },
  { key: 'city', label: 'المدينة', type: 'text' },
  { key: 'cr_number', label: 'السجل التجاري', type: 'text', ltr: true },
  { key: 'verified', label: 'حالة التحقق', type: 'verified' },
  { key: 'trustScore', label: 'مؤشر الثقة', type: 'num', better: 'high' },
  { key: '__risk', label: 'مستوى المخاطر', type: 'risk' },
  { key: 'approvedReports', label: 'التقارير المعتمدة', type: 'num', better: 'high' },
  { key: 'onTimePct', label: 'السداد في الوقت', type: 'pct', better: 'high' },
  { key: 'avgDelay', label: 'متوسط التأخير (يوم)', type: 'num', better: 'low' },
  { key: 'defaults', label: 'حالات التعثّر', type: 'num', better: 'low' },
]

export default function Compare() {
  const navigate = useNavigate()
  const { can, limitOf, loading: entLoading, entitlements } = useEntitlements()
  const [items, setItems] = useState([])
  const [addOpen, setAddOpen] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState([])
  const [addLoading, setAddLoading] = useState(false)
  const [addingId, setAddingId] = useState(null)
  const [toast, setToast] = useState('')

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  // How wide a comparison may be comes from the plan. A plan that names no
  // ceiling gets the fallback rather than an unbounded table the layout cannot
  // hold.
  const compareCeiling = limitOf('compare_items')
  const maxItems = compareCeiling === UNLIMITED || compareCeiling <= 0 ? MAX : compareCeiling

  const runSearch = async (q) => {
    if (!q.trim()) { setAddResults([]); return }
    try {
      setAddLoading(true)
      const res = await searchCompaniesKnowledgeBase(q.trim().replace(/\s+/g, ' '), {}, 1, 20)
      const chosen = new Set(items.map((i) => i.id))
      const published = (res.data || []).filter((c) => (c.registration_status === 'active' || c.registration_status === 'approved') && !chosen.has(c.id))
      setAddResults(published)
    } catch (e) { setAddResults([]) } finally { setAddLoading(false) }
  }
  useEffect(() => {
    if (!addOpen) return
    const t = setTimeout(() => runSearch(addSearch), 350)
    return () => clearTimeout(t)
  }, [addSearch, addOpen])

  const addCompany = async (company) => {
    if (items.length >= maxItems) { showToast(`باقتك تتيح مقارنة حتى ${maxItems} شركات`); return }
    try {
      setAddingId(company.id)
      const supabase = getSupabase()
      const [{ data: c }, { data: reps }] = await Promise.all([
        supabase.from('companies').select('id, name, cr_number, sector, city, verified, trust_scores ( score )').eq('id', company.id).single(),
        supabase.from('reports').select('delay_days, defaulted, payment_commitment').eq('target_company_id', company.id).eq('status', 'approved'),
      ])
      if (!c) throw new Error('not found')
      const approved = reps || []
      const n = approved.length
      const item = {
        id: c.id,
        name: c.name,
        sector: c.sector || null,
        city: c.city || null,
        cr_number: c.cr_number || null,
        verified: !!c.verified,
        trustScore: trustScoreOf(c)?.score ?? null,
        approvedReports: n,
        avgDelay: n ? Math.round(approved.reduce((s, r) => s + (r.delay_days || 0), 0) / n) : null,
        defaults: approved.filter((r) => r.defaulted).length,
        onTimePct: n ? Math.round((approved.filter((r) => r.payment_commitment === 'full').length / n) * 100) : null,
      }
      setItems((prev) => (prev.some((p) => p.id === item.id) ? prev : [...prev, item]))
      setAddResults((prev) => prev.filter((r) => r.id !== company.id))
      if (items.length + 1 >= maxItems) setAddOpen(false)
    } catch (e) {
      showToast('❌ تعذّر إضافة الشركة')
    } finally { setAddingId(null) }
  }

  const removeItem = (id) => setItems((prev) => prev.filter((p) => p.id !== id))

  // Best value per metric row (direction-aware), for highlighting
  const bestOf = (m) => {
    if (!m.better || items.length < 2) return null
    const vals = items.map((i) => i[m.key]).filter((v) => v != null)
    if (!vals.length) return null
    return m.better === 'high' ? Math.max(...vals) : Math.min(...vals)
  }

  const cellText = (m, it) => {
    const v = it[m.key]
    if (m.type === 'text') return v || '—'
    if (m.type === 'num') return v == null ? '—' : fmt(v)
    if (m.type === 'pct') return v == null ? '—' : `${v}%`
    if (m.type === 'verified') return v ? '✔ موثّقة' : 'غير موثّقة'
    if (m.type === 'risk') return riskOf(it.trustScore).label
    return '—'
  }

  const exportExcel = () => {
    const header = ['المؤشر', ...items.map((i) => i.name)]
    const rows = METRICS.map((m) => [m.label, ...items.map((it) => cellText(m, it))])
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'comparison')
    XLSX.writeFile(wb, 'marsad_comparison.xlsx')
  }

  const gridCols = `minmax(150px, 1.4fr) ${items.map(() => 'minmax(150px, 1fr)').join(' ')}`

  // Comparison is a paid feature. The page states that rather than hiding the
  // route, so a member who reaches it — from the sidebar, a bookmark, a
  // colleague's link — learns what it is and what includes it, instead of
  // meeting a blank screen.
  //
  // This was `if (!entLoading && !can('compare'))`, which reads correctly and
  // behaves backwards: while the plan is still loading the condition is false,
  // so the whole comparison table rendered first and the lock replaced it a few
  // seconds later. FeatureGate waits instead of guessing.
  return (
    <FeatureGate
      loading={entLoading}
      allowed={can('compare')}
      feature="compare"
      featureName={entitlements?.featureCatalog?.compare || 'مقارنة الشركات'}
    >
    <div>
      {toast && <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 120, boxShadow: '0 8px 24px rgba(15,23,42,.25)' }}>{toast}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: 0 }}>مقارنة الشركات</h3>
          <p style={{ fontSize: '13px', color: '#94A3B8', margin: '3px 0 0', fontWeight: 600 }}>قارن حتى {maxItems} شركات من واقع مؤشرات مرصد الحقيقية</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => { setAddOpen(true); setAddSearch(''); setAddResults([]) }} disabled={items.length >= maxItems} style={{ background: items.length >= maxItems ? '#94A3B8' : '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '10px 18px', fontSize: '13.5px', fontWeight: 800, cursor: items.length >= maxItems ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>+ إضافة شركة</button>
          <button onClick={exportExcel} disabled={items.length === 0} style={{ background: '#fff', color: items.length ? '#15803D' : '#94A3B8', border: `1.5px solid ${items.length ? '#BBF7D0' : '#E2E8F0'}`, borderRadius: '10px', padding: '10px 18px', fontSize: '13.5px', fontWeight: 800, cursor: items.length ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>⬇ تصدير Excel</button>
          <button onClick={() => window.print()} disabled={items.length === 0} style={{ background: '#fff', color: items.length ? '#1E2A52' : '#94A3B8', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '10px 18px', fontSize: '13.5px', fontWeight: 800, cursor: items.length ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>🖨 طباعة / PDF</button>
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '52px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '44px', marginBottom: '14px' }}>📊</div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>ابدأ بإضافة شركات للمقارنة</div>
          <div style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '20px' }}>أضِف شركتين على الأقل لعرض مقارنة جنباً إلى جنب لمؤشرات الثقة والسداد والتقارير.</div>
          <button onClick={() => { setAddOpen(true); setAddSearch(''); setAddResults([]) }} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '11px', padding: '13px 28px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>+ إضافة شركة للمقارنة</button>
        </div>
      ) : (
        <>
          {items.length === 1 && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '13px 16px', marginBottom: '14px', fontSize: '13.5px', color: '#92400E', fontWeight: 700 }}>ℹ أضِف شركة أخرى على الأقل لبدء المقارنة.</div>
          )}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflowX: 'auto' }}>
            <div style={{ minWidth: `${150 + items.length * 150}px` }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: gridCols }}>
                <div style={{ padding: '18px 20px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13.5px', fontWeight: 800, color: '#64748B' }}>المؤشر</div>
                {items.map((c) => (
                  <div key={c.id} style={{ padding: '16px 18px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0', textAlign: 'center', position: 'relative' }}>
                    <button onClick={() => removeItem(c.id)} title="إزالة" style={{ position: 'absolute', top: '8px', left: '8px', background: '#fff', border: '1px solid #E2E8F0', borderRadius: '7px', width: '24px', height: '24px', fontSize: '12px', cursor: 'pointer', color: '#94A3B8', fontFamily: 'inherit' }}>✕</button>
                    <div onClick={() => navigate(`/trust-report/${c.id}`)} style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A', lineHeight: 1.4, cursor: 'pointer' }}>{c.name}</div>
                    <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '3px' }}>{c.city || '—'}</div>
                  </div>
                ))}
              </div>
              {/* Rows */}
              {METRICS.map((m) => {
                const best = bestOf(m)
                return (
                  <div key={m.key} style={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: '1px solid #F1F5F9' }}>
                    <div style={{ padding: '15px 20px', fontSize: '14px', fontWeight: 700, color: '#334155' }}>{m.label}</div>
                    {items.map((it) => {
                      const raw = it[m.key]
                      const isBest = best != null && raw != null && raw === best && items.length >= 2
                      return (
                        <div key={it.id} style={{ padding: '15px 18px', borderRight: '1px solid #F1F5F9', textAlign: 'center', fontSize: '14px', fontWeight: isBest ? 800 : 700, color: isBest ? '#15803D' : '#334155', background: isBest ? '#F0FDF4' : '#fff', direction: m.ltr ? 'ltr' : undefined }}>
                          {m.type === 'risk' ? (
                            <span style={{ background: riskOf(it.trustScore).bg, color: riskOf(it.trustScore).c, borderRadius: '7px', padding: '4px 11px', fontSize: '12.5px', fontWeight: 800 }}>{riskOf(it.trustScore).label}</span>
                          ) : cellText(m, it)}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
          <p style={{ fontSize: '12.5px', color: '#94A3B8', margin: '12px 2px 0', fontWeight: 600 }}>القيم الخضراء تُشير إلى الأفضل في كل مؤشر. "—" يعني لا توجد بيانات كافية بعد.</p>
        </>
      )}

      {/* Add modal */}
      {addOpen && (
        <div onClick={() => setAddOpen(false)} dir="rtl" style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 24px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '560px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(15,23,42,.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E2E8F0' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: 0 }}>إضافة شركة للمقارنة</h2>
              <button onClick={() => setAddOpen(false)} style={{ background: '#F1F5F9', border: 0, borderRadius: '9px', width: '34px', height: '34px', fontSize: '18px', cursor: 'pointer', color: '#64748B' }}>✕</button>
            </div>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '11px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '0 16px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
                <input autoFocus value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder="ابحث بالاسم أو رقم السجل التجاري" style={{ flex: 1, border: 0, background: 'transparent', padding: '13px 0', fontSize: '15px', outline: 'none', textAlign: 'right', fontFamily: 'inherit' }} />
              </div>
            </div>
            <div style={{ padding: '14px 24px', overflowY: 'auto', flex: 1 }}>
              {addLoading ? (
                <div style={{ textAlign: 'center', color: '#94A3B8', padding: '24px', fontSize: '14px' }}>جاري البحث...</div>
              ) : addResults.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94A3B8', padding: '24px', fontSize: '14px' }}>{addSearch.trim() ? 'لا توجد نتائج مطابقة' : 'اكتب اسم الشركة للبحث'}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {addResults.map((c) => {
                    const risk = riskOf(c.trust_score ?? null)
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 14px' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>{c.name}</div>
                          <div style={{ fontSize: '12.5px', color: '#94A3B8' }}>{c.sector || '—'}{c.city ? ` · ${c.city}` : ''} · <span style={{ color: risk.c, fontWeight: 700 }}>{risk.label}</span></div>
                        </div>
                        <button onClick={() => addCompany(c)} disabled={addingId === c.id} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '9px', padding: '9px 16px', fontSize: '13px', fontWeight: 800, cursor: addingId === c.id ? 'not-allowed' : 'pointer', flex: 'none', fontFamily: 'inherit' }}>{addingId === c.id ? '...' : '+ إضافة'}</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </FeatureGate>
  )
}
