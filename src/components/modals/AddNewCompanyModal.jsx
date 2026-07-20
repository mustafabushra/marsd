import React, { useState } from 'react'
import BaseModal from './BaseModal'
import { Building2 } from 'lucide-react'

export function AddNewCompanyModal({ isOpen, onClose, onAdd }) {
  const [formData, setFormData] = useState({
    name: '',
    crNumber: '',
    sector: '',
    city: '',
  })
  const [loading, setLoading] = useState(false)

  const sectors = [
    'تجارة',
    'صناعة',
    'خدمات',
    'تكنولوجيا',
    'تمويل',
    'عقارات',
    'نقل',
    'سياحة',
    'صحة',
    'تعليم',
  ]

  const cities = ['الرياض', 'جدة', 'الدمام', 'الخبر', 'القصيم', 'مكة', 'المدينة', 'أخرى']

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.crNumber.trim()) return
    setLoading(true)
    await onAdd(formData)
    setLoading(false)
    setFormData({ name: '', crNumber: '', sector: '', city: '' })
  }

  const isValid = formData.name.trim() && formData.crNumber.trim()

  const actions = [
    {
      label: 'إلغاء',
      onClick: onClose,
      variant: 'secondary',
    },
    {
      label: 'إضافة الشركة',
      onClick: handleSubmit,
      variant: 'primary',
      disabled: !isValid || loading,
    },
  ]

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="إضافة شركة جديدة"
      size="lg"
      actions={actions}
    >
      <div className="space-y-4">
        <div className="flex gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <Building2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-900">
            أضف شركة جديدة إلى النظام لتتمكن المستخدمون من البحث والإبلاغ عنها
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            اسم الشركة *
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="مثال: شركة التقنية المتقدمة"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            السجل التجاري *
          </label>
          <input
            type="text"
            name="crNumber"
            value={formData.crNumber}
            onChange={handleChange}
            placeholder="1010000000"
            maxLength="10"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <p className="text-xs text-slate-500 mt-1">رقم السجل التجاري من 10 أرقام</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              القطاع
            </label>
            <select
              name="sector"
              value={formData.sector}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">اختر القطاع</option>
              {sectors.map((sector) => (
                <option key={sector} value={sector}>
                  {sector}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              المدينة
            </label>
            <select
              name="city"
              value={formData.city}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">اختر المدينة</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </BaseModal>
  )
}

export default AddNewCompanyModal
