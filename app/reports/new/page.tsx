'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Card from '@/components/Card'
import Alert from '@/components/Alert'
import { ArrowRight, Star, AlertCircle, Loader } from 'lucide-react'
import { apiClient } from '@/lib/api'

interface ReportFormData {
  companyId: string
  rating: number
  title: string
  description: string
  dealAmount?: string
  dealDate?: string
  contactName?: string
  contactEmail?: string
}

interface Company {
  id: string
  name: string
}

export default function AddReportPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [companiesLoading, setCompaniesLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [selectedRating, setSelectedRating] = useState(3)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReportFormData>({
    defaultValues: {
      rating: 3,
      companyId: '',
      title: '',
      description: '',
    },
  })

  useEffect(() => {
    fetchCompanies()
  }, [])

  const fetchCompanies = async () => {
    try {
      setCompaniesLoading(true)
      const response = await apiClient.getCompanies({ limit: 100 })
      setCompanies(response?.data || [])
    } catch (err) {
      console.error('Failed to fetch companies:', err)
      setError('فشل في تحميل قائمة الشركات')
    } finally {
      setCompaniesLoading(false)
    }
  }

  const onSubmit = async (data: ReportFormData) => {
    try {
      setSubmitting(true)
      setError(null)

      await apiClient.createReport({
        companyId: data.companyId,
        rating: data.rating,
        title: data.title,
        description: data.description,
        dealAmount: data.dealAmount ? parseFloat(data.dealAmount) : undefined,
        dealDate: data.dealDate,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
      })

      setSuccess(true)
      setTimeout(() => {
        router.push('/reports')
      }, 2000)
    } catch (err) {
      setError('فشل في إضافة التقرير. يرجى المحاولة مرة أخرى.')
      console.error('Failed to submit report:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-7">
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowRight size={20} />
          رجوع
        </button>
        <h1 className="text-3xl font-900 text-slate-900">إضافة تقرير جديد</h1>
        <p className="text-slate-600">شارك تجربتك عن الشركة لمساعدة الآخرين</p>
      </div>

      {error && (
        <Alert variant="error" className="mb-6">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} />
            {error}
          </div>
        </Alert>
      )}

      {success && (
        <Alert variant="success" className="mb-6">
          تم إضافة التقرير بنجاح! سيتم مراجعته قريباً.
        </Alert>
      )}

      <Card className="max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label className="block text-sm font-600 text-slate-900 mb-2">
              اختر الشركة <span className="text-red-600">*</span>
            </label>
            {companiesLoading ? (
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <Loader size={18} className="animate-spin text-blue-600" />
                <span className="text-slate-600">جاري تحميل الشركات...</span>
              </div>
            ) : (
              <select
                {...register('companyId', { required: 'اختيار الشركة مطلوب' })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- اختر شركة --</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            )}
            {errors.companyId && (
              <p className="text-red-600 text-sm mt-1">{errors.companyId.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-600 text-slate-900 mb-2">
              التقييم <span className="text-red-600">*</span>
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setSelectedRating(star)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    size={32}
                    className={selectedRating >= star ? 'fill-yellow-400 text-yellow-400' : 'text-slate-300'}
                  />
                </button>
              ))}
            </div>
            <input type="hidden" {...register('rating')} value={selectedRating} />
          </div>

          <div>
            <label className="block text-sm font-600 text-slate-900 mb-2">
              عنوان التقرير <span className="text-red-600">*</span>
            </label>
            <Input
              placeholder="مثال: تجربة رائعة مع الخدمات"
              {...register('title', { required: 'العنوان مطلوب' })}
              error={errors.title?.message}
            />
          </div>

          <div>
            <label className="block text-sm font-600 text-slate-900 mb-2">
              التفاصيل <span className="text-red-600">*</span>
            </label>
            <textarea
              placeholder="وصف تجربتك بالتفصيل مع الشركة..."
              rows={6}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              {...register('description', { required: 'التفاصيل مطلوبة', minLength: { value: 20, message: 'يجب أن يكون التفصيل 20 حرف على الأقل' } })}
            />
            {errors.description && (
              <p className="text-red-600 text-sm mt-1">{errors.description.message}</p>
            )}
          </div>

          <div className="border-t border-slate-200 pt-6">
            <p className="text-sm font-600 text-slate-900 mb-4">معلومات العقد (اختياري)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-500 text-slate-700 mb-1">قيمة الصفقة</label>
                <Input
                  type="number"
                  placeholder="أدخل المبلغ"
                  {...register('dealAmount')}
                />
              </div>
              <div>
                <label className="block text-sm font-500 text-slate-700 mb-1">تاريخ الصفقة</label>
                <Input
                  type="date"
                  {...register('dealDate')}
                />
              </div>
              <div>
                <label className="block text-sm font-500 text-slate-700 mb-1">اسم جهة التواصل</label>
                <Input
                  placeholder="اسم الشخص المسؤول"
                  {...register('contactName')}
                />
              </div>
              <div>
                <label className="block text-sm font-500 text-slate-700 mb-1">البريد الإلكتروني</label>
                <Input
                  type="email"
                  placeholder="البريد الإلكتروني"
                  {...register('contactEmail')}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-6 border-t border-slate-200">
            <Button
              type="button"
              variant="ghost"
              fullWidth
              onClick={() => router.back()}
              disabled={submitting}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              fullWidth
              disabled={submitting || companiesLoading}
            >
              {submitting ? 'جاري الإرسال...' : 'إضافة التقرير'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
