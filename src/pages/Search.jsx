import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchCompaniesKnowledgeBase, getAutocompleteCompanies, getSupabase, buildCompanyInsert } from '../lib/api'
import { Search as SearchIcon, X, Filter } from 'lucide-react'

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

  // Filter states
  const [filters, setFilters] = useState({ sector: null, city: null, risk: null, score: null })
  const [showFilters, setShowFilters] = useState({ sector: false, city: false, risk: false, score: false })

  // Mock data for filters
  const sectors = ['تقنية', 'مقاولات', 'صناعات', 'نقل', 'خدمات']
  const cities = ['الرياض', 'جدة', 'الدمام', 'الخبر', 'الدعيان']
  const risks = ['مخاطر منخفضة', 'مخاطر متوسطة', 'مخاطر عالية']
  const scores = ['70+', '40-70', '<40']

  // Utility functions
  function showToastMessage(msg, duration = 3000) {
    setToast(msg)
    setTimeout(() => setToast(''), duration)
  }

  function getRiskInfo(score) {
    if (score >= 70) return { label: 'مخاطر منخفضة', bg: '#ECFDF5', color: '#15803D' }
    if (score >= 40) return { label: 'مخاطر متوسطة', bg: '#FFFBEB', color: '#B45309' }
    return { label: 'مخاطر عالية', bg: '#FEE2E2', color: '#DC2626' }
  }

  function getGaugeGradient(score) {
    const percent = Math.min(Math.max(score, 0), 100)
    return `conic-gradient(#16A34A 0% ${percent}%, #E2E8F0 ${percent}% 100%)`
  }

  // Autocomplete
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
      setAutocomplete([])
    }
  }

  function handleAutocompleteSelect(suggestion) {
    setQuery(suggestion.name)
    setShowAutocomplete(false)
  }

  // BUTTON #1: Clear Search
  function handleClearSearch() {
    setQuery('')
    setCompanies([])
    setAutocomplete([])
    setShowAutocomplete(false)
    setError('')
  }

  // BUTTON #2: Search Knowledge Graph via Knowledge Base
  async function handleSearch() {
    if (!query.trim()) {
      showToastMessage('⚠️ أدخل نص البحث')
      return
    }
    setLoading(true)
    setError('')
    try {
      // Search in Knowledge Base (centralized company registry)
      const result = await searchCompaniesKnowledgeBase(query, filters, 1, 50)
      let formatted = result.data.map(c => ({
        id: c.id,
        name: c.name,
        sector: c.sector || '—',
        city: c.city || '—',
        scoreText: c.trust_score?.toString() || '—',
        score: c.trust_score || 0,
        gaugeBg: c.trust_score ? getGaugeGradient(c.trust_score) : 'conic-gradient(#E2E8F0 0% 100%)',
        riskLabel: c.trust_score ? getRiskInfo(c.trust_score).label : 'بيانات غير كافية',
        bg: c.trust_score ? getRiskInfo(c.trust_score).bg : '#F3F4F6',
        color: c.trust_score ? getRiskInfo(c.trust_score).color : '#6B7280',
        reports: c.total_reports_count || 0,  // Total reports from Knowledge Base
        hasData: c.total_reports_count > 0,
      }))

      // Apply additional filters if needed (beyond what RPC provides)
      if (filters.risk) formatted = formatted.filter(c => c.riskLabel === filters.risk)
      if (filters.score) {
        formatted = formatted.filter(c => {
          if (filters.score === '70+') return c.score >= 70
          if (filters.score === '40-70') return c.score >= 40 && c.score < 70
          return c.score < 40
        })
      }

      // Sort by report count then by score
      formatted.sort((a, b) => {
        if (b.reports !== a.reports) return b.reports - a.reports
        return b.score - a.score
      })

      setCompanies(formatted)
      showToastMessage(`✅ تم العثور على ${formatted.length} شركة`)

      // Audit log
      console.log(`[AUDIT] Knowledge Base Search: query="${query}" filters=${JSON.stringify(filters)} companies=${formatted.length}`)
    } catch (err) {
      setError(err.message || 'فشل البحث')
      showToastMessage('❌ حدث خطأ أثناء البحث')
      console.error('Search error:', err)
    } finally {
      setLoading(false)
    }
  }

  // BUTTON #3-6: Filters
  function handleApplyFilter(filterType, value) {
    const newFilters = { ...filters, [filterType]: filters[filterType] === value ? null : value }
    setFilters(newFilters)
    setShowFilters({ ...showFilters, [filterType]: false })

    // Re-search with new filters
    if (companies.length > 0) {
      handleSearch()
    }
    showToastMessage(`✅ تم تطبيق التصفية`)
    console.log(`[AUDIT] Filter applied: ${filterType}=${value}`)
  }

  // BUTTON #7: Add Company
  async function handleAddCompany() {
    if (!query.trim()) {
      showToastMessage('⚠️ أدخل اسم الشركة أولاً')
      return
    }

    if (window.confirm(`تأكيد إضافة الشركة: "${query}"?`)) {
      try {
        setLoading(true)
        const supabase = getSupabase()

        // Check if company already exists
        const { data: existing } = await supabase
          .from('companies')
          .select('id')
          .or(`name.ilike.%${query}%`)
          .limit(1)

        if (existing && existing.length > 0) {
          showToastMessage('⚠️ الشركة موجودة بالفعل')
          return
        }

        // Add new company
        // كان هنا source: 'manual_addition' وهي قيمة غير مسموحة — تسبب
        // companies_source_check violation. المصدر الصحيح: community.
        const { data: newCompany, error } = await supabase
          .from('companies')
          .insert([buildCompanyInsert({
            name: query,
            approved: false,
          })])
          .select()
          .single()

        if (error) {
          throw new Error('فشل إضافة الشركة: ' + error.message)
        }

        showToastMessage(`✅ تم إضافة الشركة: ${query}`)
        console.log(`[AUDIT] Company added: ${query}`)

        // Refresh search results
        await handleSearch()
      } catch (err) {
        showToastMessage('❌ ' + (err.message || 'فشل إضافة الشركة'))
        console.error('Error adding company:', err)
      } finally {
        setLoading(false)
      }
    }
  }

  // BUTTON #8: View Report
  function handleViewReport(companyId) {
    console.log(`[AUDIT] View company report: ${companyId}`)
    navigate(`/company/${companyId}`)
  }

  // BUTTON #9: Send Report
  function handleSendReport(companyId, companyName) {
    console.log(`[AUDIT] Send report for: ${companyName} (${companyId})`)
    navigate('/add-report', { state: { companyId, companyName } })
    showToastMessage('📋 اذهب لنموذج التقرير')
  }

  // Auto-search on query change
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

  // Close dropdowns on outside click
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
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '22px 28px' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', left: '20px', right: '20px',
          background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px',
          padding: '16px', fontWeight: 700, zIndex: 100, textAlign: 'center'
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px 0', textAlign: 'right' }}>
          🔍 البحث عن الشركات
        </h1>
        <p style={{ fontSize: '13px', color: '#64748B', margin: '0', textAlign: 'right' }}>
          ابحث عن شركة لعرض درجة الثقة وإرسال تقرير
        </p>
      </div>

      {/* Search Box */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '22px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexDirection: 'row-reverse', position: 'relative' }} ref={autocompleteRef}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', background: '#F8FAFC', border: '1.5px solid ' + (showAutocomplete ? '#16A34A' : '#E2E8F0'), borderRadius: '12px', padding: '0 16px', flexDirection: 'row-reverse', position: 'relative' }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => query.length > 0 && setShowAutocomplete(true)}
              placeholder="ابحث باسم الشركة أو رقم السجل..."
              style={{ flex: 1, border: 0, background: 'transparent', padding: '14px 0', fontSize: '15.5px', outline: 'none', textAlign: 'right' }}
            />
            {query ? (
              <button onClick={handleClearSearch} title="مسح البحث" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <X size={18} color="#94A3B8" />
              </button>
            ) : (
              <SearchIcon size={20} color="#94A3B8" />
            )}

            {/* Autocomplete Dropdown */}
            {showAutocomplete && autocomplete.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: '0 0 12px 12px', maxHeight: '300px', overflowY: 'auto', zIndex: 10, marginTop: '-2px' }}>
                {autocomplete.map((item, idx) => (
                  <div key={idx} onClick={() => handleAutocompleteSelect(item)} style={{ padding: '12px 16px', borderBottom: idx < autocomplete.length - 1 ? '1px solid #F1F5F9' : 'none', cursor: 'pointer', textAlign: 'right' }} onMouseEnter={(e) => e.target.style.background = '#F8FAFC'} onMouseLeave={(e) => e.target.style.background = '#fff'}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>{item.name}</div>
                    <div style={{ fontSize: '12px', color: '#94A3B8' }}>{item.cr_number}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* BUTTON #2: Search Button */}
          <button
            onClick={handleSearch}
            disabled={!query || loading}
            title={!query ? 'أدخل نص البحث' : 'بحث'}
            style={{
              background: query && !loading ? '#1E2A52' : '#D1D5DB',
              color: '#fff', border: 0, borderRadius: '12px', padding: '0 30px',
              fontSize: '15px', fontWeight: 800, cursor: query && !loading ? 'pointer' : 'not-allowed'
            }}>
            {loading ? '⏳' : '🔍'} بحث
          </button>
        </div>

        {/* BUTTONS #3-6: Filters */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flexDirection: 'row-reverse' }}>
          {[
            { key: 'sector', label: 'القطاع', options: sectors },
            { key: 'city', label: 'المدينة', options: cities },
            { key: 'risk', label: 'المخاطر', options: risks },
            { key: 'score', label: 'الثقة', options: scores },
          ].map(filter => (
            <div key={filter.key} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowFilters({ ...showFilters, [filter.key]: !showFilters[filter.key] })}
                title={`فلتر حسب ${filter.label}`}
                style={{
                  background: filters[filter.key] ? '#16A34A' : '#EEF2FF',
                  color: filters[filter.key] ? '#fff' : '#1E2A52',
                  border: 'none', borderRadius: '999px', padding: '8px 16px',
                  fontSize: '13.5px', fontWeight: 700, cursor: 'pointer'
                }}>
                {filters[filter.key] ? '✓ ' : ''}{filter.label} ▾
              </button>

              {/* Filter Dropdown */}
              {showFilters[filter.key] && (
                <div style={{ position: 'absolute', top: '100%', right: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', marginTop: '4px', zIndex: 10, minWidth: '200px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                  {filter.options.map(opt => (
                    <button
                      key={opt}
                      onClick={() => handleApplyFilter(filter.key, opt)}
                      style={{
                        width: '100%', textAlign: 'right', padding: '10px 14px',
                        border: 'none', background: filters[filter.key] === opt ? '#F0FDF4' : '#fff',
                        borderBottom: '1px solid #F1F5F9', cursor: 'pointer', fontSize: '13px'
                      }}>
                      {filters[filter.key] === opt ? '✓ ' : ''}{opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Results header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '14.5px', color: '#64748B', fontWeight: 700 }}>
          {loading ? '⏳ جاري البحث...' : `${companies.length} نتائج`}
        </div>

        {/* BUTTON #7: Add Company */}
        <button
          onClick={handleAddCompany}
          title="أضف شركة جديدة"
          style={{
            background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px',
            padding: '9px 16px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer'
          }}>
          + إضافة شركة
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', fontSize: '14px', color: '#DC2626', fontWeight: 600 }}>
          ❌ {error}
        </div>
      )}

      {/* No results message - IMPROVED UI */}
      {!loading && query && companies.length === 0 && !error && (
        <div style={{ background: 'linear-gradient(135deg, #FEF3C7 0%, #FEE2E2 100%)', border: '1px solid #FECACA', borderRadius: '16px', padding: '32px 24px', marginBottom: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>😕</div>
          <div style={{ fontSize: '16px', color: '#92400E', fontWeight: 800, marginBottom: '8px' }}>
            لم نجد "{query}"
          </div>
          <div style={{ fontSize: '13px', color: '#A16207', marginBottom: '20px' }}>
            قد تكون الشركة مسجلة باسم مختلف أو لم تسجل بعد
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '20px' }}>
            {/* Action 1: Add New Company */}
            <button
              onClick={handleAddCompany}
              title="أضف الشركة للمنصة"
              style={{
                background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px',
                padding: '12px 16px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.background = '#15803D'}
              onMouseLeave={(e) => e.target.style.background = '#16A34A'}
            >
              ➕ تسجيل شركة جديدة
            </button>

            {/* Action 2: Search Tips */}
            <button
              onClick={() => setQuery('')}
              title="امسح البحث وحاول مرة أخرى"
              style={{
                background: '#3B82F6', color: '#fff', border: 0, borderRadius: '10px',
                padding: '12px 16px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.background = '#2563EB'}
              onMouseLeave={(e) => e.target.style.background = '#3B82F6'}
            >
              🔄 بحث جديد
            </button>
          </div>

          {/* Helpful tips */}
          <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(255,255,255,0.6)', borderRadius: '8px', fontSize: '12px', color: '#92400E', lineHeight: '1.6' }}>
            <strong>💡 نصائح البحث:</strong><br/>
            • ابحث برقم السجل التجاري (مثل: 1010012345)<br/>
            • جرّب اسم مختلف أو أقصر (مثل: "الراجحي" بدل "شركة الراجحي للمقاولات")<br/>
            • إذا كنت متأكد الشركة غير موجودة، أضفها للمنصة
          </div>
        </div>
      )}

      {/* Results grid */}
      {companies.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {companies.map(c => (
            <div key={c.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: c.gaugeBg, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '45px', height: '45px', borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 900, color: '#1E2A52' }}>
                    {c.scoreText}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px' }}>{c.name}</h3>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ background: '#F1F5F9', color: '#475569', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>{c.sector}</span>
                    <span style={{ background: '#F1F5F9', color: '#475569', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>{c.city}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', fontSize: '12px', color: '#64748B' }}>
                <span style={{ background: c.bg, color: c.color, borderRadius: '999px', padding: '4px 12px', fontWeight: 700 }}>● {c.riskLabel}</span>
                <span>{c.reports} تقرير</span>
              </div>

              {c.hasData ? (
                <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                  {/* BUTTON #8: View Report */}
                  <button
                    onClick={() => handleViewReport(c.id)}
                    title="عرض التقرير"
                    style={{ width: '100%', background: '#1E2A52', color: '#fff', border: 0, borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                    📊 عرض التقرير
                  </button>

                  {/* BUTTON #9: Send Report */}
                  <button
                    onClick={() => handleSendReport(c.id, c.name)}
                    title="إرسال تقرير جديد"
                    style={{ width: '100%', background: '#3B82F6', color: '#fff', border: 0, borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                    ✏️ إرسال تقرير
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleAddCompany()}
                  title="أضف بيانات عن هذه الشركة"
                  style={{ width: '100%', background: '#F59E0B', color: '#fff', border: 0, borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                  ⚠️ بيانات ناقصة
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
