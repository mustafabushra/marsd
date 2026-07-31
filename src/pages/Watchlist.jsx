import { useCallback, useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { useNavigate } from 'react-router-dom'
import { getSupabase, searchCompaniesKnowledgeBase } from '../lib/api'
import { useSystemStatus } from '../hooks/useSystemStatus'
import { useEntitlements } from '../hooks/useEntitlements'
import { watchlistRoom } from '../lib/entitlements'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'

const riskOf = (s) => {
  if (s == null) return { label: 'بيانات غير كافية', bg: '#F1F5F9', c: '#64748B', gauge: '#CBD5E1' }
  if (s >= 70) return { label: 'مخاطر منخفضة', bg: '#ECFDF5', c: '#15803D', gauge: '#16A34A' }
  if (s >= 40) return { label: 'مخاطر متوسطة', bg: '#FFFBEB', c: '#B45309', gauge: '#F59E0B' }
  return { label: 'مخاطر مرتفعة', bg: '#FEF2F2', c: '#B91C1C', gauge: '#DC2626' }
}

export default function Watchlist() {
  const navigate = useNavigate()
  const { user } = useUser()
  const systemStatus = useSystemStatus()
  const { entitlements } = useEntitlements()
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState([])
  const [tenantId, setTenantId] = useState(null)
  const [toast, setToast] = useState('')

  // Add modal
  const [addOpen, setAddOpen] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [addResults, setAddResults] = useState([])
  const [addLoading, setAddLoading] = useState(false)
  const [addingId, setAddingId] = useState(null)

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const loadWatchlist = async (tid) => {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('watchlist_items')
      .select('id, company_id, companies ( id, name, cr_number, city, sector )')
      .eq('tenant_id', tid)
    const items = data || []

    // Fetch trust scores for the watched companies in one query
    const ids = items.map((w) => w.company_id).filter(Boolean)
    let scoreMap = {}
    if (ids.length) {
      const { data: ts } = await supabase.from('trust_scores').select('company_id, score, approved_reports').in('company_id', ids)
      ;(ts || []).forEach((t) => { scoreMap[t.company_id] = t })
    }

    setCompanies(items.map((w) => {
      const t = scoreMap[w.company_id]
      const score = t?.score ?? null
      return {
        id: w.id,
        companyId: w.company_id,
        name: w.companies?.name || 'شركة مجهولة',
        city: w.companies?.city,
        sector: w.companies?.sector,
        approvedReports: t?.approved_reports ?? 0,
        score,
      }
    }))
  }

  const init = useCallback(async () => {
    try {
      if (!user?.id) { setLoading(false); return }
      const supabase = getSupabase()
      const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userData?.tenant_id) { setLoading(false); return }
      setTenantId(userData.tenant_id)
      await loadWatchlist(userData.tenant_id)
    } catch (err) {
      console.error('Error loading watchlist:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { init() }, [init])

  // A colleague adding or removing a company, and a score moving underneath one
  // already on the list — the second is the reason to watch a company at all.
  const { connected, liveAt } = useLiveData(init, {
    tables: ['watchlist_items', 'trust_scores'],
    enabled: !!user?.id,
  })

  const handleRemove = async (itemId, companyName) => {
    try {
      const supabase = getSupabase()
      const { error } = await supabase.from('watchlist_items').delete().eq('id', itemId)
      if (error) throw error
      setCompanies((prev) => prev.filter((c) => c.id !== itemId))
      await supabase.from('audit_logs').insert([{ actor_id: user?.id, action: 'removed_from_watchlist', entity: 'watchlist', entity_id: itemId, meta: JSON.stringify({ company_name: companyName }), created_at: new Date().toISOString() }])
    } catch (err) {
      showToast('❌ تعذّر الحذف')
    }
  }

  const runAddSearch = async (q) => {
    if (!q.trim()) { setAddResults([]); return }
    try {
      setAddLoading(true)
      const res = await searchCompaniesKnowledgeBase(q, {}, 1, 20)
      const watchedIds = new Set(companies.map((c) => c.companyId))
      setAddResults((res.data || []).filter((c) => !watchedIds.has(c.id)))
    } catch (err) {
      setAddResults([])
    } finally {
      setAddLoading(false)
    }
  }

  useEffect(() => {
    if (!addOpen) return
    const t = setTimeout(() => runAddSearch(addSearch), 350)
    return () => clearTimeout(t)
  }, [addSearch, addOpen])

  const addToWatchlist = async (company) => {
    if (!tenantId) { showToast('❌ لا توجد شركة مرتبطة بحسابك'); return }
    try {
      setAddingId(company.id)
      const supabase = getSupabase()
      const { data: existing } = await supabase.from('watchlist_items').select('id').eq('tenant_id', tenantId).eq('company_id', company.id).limit(1)
      if (existing?.length) { showToast('ℹ️ الشركة موجودة في القائمة'); return }

      const room = await watchlistRoom(entitlements, tenantId)
      if (!room.allowed) {
        showToast(`باقتك تتيح ${room.ceiling} شركة في قوائم المراقبة، وقد بلغتها. احذف شركة أو رقّ باقتك.`)
        return
      }

      const { error } = await supabase.from('watchlist_items').insert([{ tenant_id: tenantId, company_id: company.id, list_name: 'المراقبة' }])
      if (error) throw error

      await supabase.from('audit_logs').insert([{ actor_id: user?.id, action: 'added_to_watchlist', entity: 'watchlist', entity_id: company.id, meta: JSON.stringify({ company_name: company.name }), created_at: new Date().toISOString() }])
      await loadWatchlist(tenantId)
      setAddResults((prev) => prev.filter((c) => c.id !== company.id))
      showToast('✅ تمت الإضافة لقائمة المراقبة')
    } catch (err) {
      // The limit is enforced by a trigger now, and it says exactly what is wrong
      // and in Arabic. Replacing that with "فشلت الإضافة" throws away the only
      // part of the message the user could act on.
      showToast(`❌ ${err.message || 'فشلت الإضافة'}`)
    } finally {
      setAddingId(null)
    }
  }

  // Real alerts from actual scores
  const highRisk = companies.filter((c) => c.score != null && c.score < 40)
  const midRisk = companies.filter((c) => c.score != null && c.score >= 40 && c.score < 70)
  const alerts = [
    ...highRisk.map((c) => ({ title: `${c.name} — مؤشر ثقة مرتفع المخاطر (${c.score})`, time: 'يتطلب انتباهك', color: '#DC2626' })),
    ...midRisk.map((c) => ({ title: `${c.name} — مخاطر متوسطة (${c.score})`, time: 'راقب التغيّرات', color: '#F59E0B' })),
  ].slice(0, 6)
  if (alerts.length === 0 && companies.length > 0) {
    alerts.push({ title: 'جميع الشركات في قائمتك ضمن نطاق مخاطر جيد', time: 'الآن', color: '#16A34A' })
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
      {toast && <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 120, boxShadow: '0 8px 24px rgba(15,23,42,.25)' }}>{toast}</div>}

      {/* Companies */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: 0 }}>الشركات المُتابَعة {companies.length > 0 && <span style={{ color: '#64748B', fontWeight: 700 }}>({companies.length})</span>}</h3>
            <LiveBadge connected={connected} liveAt={liveAt} />
          </div>
          <button
            onClick={() => { setAddOpen(true); setAddSearch(''); setAddResults([]) }}
            disabled={!systemStatus.accountActive}
            title={!systemStatus.accountActive ? 'الحساب معلق' : ''}
            style={{ background: systemStatus.accountActive ? '#16A34A' : '#94A3B8', color: '#fff', border: 0, borderRadius: '10px', padding: '10px 18px', fontSize: '13.5px', fontWeight: 800, cursor: systemStatus.accountActive ? 'pointer' : 'not-allowed', opacity: systemStatus.accountActive ? 1 : 0.6, fontFamily: 'inherit' }}>
            + إضافة شركة
          </button>
        </div>

        {companies.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ color: '#CBD5E1', marginBottom: '16px', fontSize: '44px' }}>📋</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>لا توجد شركات في قائمتك</div>
            <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '20px' }}>أضِف شركات لمتابعة مؤشر ثقتها وتلقّي التنبيهات</div>
            <button onClick={() => { setAddOpen(true); setAddSearch(''); setAddResults([]) }} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '11px', padding: '13px 28px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>+ إضافة شركة للمراقبة</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {companies.map((w) => {
              const risk = riskOf(w.score)
              const gauge = w.score != null ? `conic-gradient(${risk.gauge} 0% ${Math.min(w.score, 100)}%, #E2E8F0 ${Math.min(w.score, 100)}% 100%)` : 'conic-gradient(#E2E8F0 0% 100%)'
              return (
                <div key={w.id} onClick={() => navigate(`/trust-report/${w.companyId}`)} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '18px', cursor: 'pointer' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: gauge, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', fontWeight: 900, color: '#1E2A52' }}>{w.score != null ? w.score : '—'}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{w.name}</div>
                    <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>{w.sector || '—'}{w.city ? ` · ${w.city}` : ''} · {w.approvedReports} تقرير معتمد</div>
                  </div>
                  <span style={{ background: risk.bg, color: risk.c, borderRadius: '8px', padding: '6px 13px', fontSize: '13px', fontWeight: 800, flex: 'none' }}>● {risk.label}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemove(w.id, w.name) }}
                    style={{ background: '#F1F5F9', color: '#64748B', border: 0, borderRadius: '9px', width: '34px', height: '34px', cursor: 'pointer', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', fontFamily: 'inherit' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#64748B' }}
                    title="حذف من القائمة">✕</button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Alerts */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px', alignSelf: 'start' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px' }}>التنبيهات</h3>
        {alerts.length === 0 ? (
          <div style={{ fontSize: '13.5px', color: '#64748B', fontWeight: 600 }}>لا توجد تنبيهات — أضِف شركات لبدء المتابعة.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {alerts.map((alert, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '11px' }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: alert.color, marginTop: '5px', flex: 'none' }}></span>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#334155', lineHeight: 1.5 }}>{alert.title}</div>
                  <div style={{ fontSize: '12px', color: '#64748B', marginTop: '3px' }}>{alert.time}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add company modal */}
      {addOpen && (
        <div onClick={() => setAddOpen(false)} dir="rtl" style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 24px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '560px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(15,23,42,.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #E2E8F0' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: 0 }}>إضافة شركة للمراقبة</h2>
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
                <div style={{ textAlign: 'center', color: '#64748B', padding: '24px', fontSize: '14px' }}>جاري البحث...</div>
              ) : addResults.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748B', padding: '24px', fontSize: '14px' }}>{addSearch.trim() ? 'لا توجد نتائج مطابقة' : 'اكتب اسم الشركة للبحث'}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {addResults.map((c) => {
                    const risk = riskOf(c.trust_score ?? null)
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 14px' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0F172A' }}>{c.name}</div>
                          <div style={{ fontSize: '12.5px', color: '#64748B' }}>{c.sector || '—'}{c.city ? ` · ${c.city}` : ''} · <span style={{ color: risk.c, fontWeight: 700 }}>{risk.label}</span></div>
                        </div>
                        <button onClick={() => addToWatchlist(c)} disabled={addingId === c.id} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '9px', padding: '9px 16px', fontSize: '13px', fontWeight: 800, cursor: addingId === c.id ? 'not-allowed' : 'pointer', flex: 'none', fontFamily: 'inherit' }}>{addingId === c.id ? '...' : '+ إضافة'}</button>
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
  )
}
