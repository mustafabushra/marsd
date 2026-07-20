/**
 * Search Form Component
 * Handles company search with optional filters
 */

import React, { useState } from 'react'
import Button from '../common/Button'
import Input from '../ui/Input'
import { SearchFormProps } from '../../types'

const SECTORS = ['مقاولات', 'تجارة', 'تقنية', 'توريد', 'خدمات', 'صناعة', 'طاقة']
const CITIES = ['الرياض', 'جدة', 'الدمام', 'الخبر', 'مكة', 'المدينة', 'القاهرة']

const SearchForm: React.FC<SearchFormProps> = ({
  onSearch,
  isLoading = false,
  placeholder = 'ابحث عن شركة...',
}) => {
  const [query, setQuery] = useState('')
  const [sector, setSector] = useState('')
  const [city, setCity] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      await onSearch?.(query, { sector: sector || undefined, city: city || undefined })
    }
  }

  const formStyles: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  }

  const searchWrapperStyles: React.CSSProperties = {
    display: 'flex',
    gap: '12px',
    width: '100%',
  }

  const inputWrapperStyles: React.CSSProperties = {
    flex: 1,
  }

  const buttonGroupStyles: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
  }

  const filtersStyles: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    padding: '16px',
    backgroundColor: '#F8FAFC',
    borderRadius: '8px',
  }

  const selectStyles: React.CSSProperties = {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1.5px solid #E2E8F0',
    fontSize: '14px',
    fontFamily: 'Tajawal, sans-serif',
    color: '#1E2A52',
    backgroundColor: '#fff',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  }

  const filterLabelStyles: React.CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: 600,
    color: '#1E2A52',
    marginBottom: '6px',
    fontFamily: 'Tajawal, sans-serif',
  }

  const filterToggleStyles: React.CSSProperties = {
    padding: '10px 16px',
    borderRadius: '8px',
    border: '1.5px solid #E2E8F0',
    backgroundColor: '#fff',
    color: '#1E2A52',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '14px',
    fontFamily: 'Tajawal, sans-serif',
    transition: 'all 0.2s',
  }

  return (
    <form onSubmit={handleSubmit} style={formStyles}>
      {/* Main Search */}
      <div style={searchWrapperStyles}>
        <div style={inputWrapperStyles}>
          <Input
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={e => setQuery(e.target.value)}
            disabled={isLoading}
            fullWidth
          />
        </div>
        <div style={buttonGroupStyles}>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={isLoading || !query.trim()}
            loading={isLoading}
          >
            {isLoading ? 'جاري البحث...' : 'بحث'}
          </Button>
          <button
            type="button"
            style={filterToggleStyles}
            onClick={() => setShowFilters(!showFilters)}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#F8FAFC'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#fff'
            }}
          >
            {showFilters ? 'إخفاء الفلاتر' : 'الفلاتر'}
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div style={filtersStyles}>
          <div>
            <label style={filterLabelStyles}>القطاع</label>
            <select
              value={sector}
              onChange={e => setSector(e.target.value)}
              style={selectStyles}
              disabled={isLoading}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#16A34A'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#E2E8F0'
              }}
            >
              <option value="">جميع القطاعات</option>
              {SECTORS.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={filterLabelStyles}>المدينة</label>
            <select
              value={city}
              onChange={e => setCity(e.target.value)}
              style={selectStyles}
              disabled={isLoading}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#16A34A'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#E2E8F0'
              }}
            >
              <option value="">جميع المدن</option>
              {CITIES.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Button
              type="button"
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => {
                setSector('')
                setCity('')
              }}
              disabled={isLoading}
            >
              إعادة تعيين
            </Button>
          </div>
        </div>
      )}
    </form>
  )
}

export default SearchForm
