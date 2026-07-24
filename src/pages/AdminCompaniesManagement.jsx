import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

const riskFrom = (score) => {
  if (score == null) return { label: 'بيانات غير كافية', bg: '#F1F5F9', c: '#64748B' }
  if (score >= 70) return { label: 'مخاطر منخفضة', bg: '#ECFDF5', c: '#15803D' }
  if (score >= 40) return { label: 'مخاطر متوسطة', bg: '#FFFBEB', c: '#B45309' }
  return { label: 'مخاطر مرتفعة', bg: '#FEF2F2', c: '#B91C1C' }
}
const statusMeta = (s) => {
  if (s === 'suspended') return { label: 'موقوفة', bg: '#FEF2F2', c: '#B91C1C' }
  if (s === 'pending') return { label: 'قيد المراجعة', bg: '#FFFBEB', c: '#B45309' }
  return { label: 'نشطة', bg: '#ECFDF5', c: '#15803D' }
}

export default function AdminCompaniesManagement() {
  const navigate = useNavigate()
  const { user } = useUser()
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [drawer, setDrawer] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => { fetchCompanies() }, [])
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const fetchCompanies = async () => {
    try {
      setLoading(true)
      const supabase = getSupabase()
      const { data } = await supabase
        .from('companies')
        .select('id, name, cr_number, sector, city, status, approved, verified, trust_scores ( score )')
        .eq('approved', true)
        .order('created_at', { ascending: false })
        .limit(500)
      setCompanies((data || []).map((c) => ({ ...c, score: c.trust_scores?.[0]?.score ?? null })))
    } catch (err) {
      console.error('Error loading companies:', err)
    } finally {
      setLoading(false)
    }
  }

  const stats = {
    total: companies.length,
    active: companies.filter((c) => c.status !== 'suspended').length,
    suspended: companies.filter((c) => c.status === 'suspended').length,
    incomplete: companies.filter((c) => c.score == null).length,
  }

  const filtered = companies.filter((c) => {
    if (filter === 'active' && c.status === 'suspended') return false
    if (filter === 'suspended' && c.status !== 'suspended') return false
    if (filter === 'incomplete' && c.score != null) return false
    const q = search.trim()
    if (q && !((c.name || '').includes(q) || (c.cr_number || '').includes(q))) return false
    return true
  })

  const setStatus = async (company, status) => {
    try {
      setBusy(true)
      const supabase = getSupabase()
      const { error } = await supabase.from('companies').update({ status }).eq('id', company.id)
      if (error) throw error
      await supabase.from('audit_logs').insert([{ actor_id: user?.id || null, action: status === 'suspended' ? 'company_suspended' : 'company_reactivated', entity: 'company', entity_id: company.id, created_at: new Date().toISOString() }]).catch(() => {})
      setCompanies((prev) => prev.map((c) => (c.id === company.id ? { ...c, status } : c)))
      setDrawer((d) => (d && d.id === company.id ? { ...d, status } : d))
      showToast(status === 'suspended' ? 'تم تعليق الشركة' : 'تم إعادة تفعيل الشركة')
    } catch (err) {
      showToast('❌ تعذّر تغيير الحالة')
    } finally { setBusy(false) }
  }

  const statChips = [
    { key: 'all', label: 'إجمالي الشركات', value: stats.total, color: '#1E2A52' },
    { key: 'active', label: 'نشطة', value: stats.active, color: '#16A34A' },
    { key: 'suspended', label: 'موقوفة', value: stats.suspended, color: '#DC2626' },
    { key: 'incomplete', label: 'بيانات ناقصة', value: stats.incomplete, color: '#F59E0B' },
  ]
  const chipStyle = (f) => ({ padding: '9px 16px', borderRadius: '999px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', border: `1.5px solid ${filter === f ? '#1E2A52' : '#E2E8F0'}`, background: filter === f ? '#1E2A52' : '#fff', color: filter === f ? '#fff' : '#64748B' })

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: '#64748B', fontWeight: 600 }}>جاري تحميل الشركات...</div>

  return (
    <div>
      {toast && <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 120, boxShadow: '0 8px 24px rgba(15,23,42,.25)' }}>{toast}</div>}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '14px', marginBottom: '18px' }}>
        {statChips.map((s) => (
          <div key={s.key} onClick={() => setFilter(s.key)} style={{ background: '#fff', border: `1px solid ${filter === s.key ? s.color : '#E2E8F0'}`, borderRadius: '14px', padding: '18px 20px', cursor: 'pointer' }}>
            <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 700, marginBottom: '8px' }}>{s.label}</div>
            <div style={{ fontSize: '26px', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value.toLocaleString('ar-SA')}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '220px', display: 'flex', alignItems: 'center', gap: '11px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '11px', padding: '0 14px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم الشركة أو السجل التجاري" style={{ flex: 1, border: 0, background: 'transparent', padding: '12px 0', fontSize: '14.5px', outline: 'none', textAlign: 'right', fontFamily: 'inherit' }} />
        </div>
        <button onClick={() => navigate('/admin/bulk-import')} style={{ background: '#F5F3FF', color: '#6D28D9', border: '1.5px solid #DDD6FE', borderRadius: '11px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>⬆ رفع دفعة (Excel)</button>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: '9px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        {statChips.map((s) => <span key={s.key} onClick={() => setFilter(s.key)} style={chipStyle(s.key)}>{s.key === 'all' ? 'الكل' : s.label}</span>)}
        <span style={{ marginInlineStart: 'auto', fontSize: '13px', color: '#94A3B8', fontWeight: 700 }}>عرض {filtered.length} من {companies.length} شركة</span>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 1.2fr 0.9fr 1.1fr 0.9fr 40px', padding: '14px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '12.5px', fontWeight: 800, color: '#64748B' }}>
          <span>الشركة</span><span>السجل التجاري</span><span>مؤشر الثقة</span><span>المخاطر</span><span>الحالة</span><span></span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8', fontSize: '14px' }}>لا توجد شركات مطابقة</div>
        ) : filtered.map((c) => {
          const risk = riskFrom(c.score)
          const st = statusMeta(c.status)
          return (
            <div key={c.id} onClick={() => setDrawer(c)} style={{ display: 'grid', gridTemplateColumns: '2.4fr 1.2fr 0.9fr 1.1fr 0.9fr 40px', padding: '13px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <span style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#1E2A52', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '15px', flex: 'none' }}>{(c.name || '؟').charAt(0)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}{c.verified ? ' ✔' : ''}</div>
                  <div style={{ fontSize: '12px', color: '#94A3B8' }}>{c.sector || '—'} · {c.city || '—'}</div>
                </div>
              </div>
              <span style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 600, direction: 'ltr', textAlign: 'right' }}>{c.cr_number || '—'}</span>
              <span style={{ fontSize: '16px', fontWeight: 900, color: '#1E2A52' }}>{c.score != null ? c.score : '—'}</span>
              <span><span style={{ background: risk.bg, color: risk.c, borderRadius: '7px', padding: '4px 11px', fontSize: '12px', fontWeight: 800 }}>{risk.label}</span></span>
              <span><span style={{ background: st.bg, color: st.c, borderRadius: '7px', padding: '4px 11px', fontSize: '12.5px', fontWeight: 800 }}>{st.label}</span></span>
              <span style={{ color: '#CBD5E1', fontWeight: 900, fontSize: '18px', textAlign: 'center' }}>‹</span>
            </div>
          )
        })}
      </div>

      {/* Management drawer */}
      {drawer && (
        <>
          <div onClick={() => setDrawer(null)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,.5)' }}></div>
          <div dir="rtl" style={{ position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 101, width: '520px', maxWidth: '94vw', background: '#fff', boxShadow: '8px 0 40px rgba(0,0,0,.2)', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 26px', borderBottom: '1px solid #E2E8F0', position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
              <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: 0 }}>إدارة الشركة</h3>
              <button onClick={() => setDrawer(null)} style={{ background: '#F1F5F9', border: 0, borderRadius: '9px', width: '34px', height: '34px', fontSize: '18px', cursor: 'pointer', color: '#64748B' }}>✕</button>
            </div>
            <div style={{ padding: '26px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '22px' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: '#1E2A52', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 900, flex: 'none' }}>{(drawer.name || '؟').charAt(0)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: '19px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px', lineHeight: 1.3 }}>{drawer.name}</h2>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ background: statusMeta(drawer.status).bg, color: statusMeta(drawer.status).c, borderRadius: '7px', padding: '3px 10px', fontSize: '12px', fontWeight: 800 }}>{statusMeta(drawer.status).label}</span>
                    <span style={{ background: riskFrom(drawer.score).bg, color: riskFrom(drawer.score).c, borderRadius: '7px', padding: '3px 10px', fontSize: '12px', fontWeight: 800 }}>{riskFrom(drawer.score).label}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '22px' }}>
                {[
                  ['مؤشر الثقة', drawer.score != null ? drawer.score : '—'],
                  ['السجل التجاري', drawer.cr_number || '—'],
                  ['القطاع', drawer.sector || '—'],
                  ['المدينة', drawer.city || '—'],
                ].map(([l, v]) => (
                  <div key={l} style={{ background: '#F8FAFC', borderRadius: '11px', padding: '14px' }}>
                    <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 700, marginBottom: '4px' }}>{l}</div>
                    <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '12px' }}>إجراءات الإدارة</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button onClick={() => navigate(`/trust-report/${drawer.id}`)} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '14px 16px', cursor: 'pointer', textAlign: 'right', width: '100%', fontFamily: 'inherit' }}>
                  <span style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#EEF2FF', color: '#1E2A52', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', flex: 'none' }}>📊</span>
                  <div style={{ flex: 1 }}><div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>عرض تقرير الثقة الكامل</div><div style={{ fontSize: '12.5px', color: '#94A3B8' }}>كل المؤشرات والتقارير المعتمدة</div></div>
                </button>
                {drawer.status === 'suspended' ? (
                  <button onClick={() => setStatus(drawer, 'active')} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F0FDF4', border: '1.5px solid #BBF7D0', borderRadius: '12px', padding: '14px 16px', cursor: busy ? 'not-allowed' : 'pointer', textAlign: 'right', width: '100%', fontFamily: 'inherit' }}>
                    <span style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#16A34A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', flex: 'none' }}>✓</span>
                    <div style={{ flex: 1 }}><div style={{ fontSize: '14.5px', fontWeight: 800, color: '#15803D' }}>إعادة تفعيل الحساب</div><div style={{ fontSize: '12.5px', color: '#16A34A' }}>استئناف ظهور الشركة في المنصة</div></div>
                  </button>
                ) : (
                  <button onClick={() => setStatus(drawer, 'suspended')} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: '12px', padding: '14px 16px', cursor: busy ? 'not-allowed' : 'pointer', textAlign: 'right', width: '100%', fontFamily: 'inherit' }}>
                    <span style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#DC2626', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', flex: 'none' }}>⛔</span>
                    <div style={{ flex: 1 }}><div style={{ fontSize: '14.5px', fontWeight: 800, color: '#B91C1C' }}>تعليق حساب الشركة</div><div style={{ fontSize: '12.5px', color: '#DC2626' }}>إخفاء مؤقت من نتائج البحث</div></div>
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
