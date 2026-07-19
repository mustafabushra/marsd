'use client'

import { useState, useEffect } from 'react'
import { Plus, Loader, Eye, Trash2, AlertCircle } from 'lucide-react'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Card from '@/components/Card'
import Badge from '@/components/Badge'
import { apiClient } from '@/lib/api'

interface Report {
  id: string
  companyName: string
  rating: number
  description: string
  author: string
  createdAt: string
  status: 'pending' | 'approved' | 'rejected'
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [filteredReports, setFilteredReports] = useState<Report[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    fetchReports()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [searchTerm, statusFilter, reports])

  const fetchReports = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.getReports({ limit: 50 })
      const data = (response as any)?.data || []
      setReports(Array.isArray(data) ? data : [])
    } catch (err) {
      setError('فشل في تحميل التقارير')
      console.error('Failed to fetch reports:', err)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = reports

    if (searchTerm.trim()) {
      filtered = filtered.filter(
        (report) =>
          report.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          report.description.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((report) => report.status === statusFilter)
    }

    setFilteredReports(filtered)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا التقرير؟')) return

    try {
      setDeleting(id)
      await apiClient.updateReport(id, { status: 'deleted' })
      setReports(reports.filter((r) => r.id !== id))
    } catch (err) {
      setError('فشل في حذف التقرير')
      console.error('Failed to delete report:', err)
    } finally {
      setDeleting(null)
    }
  }

  const statusBadges: Record<string, any> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'error',
  }

  const statusLabels: Record<string, string> = {
    pending: 'قيد المراجعة',
    approved: 'موافق عليه',
    rejected: 'مرفوض',
  }

  const getRatingStars = (rating: number) => {
    const rounded = Math.round(rating)
    return '★'.repeat(rounded) + '☆'.repeat(5 - rounded)
  }

  const getReportType = (rating: number) => {
    if (rating >= 4) return { label: '✓ إيجابي', variant: 'success' }
    if (rating <= 2) return { label: '✗ سلبي', variant: 'error' }
    return { label: '○ محايد', variant: 'warning' }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-7 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-900 text-slate-900">التقارير</h1>
            <p className="text-slate-600">عرض وإدارة تقارير الشركات</p>
          </div>
          <Button href="/reports/new">
            <Plus size={20} />
            إضافة تقرير
          </Button>
        </div>
      </div>

      {/* Content */}
      <main className="p-7">
        {error && (
          <Card className="mb-6 bg-red-50 border border-red-200">
            <div className="flex items-center gap-3">
              <AlertCircle className="text-red-600" />
              <p className="text-red-700">{error}</p>
            </div>
          </Card>
        )}

        {/* Filters */}
        <Card className="mb-6">
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Input
                  placeholder="ابحث عن تقرير..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">جميع الحالات</option>
                <option value="pending">قيد المراجعة</option>
                <option value="approved">موافق عليه</option>
                <option value="rejected">مرفوض</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Reports List */}
        {loading ? (
          <Card className="flex justify-center items-center py-12">
            <Loader className="animate-spin text-blue-600 mr-2" />
            <span className="text-slate-600">جاري تحميل التقارير...</span>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredReports.length > 0 ? (
              filteredReports.map((report) => {
                const reportType = getReportType(report.rating)
                return (
                  <Card key={report.id} className="hover:shadow-md transition">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <h3 className="text-lg font-700 text-slate-900">{report.companyName}</h3>
                          <Badge variant={reportType.variant as any}>
                            {reportType.label}
                          </Badge>
                          <Badge variant={statusBadges[report.status]}>
                            {statusLabels[report.status]}
                          </Badge>
                        </div>

                        <p className="text-slate-600 mb-3">{report.description}</p>

                        <div className="flex items-center gap-6 text-sm text-slate-500">
                          <span className="text-yellow-500 font-medium">{getRatingStars(report.rating)}</span>
                          <span>بواسطة: {report.author || 'مجهول'}</span>
                          <span>{new Date(report.createdAt).toLocaleDateString('ar-SA')}</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button className="p-2 hover:bg-slate-100 rounded-lg transition">
                          <Eye size={18} className="text-slate-600" />
                        </button>
                        <button
                          onClick={() => handleDelete(report.id)}
                          disabled={deleting === report.id}
                          className="p-2 hover:bg-red-50 rounded-lg transition"
                        >
                          <Trash2 size={18} className="text-red-600" />
                        </button>
                      </div>
                    </div>
                  </Card>
                )
              })
            ) : (
              <Card className="text-center py-12">
                <p className="text-slate-500">
                  {reports.length === 0 ? 'لا توجد تقارير بعد' : 'لا توجد تقارير تطابق البحث'}
                </p>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
