'use client'
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/Button'
import Input from '@/components/Input'
import Select from '@/components/Select'
import Textarea from '@/components/Textarea'
import Card from '@/components/Card'
import Alert from '@/components/Alert'
import { ArrowRight } from 'lucide-react'

const INDUSTRIES = [
  { value: 'technology', label: 'تكنولوجيا' },
  { value: 'retail', label: 'التجارة' },
  { value: 'services', label: 'الخدمات' },
  { value: 'manufacturing', label: 'التصنيع' },
  { value: 'healthcare', label: 'الصحة' },
  { value: 'education', label: 'التعليم' },
  { value: 'finance', label: 'المالية' },
  { value: 'real_estate', label: 'العقارات' },
]

export default function AddCompanyPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    name: '',
    industry: '',
    description: '',
    website: '',
    email: '',
    phone: '',
    address: '',
    employees: '',
    yearFounded: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setSuccess(true)
      setTimeout(() => {
        router.push('/companies')
      }, 1500)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-7">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4"
        >
          <ArrowRight size={20} />
          رجوع
        </button>
        <h1 className="text-3xl font-900 text-slate-900">إضافة شركة جديدة</h1>
        <p className="text-slate-600">أدخل معلومات الشركة الأساسية</p>
      </div>

      {success && (
        <Alert variant="success" className="mb-6">
          تم إضافة الشركة بنجاح!
        </Alert>
      )}

      <Card className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Row 1: Name and Industry */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="اسم الشركة"
              name="name"
              type="text"
              placeholder="أدخل اسم الشركة"
              value={formData.name}
              onChange={handleChange}
              required
            />

            <Select
              label="القطاع"
              name="industry"
              value={formData.industry}
              onChange={handleChange}
              options={INDUSTRIES}
              required
            />
          </div>

          {/* Description */}
          <Textarea
            label="الوصف"
            name="description"
            placeholder="وصف موجز عن الشركة"
            rows={4}
            value={formData.description}
            onChange={handleChange}
          />

          {/* Row 2: Website and Email */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="موقع الويب"
              name="website"
              type="url"
              placeholder="https://example.com"
              value={formData.website}
              onChange={handleChange}
            />

            <Input
              label="البريد الإلكتروني"
              name="email"
              type="email"
              placeholder="info@example.com"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          {/* Row 3: Phone and Address */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="رقم الهاتف"
              name="phone"
              type="tel"
              placeholder="+966501234567"
              value={formData.phone}
              onChange={handleChange}
              required
            />

            <Input
              label="العنوان"
              name="address"
              type="text"
              placeholder="شارع، المدينة، الدولة"
              value={formData.address}
              onChange={handleChange}
            />
          </div>

          {/* Row 4: Employees and Year Founded */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="عدد الموظفين"
              name="employees"
              type="number"
              placeholder="100"
              value={formData.employees}
              onChange={handleChange}
            />

            <Input
              label="سنة التأسيس"
              name="yearFounded"
              type="number"
              placeholder="2020"
              value={formData.yearFounded}
              onChange={handleChange}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-6 border-t border-slate-200">
            <Button
              type="button"
              variant="ghost"
              fullWidth
              onClick={() => router.back()}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              fullWidth
              isLoading={isLoading}
            >
              إضافة الشركة
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
