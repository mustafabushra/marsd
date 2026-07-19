'use client'

import { useState, useEffect } from 'react'
import { Search, Filter, Star, MapPin, Building2, Loader } from 'lucide-react'
import Input from '@/components/Input'
import Card from '@/components/Card'
import Button from '@/components/Button'
import Badge from '@/components/Badge'
import { apiClient } from '@/lib/api'
import { useDebounce } from '@/lib/hooks'

interface SearchResult {
  id: string
  name: string
  category: string
  trustScore: number
  city?: string
  employeeCount?: number
  reports?: number
  rating?: number
}

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [minScore, setMinScore] = useState('0')
  const [industry, setIndustry] = useState('all')
  const [location, setLocation] = useState('all')
  const [sortBy, setSortBy] = useState('relevance')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const debouncedQuery = useDebounce(searchQuery, 500)

  useEffect(() => {
    if (debouncedQuery || industry !== 'all' || location !== 'all' || minScore !== '0') {
      performSearch()
    } else {
      setResults([])
    }
  }, [debouncedQuery, minScore, industry, location, sortBy])

  const performSearch = async () => {
    try {
      setLoading(true)
      setError(null)

      const params: any = {
        page: 1,
        limit: 20,
      }

      if (debouncedQuery) {
        params.search = debouncedQuery
      }
      if (industry !== 'all') {
        params.industry = industry
      }
      if (minScore !== '0') {
        params.minTrustScore = parseInt(minScore)
      }

      const response = await apiClient.getCompanies(params)
      let searchResults = response?.data || []

      // Apply sorting
      if (sortBy === 'score') {
        searchResults.sort((a: any, b: any) => b.trustScore - a.trustScore)
      } else if (sortBy === 'rating') {
        searchResults.sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0))
      } else if (sortBy === 'reports') {
        searchResults.sort((a: any, b: any) => (b.reports || 0) - (a.reports || 0))
      }

      setResults(searchResults)
    } catch (err) {
      setError('فشل في البحث. يرجى المحاولة مرة أخرى.')
      console.error('Search failed:', err)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const getTrustScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getRatingStars = (rating: number = 3) => {
    const rounded = Math.round(rating)
    return '★'.repeat(rounded) + '☆'.repeat(5 - rounded)
  }

  const handleClearFilters = () => {
    setSearchQuery('')
    setMinScore('0')
    setIndustry('all')
    setLocation('all')
    setSortBy('relevance')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-7 py-6">
        <h1 className="text-3xl font-900 text-slate-900">البحث عن الشركات</h1>
        <p className="text-slate-600">ابحث واكتشف معلومات الشركات الموثوقة</p>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto p-7">
        {/* Search Bar */}
        <Card className="mb-6">
          <div className="relative mb-4">
            <Input
              placeholder="ابحث عن شركة باسمها أو قطاعها..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10"
            />
            <Search size={20} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                أدنى درجة ثقة
              </label>
              <select
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="0">الكل</option>
                <option value="25">25+</option>
                <option value="50">50+</option>
                <option value="75">75+</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                القطاع
              </label>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">الكل</option>
                <option value="تكنولوجيا">تكنولوجيا</option>
                <option value="التجارة">التجارة</option>
                <option value="الخدمات">الخدمات</option>
                <option value="الزراعة">الزراعة</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                المدينة
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">الكل</option>
                <option value="الرياض">الرياض</option>
                <option value="جدة">جدة</option>
                <option value="الدمام">الدمام</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                الترتيب
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="relevance">الأكثر ملاءمة</option>
                <option value="score">درجة الثقة</option>
                <option value="rating">التقييم</option>
                <option value="reports">التقارير</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                &nbsp;
              </label>
              <Button
                variant="outline"
                fullWidth
                onClick={handleClearFilters}
              >
                <Filter size={18} />
                مسح الفلاتر
              </Button>
            </div>
          </div>
        </Card>

        {error && (
          <Card className="mb-6 bg-red-50 border border-red-200">
            <p className="text-red-700">{error}</p>
          </Card>
        )}

        {/* Results */}
        {loading ? (
          <Card className="flex justify-center items-center py-12">
            <Loader className="animate-spin text-blue-600 mr-2" />
            <span className="text-slate-600">جاري البحث...</span>
          </Card>
        ) : results.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600 mb-4">
              تم العثور على <strong>{results.length}</strong> نتيجة
            </p>

            {results.map((result) => (
              <Card key={result.id} className="hover:shadow-md transition cursor-pointer">
                <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-start gap-4 mb-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0">
                        {result.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-700 text-slate-900 mb-1">
                          {result.name}
                        </h3>
                        <div className="flex items-center gap-3 flex-wrap">
                          <Badge variant="default">{result.category}</Badge>
                          {result.city && (
                            <div className="flex items-center gap-1 text-sm text-slate-600">
                              <MapPin size={16} />
                              {result.city}
                            </div>
                          )}
                          {result.employeeCount && (
                            <div className="flex items-center gap-1 text-sm text-slate-600">
                              <Building2 size={16} />
                              {result.employeeCount} موظف
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 pt-3 border-t border-slate-200">
                      {result.rating && (
                        <div>
                          <p className="text-xs text-slate-600">التقييم</p>
                          <p className="text-yellow-500 font-medium">
                            {getRatingStars(result.rating)}
                          </p>
                        </div>
                      )}
                      {result.reports !== undefined && (
                        <div>
                          <p className="text-xs text-slate-600">التقارير</p>
                          <p className="text-sm font-medium text-slate-900">
                            {result.reports} تقرير
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Trust Score */}
                  <div className="text-center md:text-right md:ml-4">
                    <p className="text-xs text-slate-600 mb-1">درجة الثقة</p>
                    <p className={`text-4xl font-900 ${getTrustScoreColor(result.trustScore)}`}>
                      {result.trustScore}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">/100</p>
                    <Button size="sm" variant="outline" className="mt-4">
                      عرض التفاصيل
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="text-center py-16">
            <Search size={48} className="text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-600 text-slate-900 mb-2">لم يتم العثور على نتائج</h3>
            <p className="text-slate-600">
              حاول تغيير معايير البحث أو الفلاتر
            </p>
          </Card>
        )}
      </main>
    </div>
  )
}
