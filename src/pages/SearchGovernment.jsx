import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchCompaniesKnowledgeBase, getAutocompleteCompanies, getSupabase, buildCompanyInsert } from '../lib/api'
import { Search as SearchIcon, X, Filter } from 'lucide-react'

/**
 * GOVERNMENT SAUDI STYLE - Search Page
 * تصميم حكومي سعودي احترافي
 * ألوان: أخضر حكومي (#1a6b3a) + أبيض + رمادي احترافي
 */
export default function SearchGovernment() {
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
    if (score >= 70) return { label: 'مخاطر منخفضة', bg: '#E8F5E9', color: '#1B5E20' }
    if (score >= 40) return { label: 'مخاطر متوسطة', bg: '#FFF8E1', color: '#F57F17' }
    return { label: 'مخاطر عالية', bg: '#FFEBEE', color: '#C62828' }
  }

  function getGaugeGradient(score) {
    const percent = Math.min(Math.max(score, 0), 100)
    return `conic-gradient(#1a6b3a 0% ${percent}%, #E0E0E0 ${percent}% 100%)`
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
        crNumber: c.cr_number || '—',
        scoreText: c.trust_score?.toString() || '—',
        score: c.trust_score || 0,
        gaugeBg: c.trust_score ? getGaugeGradient(c.trust_score) : 'conic-gradient(#E0E0E0 0% 100%)',
        riskLabel: c.trust_score ? getRiskInfo(c.trust_score).label : 'بيانات غير كافية',
        bg: c.trust_score ? getRiskInfo(c.trust_score).bg : '#F5F5F5',
        color: c.trust_score ? getRiskInfo(c.trust_score).color : '#757575',
        reports: c.total_reports_count || 0,
        hasData: c.total_reports_count > 0,
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
    if (companies.length > 0) {
      handleSearch()
    }
    showToastMessage(`✅ تم تطبيق التصفية`)
  }

  return (
    <main style={{ background: '#F5F5F5', minHeight: '100vh' }}>
      {/* GOVERNMENT HEADER */}
      <header style={{
        background: '#1a6b3a',
        color: '#fff',
        padding: '0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        {/* Top Bar */}
        <div style={{ background: '#0D4620', padding: '10px 20px', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>وزارة التجارة والاستثمار | منصة مرصد</span>
          <span>1446 هـ</span>
        </div>

        {/* Main Header */}
        <div style={{ padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '50px', height: '50px', background: '#fff', borderRadius: '4px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '24px', fontWeight: 'bold', color: '#1a6b3a'
            }}>
              🔍
            </div>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>منصة مرصد</h1>
              <p style={{ fontSize: '12px', opacity: 0.9, margin: '4px 0 0 0' }}>منصة البحث عن مؤشرات الثقة للشركات</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/admin')}
            style={{
              background: 'rgba(255,255,255,0.2)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600'
            }}>
            📊 لوحة التحكم
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div style={{ padding: '40px 20px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          {/* SEARCH BOX - Professional */}
          <div style={{
            background: '#fff',
            borderRadius: '4px',
            padding: '24px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '12px', textAlign: 'right' }}>
              البحث عن الشركة
            </label>

            {/* Search Input */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                border: '2px solid #E0E0E0',
                borderRadius: '4px',
                padding: '12px 14px',
                background: '#fff',
                transition: 'all 0.2s'
              }}>
                <SearchIcon size={20} color="#1a6b3a" />
                <input
                  type="text"
                  placeholder="ابحث باسم الشركة أو رقم السجل التجاري..."
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    handleAutocomplete(e.target.value)
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    fontSize: '14px',
                    padding: '0',
                    textAlign: 'right',
                    fontFamily: 'inherit'
                  }}
                />
                {query && (
                  <button
                    onClick={handleClearSearch}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex'
                    }}>
                    <X size={18} color="#999" />
                  </button>
                )}
              </div>

              {/* Autocomplete */}
              {showAutocomplete && autocomplete.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: '#fff',
                  border: '1px solid #E0E0E0',
                  borderTop: 'none',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  zIndex: 10,
                  marginTop: '-2px'
                }}>
                  {autocomplete.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAutocompleteSelect(item)}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        background: idx % 2 === 0 ? '#fff' : '#FAFAFA',
                        border: 'none',
                        textAlign: 'right',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: '#333'
                      }}>
                      {item.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filters Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              {[
                { type: 'sector', label: 'القطاع', items: sectors },
                { type: 'city', label: 'المدينة', items: cities },
                { type: 'risk', label: 'المخاطر', items: risks },
                { type: 'score', label: 'درجة الثقة', items: scores }
              ].map(f => (
                <div key={f.type}>
                  <button
                    onClick={() => setShowFilters({ ...showFilters, [f.type]: !showFilters[f.type] })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: filters[f.type] ? '#E8F5E9' : '#F5F5F5',
                      border: filters[f.type] ? '2px solid #1a6b3a' : '1px solid #E0E0E0',
                      borderRadius: '4px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      color: filters[f.type] ? '#1a6b3a' : '#333',
                      textAlign: 'right'
                    }}>
                    {filters[f.type] ? `${f.label}: ${filters[f.type]}` : f.label}
                  </button>

                  {showFilters[f.type] && (
                    <div style={{
                      position: 'absolute',
                      background: '#fff',
                      border: '1px solid #E0E0E0',
                      borderRadius: '4px',
                      marginTop: '4px',
                      width: '150px',
                      zIndex: 5,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}>
                      {f.items.map(item => (
                        <button
                          key={item}
                          onClick={() => handleApplyFilter(f.type, item)}
                          style={{
                            width: '100%',
                            padding: '10px',
                            background: 'none',
                            border: 'none',
                            textAlign: 'right',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: '#333',
                            borderBottom: '1px solid #F0F0F0'
                          }}>
                          {item}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Search Button */}
            <button
              onClick={handleSearch}
              disabled={loading}
              style={{
                width: '100%',
                marginTop: '16px',
                padding: '12px',
                background: '#1a6b3a',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: '700',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1
              }}>
              {loading ? '⏳ جاري البحث...' : '🔍 بحث'}
            </button>
          </div>

          {/* ERROR */}
          {error && (
            <div style={{
              background: '#FFEBEE',
              border: '1px solid #EF5350',
              color: '#C62828',
              padding: '12px 14px',
              borderRadius: '4px',
              marginBottom: '24px',
              fontSize: '13px',
              textAlign: 'right'
            }}>
              ❌ {error}
            </div>
          )}

          {/* TOAST */}
          {toast && (
            <div style={{
              position: 'fixed',
              bottom: '20px',
              left: '20px',
              background: '#1a6b3a',
              color: '#fff',
              padding: '12px 16px',
              borderRadius: '4px',
              fontSize: '13px',
              zIndex: 100,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
            }}>
              {toast}
            </div>
          )}

          {/* RESULTS */}
          {companies.length === 0 && !loading && !error && (
            <div style={{
              background: '#fff',
              borderRadius: '4px',
              padding: '40px',
              textAlign: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <p style={{ fontSize: '16px', fontWeight: '600', color: '#333', margin: '0 0 8px 0' }}>
                🔎 ابدأ البحث عن الشركات
              </p>
              <p style={{ fontSize: '13px', color: '#999', margin: 0 }}>
                أدخل اسم الشركة أو رقم السجل التجاري للبحث عن مؤشرات الثقة والتقارير
              </p>
            </div>
          )}

          {companies.length > 0 && (
            <>
              <div style={{
                background: '#E8F5E9',
                border: '1px solid #A5D6A7',
                color: '#1B5E20',
                padding: '12px 14px',
                borderRadius: '4px',
                marginBottom: '20px',
                fontSize: '13px',
                textAlign: 'right',
                fontWeight: '600'
              }}>
                ✅ تم العثور على {companies.length} شركة
              </div>

              {/* COMPANY CARDS - Professional Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '16px'
              }}>
                {companies.map((company) => (
                  <div
                    key={company.id}
                    onClick={() => navigate(`/trust-report/${company.id}`)}
                    style={{
                      background: '#fff',
                      border: '1px solid #E0E0E0',
                      borderRadius: '4px',
                      padding: '16px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
                      e.currentTarget.style.transform = 'translateY(-2px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'
                      e.currentTarget.style.transform = 'translateY(0)'
                    }}>

                    {/* Company Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div style={{
                        width: '48px', height: '48px', borderRadius: '4px',
                        background: company.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '20px', fontWeight: 'bold', color: company.color, flexShrink: 0
                      }}>
                        {company.scoreText}
                      </div>
                      <div style={{ textAlign: 'right', flex: 1 }}>
                        <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 4px 0', marginRight: '8px' }}>
                          {company.name}
                        </h3>
                        <span style={{
                          display: 'inline-block',
                          background: company.bg,
                          color: company.color,
                          padding: '4px 8px',
                          borderRadius: '3px',
                          fontSize: '12px',
                          fontWeight: '600',
                          marginRight: '8px'
                        }}>
                          {company.riskLabel}
                        </span>
                      </div>
                    </div>

                    {/* Company Details */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '12px',
                      fontSize: '12px',
                      marginBottom: '12px',
                      padding: '12px 0',
                      borderTop: '1px solid #F0F0F0',
                      borderBottom: '1px solid #F0F0F0'
                    }}>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ color: '#999', fontSize: '11px' }}>القطاع</span>
                        <p style={{ margin: '2px 0 0 0', color: '#333', fontWeight: '600' }}>{company.sector}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ color: '#999', fontSize: '11px' }}>المدينة</span>
                        <p style={{ margin: '2px 0 0 0', color: '#333', fontWeight: '600' }}>{company.city}</p>
                      </div>
                      <div style={{ textAlign: 'right', gridColumn: '1 / -1' }}>
                        <span style={{ color: '#999', fontSize: '11px' }}>السجل التجاري</span>
                        <p style={{ margin: '2px 0 0 0', color: '#333', fontWeight: '600', direction: 'ltr' }}>{company.crNumber}</p>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => navigate(`/add-report?company=${company.id}`)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        background: '#E8F5E9',
                        color: '#1a6b3a',
                        border: '1px solid #A5D6A7',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}>
                      📋 إضافة تقرير
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* GOVERNMENT FOOTER */}
      <footer style={{
        background: '#1a6b3a',
        color: '#fff',
        padding: '24px',
        marginTop: '40px',
        textAlign: 'center',
        fontSize: '12px'
      }}>
        <p style={{ margin: 0 }}>© 2026 وزارة التجارة والاستثمار | منصة مرصد لمؤشرات الثقة</p>
      </footer>
    </main>
  )
}
