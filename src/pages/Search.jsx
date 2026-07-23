import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchCompaniesKnowledgeBase, getAutocompleteCompanies, getSupabase, buildCompanyInsert } from '../lib/api'
import { Search as SearchIcon, X } from 'lucide-react'

export default function Search() {
  const navigate = useNavigate()
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

  const sectors = ['تقنية', 'مقاولات', 'صناعات', 'نقل', 'خدمات']
  const cities = ['الرياض', 'جدة', 'الدمام', 'الخبر', 'الدعيان']
  const risks = ['مخاطر منخفضة', 'مخاطر متوسطة', 'مخاطر عالية']
  const scores = ['70+', '40-70', '<40']

  function showToastMessage(msg, duration = 3000) {
    setToast(msg)
    setTimeout(() => setToast(''), duration)
  }

  function getRiskInfo(score) {
    if (score >= 70) return { label: 'مخاطر منخفضة', color: '#15803D' }
    if (score >= 40) return { label: 'مخاطر متوسطة', color: '#B45309' }
    return { label: 'مخاطر عالية', color: '#DC2626' }
  }

  function getGaugeGradient(score) {
    const percent = Math.min(Math.max(score, 0), 100)
    return `conic-gradient(${
      score >= 70 ? '#16A34A' : score >= 40 ? '#F59E0B' : '#EF4444'
    } 0deg ${percent * 3.6}deg, #E0E0E0 ${percent * 3.6}deg 360deg)`
  }

  async function handleAutocomplete(q) {
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

  async function handleSearch() {
    if (!query.trim()) {
      showToastMessage('⚠️ أدخل نص البحث')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await searchCompaniesKnowledgeBase(query, filters, 1, 50)
      let formatted = result.data.map(c => ({
        id: c.id,
        name: c.name,
        sector: c.sector || '—',
        city: c.city || '—',
        scoreText: c.trust_score?.toString() || '—',
        score: c.trust_score || 0,
        gaugeBg: c.trust_score ? getGaugeGradient(c.trust_score) : 'conic-gradient(#E0E0E0 0deg 360deg)',
        riskLabel: c.trust_score ? getRiskInfo(c.trust_score).label : 'بيانات غير كافية',
        color: c.trust_score ? getRiskInfo(c.trust_score).color : '#9CA3AF',
        reports: c.total_reports_count || 0,
      }))

      if (filters.risk) formatted = formatted.filter(c => c.riskLabel === filters.risk)
      if (filters.score) {
        formatted = formatted.filter(c => {
          if (filters.score === '70+') return c.score >= 70
          if (filters.score === '40-70') return c.score >= 40 && c.score < 70
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
    if (companies.length > 0) handleSearch()
  }

  async function handleAddCompany() {
    if (!query.trim()) {
      showToastMessage('⚠️ أدخل اسم الشركة أولاً')
      return
    }

    if (window.confirm(`تأكيد إضافة الشركة: "${query}"?`)) {
      try {
        setLoading(true)
        const supabase = getSupabase()
        const { data: existing } = await supabase.from('companies').select('id').or(`name.ilike.%${query}%`).limit(1)
        if (existing?.length) {
          showToastMessage('⚠️ الشركة موجودة بالفعل')
          return
        }

        const { error } = await supabase.from('companies').insert([buildCompanyInsert({ name: query, approved: false })]).select().single()
        if (error) throw new Error('فشل إضافة الشركة')
        showToastMessage(`✅ تم إضافة الشركة`)
        await handleSearch()
      } catch (err) {
        showToastMessage('❌ فشل إضافة الشركة')
      } finally {
        setLoading(false)
      }
    }
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
    <main style={{ background: '#fff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '20px', left: '20px',
          background: '#1E2A52', color: '#fff',
          borderRadius: '6px', padding: '12px 16px',
          fontSize: '13px', fontWeight: '600', zIndex: 100,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
        }}>
          {toast}
        </div>
      )}

      {/* HEADER */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#1E2A52', margin: 0, textAlign: 'right' }}>البحث</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: '#16A34A', color: '#fff', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '700' }}>✓</div>
          <span style={{ fontSize: '18px', fontWeight: '700', color: '#1E2A52' }}>مرصد</span>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, padding: '40px 32px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          {/* HERO SECTION */}
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
            <h2 style={{ fontSize: '32px', fontWeight: '700', color: '#1E2A52', margin: '0 0 8px 0' }}>البحث عن الشركات</h2>
            <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>ابحث عن أي شركة لعرض درجة الثقة والمخاطر والتقارير السابقة</p>
          </div>

          {/* SEARCH BOX */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '24px', marginBottom: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }} ref={autocompleteRef}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', position: 'relative', flexDirection: 'row-reverse' }}>
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
                border: '1px solid #D1D5DB', borderRadius: '6px', padding: '12px 14px',
                background: '#fff', position: 'relative', flexDirection: 'row-reverse'
              }}>
                <SearchIcon size={16} color="#9CA3AF" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => query.length > 0 && setShowAutocomplete(true)}
                  placeholder="...ابحث باسم الشركة أو رقم السجل (مثل: الراجحي - 1010012345)"
                  style={{
                    flex: 1, border: '0', background: 'transparent', padding: '0', fontSize: '13px', outline: 'none', textAlign: 'right'
                  }}
                />

                {/* Autocomplete */}
                {showAutocomplete && autocomplete.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0,
                    background: '#fff', border: '1px solid #E5E7EB',
                    borderRadius: '0 0 6px 6px', maxHeight: '250px', overflowY: 'auto', zIndex: 10, marginTop: '-1px'
                  }}>
                    {autocomplete.map((item, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleAutocompleteSelect(item)}
                        style={{
                          padding: '10px 12px', borderBottom: idx < autocomplete.length - 1 ? '1px solid #F3F4F6' : 'none',
                          cursor: 'pointer', textAlign: 'right', fontSize: '13px', color: '#1F2937'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#F9FAFB'}
                        onMouseLeave={(e) => e.target.style.background = '#fff'}>
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
                  background: '#9CA3AF', color: '#fff', border: 'none', borderRadius: '6px',
                  padding: '12px 24px', fontSize: '13px', fontWeight: '700', cursor: query ? 'pointer' : 'not-allowed',
                  opacity: query ? 1 : 0.6, transition: 'all 0.2s'
                }}>
                بحث
              </button>
            </div>

            {/* FILTERS */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flexDirection: 'row-reverse' }}>
              {[
                { key: 'score', label: 'الثقة', options: scores },
                { key: 'risk', label: 'المخاطر', options: risks },
                { key: 'city', label: 'المدينة', options: cities },
                { key: 'sector', label: 'القطاع', options: sectors },
              ].map(filter => (
                <div key={filter.key} style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowFilters({ ...showFilters, [filter.key]: !showFilters[filter.key] })}
                    style={{
                      background: '#EFF6FF', color: '#1E40AF', border: 'none', borderRadius: '4px',
                      padding: '8px 12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s'
                    }}>
                    {filter.label} ▼
                  </button>

                  {showFilters[filter.key] && (
                    <div style={{
                      position: 'absolute', top: '100%', right: 0, background: '#fff', border: '1px solid #E5E7EB',
                      borderRadius: '4px', marginTop: '4px', zIndex: 10, minWidth: '140px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}>
                      {filter.options.map(opt => (
                        <button
                          key={opt}
                          onClick={() => handleApplyFilter(filter.key, opt)}
                          style={{
                            width: '100%', textAlign: 'right', padding: '8px 10px', border: 'none', background: filters[filter.key] === opt ? '#F0FDF4' : '#fff',
                            borderBottom: '1px solid #F3F4F6', cursor: 'pointer', fontSize: '12px', color: '#1F2937'
                          }}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* RESULTS INFO & ADD BUTTON */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#64748B' }}>نتائج {companies.length}</span>
            <button
              onClick={handleAddCompany}
              style={{
                background: '#16A34A', color: '#fff', border: 'none', borderRadius: '6px',
                padding: '10px 16px', fontSize: '12px', fontWeight: '700', cursor: 'pointer'
              }}>
              + إضافة شركة
            </button>
          </div>

          {/* ERROR */}
          {error && (
            <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#DC2626', padding: '12px 14px', borderRadius: '6px', marginBottom: '24px', fontSize: '12px' }}>
              ❌ {error}
            </div>
          )}

          {/* EMPTY STATE */}
          {!loading && query && companies.length === 0 && !error && (
            <div style={{ background: '#F3F4F6', border: '1px dashed #D1D5DB', borderRadius: '8px', padding: '48px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔍</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#1F2937', marginBottom: '8px' }}>لم يتم العثور على نتائج</div>
              <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '20px' }}>جرب اسم شركة أخرى أو رقم سجل مختلف</div>
              <button onClick={handleAddCompany} style={{ background: '#16A34A', color: '#fff', border: 'none', borderRadius: '6px', padding: '10px 20px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>+ طلب إضافة شركة</button>
            </div>
          )}

          {/* RESULTS GRID */}
          {companies.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
              {companies.map((c) => (
                <div key={c.id} style={{
                  background: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px',
                  cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; e.currentTarget.style.transform = 'translateY(0)' }}>

                  <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'flex-start', flexDirection: 'row-reverse' }}>
                    <div style={{
                      width: '60px', height: '60px', borderRadius: '50%',
                      background: c.gaugeBg, flex: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '20px', fontWeight: '700', color: c.color
                    }}>
                      {c.scoreText}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1F2937', margin: '0 0 4px 0', textAlign: 'right' }}>{c.name}</h3>
                      <div style={{ fontSize: '11px', color: '#9CA3AF', textAlign: 'right' }}>{c.sector} • {c.city}</div>
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', fontWeight: '700', color: c.color, marginBottom: '10px', textAlign: 'right' }}>● {c.riskLabel}</div>

                  <button
                    onClick={() => handleViewReport(c.id)}
                    style={{
                      width: '100%', background: '#1E2A52', color: '#fff', border: 'none', borderRadius: '6px',
                      padding: '10px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#0F172A'}
                    onMouseLeave={(e) => e.target.style.background = '#1E2A52'}>
                    عرض التقرير
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
