'use client'

import { useState, useEffect } from 'react'
import { Plus, Search, Filter, Eye, Edit, Trash2, Download, Loader } from 'lucide-react'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Card from '@/components/Card'
import Badge from '@/components/Badge'
import Modal from '@/components/Modal'
import { apiClient } from '@/lib/api'

interface Company {
  id: string
  name: string
  trustScore: number
  status: 'active' | 'pending' | 'inactive'
  category: string
  reports: number
  lastUpdated: string
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchCompanies()
  }, [page])

  useEffect(() => {
    applyFilters()
  }, [searchTerm, selectedStatus, companies])

  const fetchCompanies = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await apiClient.getCompanies({
        page,
        limit: 20,
      })
      const data = (response as any)?.data || []
      setCompanies(Array.isArray(data) ? data : [])
    } catch (err) {
      setError('فشل في تحميل الشركات. يرجى المحاولة مرة أخرى.')
      console.error('Failed to fetch companies:', err)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = companies

    if (searchTerm.trim()) {
      filtered = filtered.filter(
        (company) =>
          company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          company.category.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter((company) => company.status === selectedStatus)
    }

    setFilteredCompanies(filtered)
  }

  const handleDelete = async (id: string) => {
    try {
      setDeleting(true)
      await apiClient.deleteCompany(id)
      setCompanies(companies.filter((c) => c.id !== id))
      setDeleteConfirmId(null)
    } catch (err) {
      setError('فشل في حذف الشركة')
      console.error('Failed to delete company:', err)
    } finally {
      setDeleting(false)
    }
  }

  const statusLabels: Record<string, string> = {
    active: 'نشط',
    pending: 'قيد الانتظار',
    inactive: 'غير نشط',
  }

  const getTrustColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-7 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-900 text-slate-900">الشركات</h1>
              <p className="text-slate-600">إدارة وتقييم الشركات المسجلة</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline">
                <Download size={20} />
                تصدير
              </Button>
              <Button href="/companies/new">
                <Plus size={20} />
                إضافة شركة
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 overflow-auto p-7">
          {error && (
            <Card className="mb-6 bg-red-50 border border-red-200">
              <div className="flex items-center justify-between">
                <p className="text-red-700">{error}</p>
                <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
                  ✕
                </button>
              </div>
            </Card>
          )}

          {/* Search and Filters */}
          <Card className="mb-6">
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Input
                    placeholder="ابحث عن شركة..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pr-10"
                  />
                  <Search size={20} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">جميع الحالات</option>
                  <option value="active">نشط</option>
                  <option value="pending">قيد الانتظار</option>
                  <option value="inactive">غير نشط</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Companies Table */}
          <Card>
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <Loader className="animate-spin text-blue-600" />
              </div>
            ) : filteredCompanies.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr className="text-right">
                      <th className="px-4 py-3 font-600 text-slate-700">اسم الشركة</th>
                      <th className="px-4 py-3 font-600 text-slate-700">القطاع</th>
                      <th className="px-4 py-3 font-600 text-slate-700">درجة الثقة</th>
                      <th className="px-4 py-3 font-600 text-slate-700">التقارير</th>
                      <th className="px-4 py-3 font-600 text-slate-700">الحالة</th>
                      <th className="px-4 py-3 font-600 text-slate-700">آخر تحديث</th>
                      <th className="px-4 py-3 font-600 text-slate-700">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCompanies.map((company) => (
                      <tr key={company.id} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{company.name}</td>
                        <td className="px-4 py-3 text-slate-600">{company.category}</td>
                        <td className={`px-4 py-3 font-bold ${getTrustColor(company.trustScore)}`}>
                          {company.trustScore}%
                        </td>
                        <td className="px-4 py-3 text-slate-600">{company.reports}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              company.status === 'active'
                                ? 'success'
                                : company.status === 'pending'
                                  ? 'warning'
                                  : 'error'
                            }
                          >
                            {statusLabels[company.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {new Date(company.lastUpdated).toLocaleDateString('ar-SA')}
                        </td>
                        <td className="px-4 py-3 flex gap-2">
                          <button className="p-1.5 hover:bg-slate-100 rounded transition">
                            <Eye size={16} className="text-slate-600" />
                          </button>
                          <button className="p-1.5 hover:bg-slate-100 rounded transition">
                            <Edit size={16} className="text-slate-600" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(company.id)}
                            className="p-1.5 hover:bg-red-50 rounded transition"
                          >
                            <Trash2 size={16} className="text-red-600" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500">
                {companies.length === 0 ? 'لا توجد شركات مسجلة بعد' : 'لا توجد شركات تطابق البحث'}
              </div>
            )}
          </Card>
        </main>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title="تأكيد الحذف"
        actions={
          <>
            <Button variant="ghost" onClick={() => setDeleteConfirmId(null)} disabled={deleting}>
              إلغاء
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              disabled={deleting}
            >
              {deleting ? 'جاري الحذف...' : 'حذف'}
            </Button>
          </>
        }
      >
        <p className="text-slate-600">هل أنت متأكد من رغبتك في حذف هذه الشركة؟ لا يمكن التراجع عن هذا الإجراء.</p>
      </Modal>
    </div>
  )
}
