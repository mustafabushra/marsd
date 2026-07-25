import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { searchCompaniesKnowledgeBase, getAutocompleteCompanies, getSupabase } from '../lib/api'
import { Search as SearchIcon, X } from 'lucide-react'
import { useEntitlements } from '../hooks/useEntitlements'
import { watchlistRoom } from '../lib/entitlements'

const EMPTY_REQ_FORM = { sector: '', city: '', region: '', unified: '', entityType: '', mainActivity: '', field: 'sector', correctValue: '', note: '' }

export default function Search() {
  const navigate = useNavigate()
  const { user } = useUser()
  const { entitlements } = useEntitlements()
  const [companies, setCompanies] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [autocomplete, setAutocomplete] = useState([])
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [toast, setToast] = useState('')
  const autocompleteRef = useRef(null)

  const [filters, setFilters] = useState({ sector: null, city: null, risk: null, score: null })
  const [showFilters, setShowFilters] = useState({ sector: false, city: false, risk: false, score: false })
  const [reqModalCompany, setReqModalCompany] = useState(null)
  const [reqSubModal, setReqSubModal] = useState(null) // 'add_data' | 'edit_data'
  const [reqForm, setReqForm] = useState(EMPTY_REQ_FORM)
  const [reqSubmitting, setReqSubmitting] = useState(false)

  function openReqSubModal(type) {
    setReqForm(EMPTY_REQ_FORM)
    setReqSubModal(type)
  }

  async function addToWatchlist(company) {
    if (!company) return
    if (!user?.id) { showToastMessage('⚠️ يجب تسجيل الدخول'); return }
    try {
      setReqSubmitting(true)
      const supabase = getSupabase()
      const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userData?.tenant_id) { showToastMessage('❌ لا توجد شركة مرتبطة بحسابك'); return }

      // Avoid duplicates
      const { data: existing } = await supabase
        .from('watchlist_items')
        .select('id')
        .eq('tenant_id', userData.tenant_id)
        .eq('company_id', company.id)
        .limit(1)
      if (existing?.length) {
        showToastMessage('ℹ️ الشركة موجودة في قائمة المراقبة')
        setReqModalCompany(null)
        return
      }

      const room = await watchlistRoom(entitlements, userData.tenant_id)
      if (!room.allowed) {
        showToastMessage(`باقتك تتيح ${room.ceiling} شركة في قوائم المراقبة، وقد بلغتها`)
        setReqModalCompany(null)
        return
      }

      const { error } = await supabase.from('watchlist_items').insert([{
        tenant_id: userData.tenant_id,
        company_id: company.id,
        list_name: 'المراقبة',
      }])
      if (error) throw error
      showToastMessage('✅ تمت إضافة الشركة لقائمة المراقبة')
      setReqModalCompany(null)
    } catch (err) {
      console.error('Add to watchlist failed:', err)
      showToastMessage('❌ فشلت الإضافة لقائمة المراقبة')
    } finally {
      setReqSubmitting(false)
    }
  }

  async function submitCompanyDataRequest() {
    if (!reqModalCompany || !reqSubModal) return
    let payload = {}
    if (reqSubModal === 'add_data') {
      const p = {
        sector: reqForm.sector || null,
        city: reqForm.city || null,
        region: reqForm.region || null,
        unified_number: reqForm.unified || null,
        entity_type: reqForm.entityType || null,
        main_activity: reqForm.mainActivity || null,
      }
      if (!Object.values(p).some(Boolean)) {
        showToastMessage('⚠️ أدخل بياناً واحداً على الأقل')
        return
      }
      payload = p
    } else {
      if (!reqForm.correctValue.trim()) {
        showToastMessage('⚠️ أدخل القيمة الصحيحة')
        return
      }
      payload = { field: reqForm.field, correct_value: reqForm.correctValue.trim() }
    }

    try {
      setReqSubmitting(true)
      const supabase = getSupabase()
      let tenantId = null
      if (user?.id) {
        const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
        tenantId = userData?.tenant_id || null
      }
      const { error } = await supabase.from('company_data_requests').insert([{
        company_id: reqModalCompany.id,
        requested_by_tenant_id: tenantId,
        requested_by_user_id: user?.id || null,
        request_type: reqSubModal,
        payload,
        note: reqForm.note || null,
        status: 'pending',
      }])
      if (error) throw error
      showToastMessage('✅ تم إرسال طلبك لإدارة مرصد للمراجعة')
      setReqSubModal(null)
      setReqModalCompany(null)
    } catch (err) {
      console.error('Company data request failed:', err)
      showToastMessage('❌ فشل إرسال الطلب')
    } finally {
      setReqSubmitting(false)
    }
  }

  const sectors = ['تقنية', 'مقاولات', 'تجارة', 'صناعة', 'نقل', 'خدمات', 'عقارات', 'رعاية صحية']
  const cities = ['الرياض', 'جدة', 'مكة المكرمة', 'المدينة المنورة', 'الدمام', 'الخبر', 'الظهران', 'الطائف', 'بريدة', 'تبوك', 'أبها', 'القصيم']
  const risks = ['مخاطر منخفضة', 'مخاطر متوسطة', 'مخاطر عالية']
  const scores = ['70+', '40-70', '<40']

  function showToastMessage(msg, duration = 3000) {
    setToast(msg)
    setTimeout(() => setToast(''), duration)
  }

  function getRiskInfo(score) {
    if (score >= 70) return { label: 'مخاطر منخفضة', color: '#15803D', bg: '#ECFDF5' }
    if (score >= 40) return { label: 'مخاطر متوسطة', color: '#B45309', bg: '#FFFBEB' }
    return { label: 'مخاطر عالية', color: '#DC2626', bg: '#FEF2F2' }
  }

  function getGaugeGradient(score) {
    const percent = Math.min(Math.max(score, 0), 100)
    return `conic-gradient(${
      score >= 70 ? '#16A34A' : score >= 40 ? '#F59E0B' : '#EF4444'
    } 0% ${percent}%, #E2E8F0 ${percent}% 100%)`
  }

  async function handleAutocomplete(raw) {
    const q = (raw || '').trim().replace(/\s+/g, ' ')
    if (q.length < 1) {
      setAutocomplete([])
      return
    }
    try {
      const result = await getAutocompleteCompanies(q, 8)
      setAutocomplete(result.data || [])
      setShowAutocomplete(true)
    } catch (err) {
      console.error('Autocomplete error:', err)
    }
  }

  function handleAutocompleteSelect(suggestion) {
    setQuery(suggestion.name)
    setShowAutocomplete(false)
  }

  function handleClearSearch() {
    setQuery('')
    setCompanies([])
    setAutocomplete([])
    setShowAutocomplete(false)
    setError('')
  }

  async function handleSearch(activeFilters = filters) {
    if (!query.trim()) {
      showToastMessage('⚠️ أدخل نص البحث')
      return
    }
    setLoading(true)
    setError('')
    try {
      // Normalize the term: trim edges and collapse internal whitespace
      const q = query.trim().replace(/\s+/g, ' ')
      const result = await searchCompaniesKnowledgeBase(q, activeFilters, 1, 50)
      let formatted = result.data.map(c => ({
        id: c.id,
        name: c.name,
        sector: c.sector || '—',
        city: c.city || '—',
        scoreText: c.trust_score?.toString() || '—',
        score: c.trust_score || 0,
        gaugeBg: c.trust_score ? getGaugeGradient(c.trust_score) : 'conic-gradient(#E2E8F0 0% 100%)',
        riskLabel: c.trust_score ? getRiskInfo(c.trust_score).label : 'بيانات غير كافية',
        color: c.trust_score ? getRiskInfo(c.trust_score).color : '#94A3B8',
        bg: c.trust_score ? getRiskInfo(c.trust_score).bg : '#F1F5F9',
        hasData: c.trust_score != null && c.trust_score > 0,
        reports: c.total_reports_count || 0,
        status: c.registration_status,
      }))

      // Show only published companies — hide suspended / pending / rejected (unapproved)
      formatted = formatted.filter(c => c.status === 'active' || c.status === 'approved')

      // Client-side filters (the KB RPC only handles source/status).
      const looseMatch = (val, f) => {
        const a = (val || '').trim()
        return a && (a.includes(f) || f.includes(a))
      }
      if (activeFilters.sector) formatted = formatted.filter(c => looseMatch(c.sector, activeFilters.sector))
      if (activeFilters.city) formatted = formatted.filter(c => looseMatch(c.city, activeFilters.city))
      if (activeFilters.risk) formatted = formatted.filter(c => c.riskLabel === activeFilters.risk)
      if (activeFilters.score) {
        formatted = formatted.filter(c => {
          if (activeFilters.score === '70+') return c.score >= 70
          if (activeFilters.score === '40-70') return c.score >= 40 && c.score < 70
          return c.score < 40
        })
      }

      formatted.sort((a, b) => {
        if (b.reports !== a.reports) return b.reports - a.reports
        return b.score - a.score
      })

      setCompanies(formatted)
      showToastMessage(`✅ تم العثور على ${formatted.length} شركة`)
    } catch (err) {
      setError(err.message || 'فشل البحث')
      showToastMessage('❌ حدث خطأ أثناء البحث')
    } finally {
      setLoading(false)
    }
  }

  function handleApplyFilter(filterType, value) {
    const newFilters = { ...filters, [filterType]: filters[filterType] === value ? null : value }
    setFilters(newFilters)
    setShowFilters({ ...showFilters, [filterType]: false })
    if (query.trim()) handleSearch(newFilters)
  }

  function handleAddCompany() {
    // Carry the search term into the "Add company" request page (prefilled).
    // Digits-only → registry (CR) number field; otherwise → company name field.
    const q = query.trim()
    const isRegistryNumber = /^[0-9]{6,}$/.test(q)
    navigate('/add-company', { state: isRegistryNumber ? { registryNumber: q } : { companyName: q } })
  }

  function handleViewReport(companyId) {
    navigate(`/trust-report/${companyId}`)
  }

  useEffect(() => {
    if (query.length === 0) {
      setCompanies([])
      setAutocomplete([])
      setShowAutocomplete(false)
      return
    }

    const autocompleteTimer = setTimeout(() => handleAutocomplete(query), 100)
    const searchTimer = setTimeout(() => handleSearch(), 500)

    return () => {
      clearTimeout(autocompleteTimer)
      clearTimeout(searchTimer)
    }
  }, [query])

  useEffect(() => {
    function handleClickOutside(e) {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target)) {
        setShowAutocomplete(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '24px',
          background: '#0F172A', color: '#fff',
          borderRadius: '10px', padding: '12px 18px',
          fontSize: '13.5px', fontWeight: 700, zIndex: 100,
          boxShadow: '0 8px 24px rgba(15,23,42,.25)'
        }}>
          {toast}
        </div>
      )}

      {/* SEARCH CARD */}
      <div ref={autocompleteRef} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '11px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: '12px', padding: '0 16px', position: 'relative' }}>
            <SearchIcon size={20} color="#94A3B8" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => query.length > 0 && setShowAutocomplete(true)}
              placeholder="ابحث بالاسم أو رقم السجل التجاري"
              style={{ flex: 1, border: 0, background: 'transparent', padding: '14px 0', fontSize: '15.5px', outline: 'none', textAlign: 'right', fontFamily: 'inherit' }}
            />

            {/* Autocomplete */}
            {showAutocomplete && autocomplete.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: '#fff', border: '1px solid #E2E8F0',
                borderRadius: '12px', maxHeight: '260px', overflowY: 'auto', zIndex: 20, marginTop: '6px',
                boxShadow: '0 12px 32px rgba(15,23,42,.12)'
              }}>
                {autocomplete.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleAutocompleteSelect(item)}
                    style={{
                      padding: '12px 16px', borderBottom: idx < autocomplete.length - 1 ? '1px solid #F1F5F9' : 'none',
                      cursor: 'pointer', textAlign: 'right', fontSize: '14px', fontWeight: 600, color: '#334155'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}>
                    {item.name}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleSearch}
            disabled={!query || loading}
            style={{
              background: query ? '#1E2A52' : '#94A3B8', color: '#fff', border: 0, borderRadius: '12px',
              padding: '0 30px', fontSize: '15px', fontWeight: 800, cursor: query ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit', flex: 'none'
            }}>
            بحث
          </button>
        </div>

        {/* FILTERS */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '13.5px', color: '#94A3B8', fontWeight: 700, padding: '8px 0' }}>تصفية:</span>
          {[
            { key: 'sector', label: 'القطاع', options: sectors },
            { key: 'city', label: 'المدينة', options: cities },
            { key: 'risk', label: 'مستوى المخاطر', options: risks },
            { key: 'score', label: 'مؤشر الثقة', options: scores },
          ].map(filter => {
            const active = filters[filter.key] != null
            return (
              <div key={filter.key} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowFilters({ ...showFilters, [filter.key]: !showFilters[filter.key] })}
                  style={{
                    background: active ? '#1E2A52' : '#EEF2FF', color: active ? '#fff' : '#1E2A52', border: 0, borderRadius: '999px',
                    padding: '8px 16px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
                  }}>
                  {active ? filters[filter.key] : filter.label} ▾
                </button>

                {showFilters[filter.key] && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, background: '#fff', border: '1px solid #E2E8F0',
                    borderRadius: '12px', marginTop: '6px', zIndex: 20, minWidth: '160px', overflow: 'hidden',
                    boxShadow: '0 12px 32px rgba(15,23,42,.12)'
                  }}>
                    {filter.options.map(opt => (
                      <button
                        key={opt}
                        onClick={() => handleApplyFilter(filter.key, opt)}
                        style={{
                          width: '100%', textAlign: 'right', padding: '11px 14px', border: 0,
                          background: filters[filter.key] === opt ? '#F0FDF4' : '#fff',
                          borderBottom: '1px solid #F1F5F9', cursor: 'pointer', fontSize: '13.5px', fontWeight: 600,
                          color: filters[filter.key] === opt ? '#15803D' : '#334155', fontFamily: 'inherit'
                        }}>
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* RESULTS COUNT */}
      {companies.length > 0 && (
        <div style={{ fontSize: '14.5px', color: '#64748B', fontWeight: 700, marginBottom: '16px' }}>{companies.length} نتائج</div>
      )}

      {/* ERROR */}
      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', padding: '14px 18px', borderRadius: '12px', marginBottom: '16px', fontSize: '13.5px', fontWeight: 700 }}>
          ❌ {error}
        </div>
      )}

      {/* EMPTY STATE */}
      {!loading && query && companies.length === 0 && !error && (
        <div style={{ background: '#fff', border: '1.5px dashed #CBD5E1', borderRadius: '16px', padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '44px', marginBottom: '12px' }}>🔍</div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>لم يتم العثور على نتائج</div>
          <div style={{ fontSize: '14px', color: '#64748B', marginBottom: '20px' }}>جرب اسم شركة أخرى أو رقم سجل مختلف</div>
          <button onClick={handleAddCompany} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '11px', padding: '13px 26px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>+ طلب إضافة شركة</button>
        </div>
      )}

      {/* RESULTS GRID */}
      {companies.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '18px' }}>
          {companies.map((c) => (
            <div key={c.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: '14px', marginBottom: '18px' }}>
                <div style={{ width: '78px', height: '78px', borderRadius: '50%', background: c.gaugeBg, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '58px', height: '58px', borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '21px', fontWeight: 900, color: '#1E2A52', lineHeight: 1 }}>{c.scoreText}</span>
                    <span style={{ fontSize: '9.5px', color: '#94A3B8' }}>من 100</span>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', margin: '0 0 7px', lineHeight: 1.4, textAlign: 'right' }}>{c.name}</h3>
                  <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                    <span style={{ background: '#F1F5F9', color: '#475569', borderRadius: '6px', padding: '3px 9px', fontSize: '12px', fontWeight: 700 }}>{c.sector}</span>
                    <span style={{ background: '#F1F5F9', color: '#475569', borderRadius: '6px', padding: '3px 9px', fontSize: '12px', fontWeight: 700 }}>{c.city}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <span style={{ background: c.bg, color: c.color, borderRadius: '999px', padding: '6px 14px', fontSize: '13px', fontWeight: 800 }}>● {c.riskLabel}</span>
                <span style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 600 }}>{c.reports} تقرير</span>
              </div>

              {c.hasData ? (
                <button
                  onClick={() => handleViewReport(c.id)}
                  style={{ marginTop: 'auto', width: '100%', background: '#1E2A52', color: '#fff', border: 0, borderRadius: '10px', padding: '11px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#0F172A'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#1E2A52'}>
                  عرض التقرير
                </button>
              ) : (
                <button
                  onClick={() => setReqModalCompany(c)}
                  style={{ marginTop: 'auto', width: '100%', background: '#fff', color: '#B45309', border: '1.5px solid #FDE68A', borderRadius: '10px', padding: '11px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                  طلب إضافة بيانات / تقرير
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* BOTTOM CTA */}
      <div style={{ background: '#fff', border: '1.5px dashed #CBD5E1', borderRadius: '16px', padding: '28px', marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '52px', height: '52px', borderRadius: '13px', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flex: 'none' }}>🔎</div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', marginBottom: '3px' }}>لم تجد الشركة التي تبحث عنها؟</div>
            <div style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.6 }}>أضِفها لسجل مرصد — بعد موافقة الإدارة تصبح متاحة للجميع، ويمكنك تقييمها مباشرة.</div>
          </div>
        </div>
        <button onClick={handleAddCompany} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '11px', padding: '13px 26px', fontSize: '15px', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', flex: 'none', fontFamily: 'inherit' }}>+ إضافة شركة للسجل</button>
      </div>

      {/* REQUEST (DATA / REPORT) MODAL */}
      {reqModalCompany && (
        <div
          onClick={() => setReqModalCompany(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
          dir="rtl">
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(15,23,42,.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '22px 26px', borderBottom: '1px solid #E2E8F0' }}>
              <div>
                <h2 style={{ fontSize: '19px', fontWeight: 900, color: '#0F172A', margin: 0 }}>بيانات هذه الشركة غير مكتملة</h2>
                <div style={{ fontSize: '13.5px', color: '#64748B', marginTop: '4px', lineHeight: 1.6 }}>{reqModalCompany.name} · {reqModalCompany.reports} تقارير فقط (لا يوجد تقييم موثوق بعد)</div>
              </div>
              <button
                onClick={() => setReqModalCompany(null)}
                style={{ background: '#F1F5F9', border: 0, borderRadius: '9px', width: '34px', height: '34px', fontSize: '18px', cursor: 'pointer', color: '#64748B', flex: 'none' }}>✕</button>
            </div>
            <div style={{ padding: '24px' }}>
              <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.7, margin: '0 0 18px' }}>ساهم في إكمال ملف هذه الشركة. اختر نوع الطلب:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  onClick={() => { const c = reqModalCompany; setReqModalCompany(null); navigate('/add-report', { state: { companyId: c.id, companyName: c.name } }) }}
                  style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#F0FDF4', border: '1.5px solid #BBF7D0', borderRadius: '13px', padding: '16px 18px', cursor: 'pointer', textAlign: 'right', width: '100%', fontFamily: 'inherit' }}>
                  <span style={{ width: '42px', height: '42px', borderRadius: '11px', background: '#16A34A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flex: 'none' }}>⭐</span>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>إضافة تقرير (تقييم)</div>
                    <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>قيّم الشركة من واقع تعاملك معها</div>
                  </div>
                </button>
                <button
                  onClick={() => addToWatchlist(reqModalCompany)}
                  disabled={reqSubmitting}
                  style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '13px', padding: '16px 18px', cursor: reqSubmitting ? 'not-allowed' : 'pointer', textAlign: 'right', width: '100%', fontFamily: 'inherit' }}>
                  <span style={{ width: '42px', height: '42px', borderRadius: '11px', background: '#EEF2FF', color: '#1E2A52', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flex: 'none' }}>👁</span>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>إضافة لقائمة المراقبة</div>
                    <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>تابِع الشركة ويصلك تنبيه عند توفّر تقييم موثوق</div>
                  </div>
                </button>
                <button
                  onClick={() => openReqSubModal('add_data')}
                  style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '13px', padding: '16px 18px', cursor: 'pointer', textAlign: 'right', width: '100%', fontFamily: 'inherit' }}>
                  <span style={{ width: '42px', height: '42px', borderRadius: '11px', background: '#EEF2FF', color: '#1E2A52', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flex: 'none' }}>＋</span>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>إضافة بيانات ناقصة</div>
                    <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>القطاع، المدينة، الرقم الموحّد، وغيرها</div>
                  </div>
                </button>
                <button
                  onClick={() => openReqSubModal('edit_data')}
                  style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '13px', padding: '16px 18px', cursor: 'pointer', textAlign: 'right', width: '100%', fontFamily: 'inherit' }}>
                  <span style={{ width: '42px', height: '42px', borderRadius: '11px', background: '#FEF3C7', color: '#B45309', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flex: 'none' }}>✎</span>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>طلب تعديل بيانات خاطئة</div>
                    <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>أبلِغ الإدارة عن بيانات غير دقيقة للمراجعة</div>
                  </div>
                </button>
              </div>
              <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '11px', padding: '13px 16px', marginTop: '18px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '17px' }}>ℹ</span>
                <span style={{ fontSize: '13px', color: '#3730A3', fontWeight: 700, lineHeight: 1.6 }}>تُراجَع كل الطلبات من إدارة مرصد قبل اعتمادها وتحديث ملف الشركة.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REQUEST SUB-FORM MODAL (add missing data / request edit) */}
      {reqModalCompany && reqSubModal && (
        <div
          onClick={() => setReqSubModal(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
          dir="rtl">
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(15,23,42,.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '22px 26px', borderBottom: '1px solid #E2E8F0' }}>
              <div>
                <h2 style={{ fontSize: '19px', fontWeight: 900, color: '#0F172A', margin: 0 }}>{reqSubModal === 'add_data' ? 'إضافة بيانات ناقصة' : 'طلب تعديل بيانات خاطئة'}</h2>
                <div style={{ fontSize: '13.5px', color: '#64748B', marginTop: '4px' }}>{reqModalCompany.name}</div>
              </div>
              <button
                onClick={() => setReqSubModal(null)}
                style={{ background: '#F1F5F9', border: 0, borderRadius: '9px', width: '34px', height: '34px', fontSize: '18px', cursor: 'pointer', color: '#64748B', flex: 'none' }}>✕</button>
            </div>
            <div style={{ padding: '24px' }}>
              {reqSubModal === 'add_data' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {[
                    { key: 'sector', label: 'القطاع', ph: 'مثال: تجارة' },
                    { key: 'mainActivity', label: 'النشاط الرئيسي', ph: 'مثال: تجارة الجملة' },
                    { key: 'city', label: 'المدينة', ph: 'مثال: الرياض' },
                    { key: 'region', label: 'المنطقة', ph: 'مثال: منطقة الرياض' },
                    { key: 'unified', label: 'الرقم الموحّد (700)', ph: '7001234567' },
                    { key: 'entityType', label: 'نوع الكيان', ph: 'ذات مسؤولية محدودة' },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>{f.label}</label>
                      <input
                        placeholder={f.ph}
                        value={reqForm[f.key]}
                        onChange={(e) => setReqForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit', textAlign: 'right' }}
                      />
                    </div>
                  ))}
                  <div style={{ gridColumn: '1/3' }}>
                    <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>ملاحظة (اختياري)</label>
                    <textarea
                      placeholder="أي تفاصيل إضافية تساعد الإدارة..."
                      value={reqForm.note}
                      onChange={(e) => setReqForm(prev => ({ ...prev, note: e.target.value }))}
                      style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit', textAlign: 'right', minHeight: '70px', resize: 'vertical' }}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>الحقل المراد تعديله</label>
                    <select
                      value={reqForm.field}
                      onChange={(e) => setReqForm(prev => ({ ...prev, field: e.target.value }))}
                      style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit', textAlign: 'right', background: '#fff' }}>
                      <option value="name">اسم الشركة</option>
                      <option value="sector">القطاع</option>
                      <option value="city">المدينة</option>
                      <option value="cr_number">رقم السجل التجاري</option>
                      <option value="unified_number">الرقم الموحّد (700)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>القيمة الصحيحة</label>
                    <input
                      placeholder="اكتب القيمة الصحيحة"
                      value={reqForm.correctValue}
                      onChange={(e) => setReqForm(prev => ({ ...prev, correctValue: e.target.value }))}
                      style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit', textAlign: 'right' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '14px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '7px', textAlign: 'right' }}>سبب التعديل (اختياري)</label>
                    <textarea
                      placeholder="لماذا البيان الحالي غير دقيق؟"
                      value={reqForm.note}
                      onChange={(e) => setReqForm(prev => ({ ...prev, note: e.target.value }))}
                      style={{ width: '100%', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', outline: 'none', fontFamily: 'inherit', textAlign: 'right', minHeight: '80px', resize: 'vertical' }}
                    />
                  </div>
                </div>
              )}

              <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '11px', padding: '13px 16px', marginTop: '18px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '17px' }}>ℹ</span>
                <span style={{ fontSize: '13px', color: '#3730A3', fontWeight: 700, lineHeight: 1.6 }}>يُراجَع الطلب من إدارة مرصد قبل اعتماده وتحديث ملف الشركة.</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '22px' }}>
                <button
                  onClick={() => setReqSubModal(null)}
                  style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 26px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                  رجوع
                </button>
                <button
                  onClick={submitCompanyDataRequest}
                  disabled={reqSubmitting}
                  style={{ background: reqSubmitting ? '#94A3B8' : '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '12px 34px', fontSize: '14.5px', fontWeight: 800, cursor: reqSubmitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {reqSubmitting ? 'جاري الإرسال...' : 'إرسال الطلب'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
