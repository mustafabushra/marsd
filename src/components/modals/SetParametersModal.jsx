import React, { useState } from 'react'
import BaseModal from './BaseModal'
import { Sliders } from 'lucide-react'

export function SetParametersModal({
  isOpen,
  onClose,
  onSave,
  defaultMinReports = 5,
  defaultOfficialWeight = 30,
  defaultCommunityWeight = 70,
}) {
  const [params, setParams] = useState({
    minReports: defaultMinReports,
    officialWeight: defaultOfficialWeight,
    communityWeight: defaultCommunityWeight,
  })
  const [loading, setLoading] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    const numValue = parseInt(value, 10)
    setParams((prev) => {
      const updated = { ...prev, [name]: numValue }

      // Auto-balance weights
      if (name === 'officialWeight') {
        updated.communityWeight = 100 - numValue
      } else if (name === 'communityWeight') {
        updated.officialWeight = 100 - numValue
      }

      return updated
    })
  }

  const handleSubmit = async () => {
    setLoading(true)
    await onSave(params)
    setLoading(false)
  }

  const actions = [
    {
      label: 'إلغاء',
      onClick: onClose,
      variant: 'secondary',
    },
    {
      label: 'حفظ',
      onClick: handleSubmit,
      variant: 'primary',
      disabled: loading,
    },
  ]

  const totalWeight = params.officialWeight + params.communityWeight

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="إعدادات نظام مؤشر الثقة"
      size="lg"
      actions={actions}
    >
      <div className="space-y-6">
        <div className="flex gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <Sliders className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-slate-700">
            هذه الإعدادات تؤثر على حساب مؤشر الثقة لجميع الشركات في النظام
          </p>
        </div>

        {/* Minimum Reports */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-slate-700">
              الحد الأدنى للتقارير
            </label>
            <span className="text-lg font-bold text-green-600">{params.minReports}</span>
          </div>
          <input
            type="range"
            name="minReports"
            min="1"
            max="20"
            value={params.minReports}
            onChange={handleChange}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
          />
          <p className="text-xs text-slate-500 mt-2">
            عدد التقارير المعتمدة اللازمة لحساب مؤشر موثوق (افتراضي: 5)
          </p>
        </div>

        {/* Weight Distribution */}
        <div className="space-y-4">
          <h3 className="font-medium text-slate-900">توزيع الأوزان</h3>

          {/* Official Data Weight */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">
                وزن البيانات الرسمية
              </label>
              <span className="text-lg font-bold text-blue-600">{params.officialWeight}%</span>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="range"
                name="officialWeight"
                min="0"
                max="100"
                value={params.officialWeight}
                onChange={handleChange}
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-sm text-slate-600 w-12">
                {params.officialWeight}%
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              السجل التجاري، الحالة، العمر (افتراضي: 30%)
            </p>
          </div>

          {/* Community Data Weight */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">
                وزن بيانات المجتمع
              </label>
              <span className="text-lg font-bold text-purple-600">{params.communityWeight}%</span>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="range"
                name="communityWeight"
                min="0"
                max="100"
                value={params.communityWeight}
                onChange={handleChange}
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-sm text-slate-600 w-12">
                {params.communityWeight}%
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              تقارير الشركات المجتمعية (افتراضي: 70%)
            </p>
          </div>
        </div>

        {/* Total Weight Indicator */}
        <div
          className={`p-3 rounded-lg border ${
            totalWeight === 100
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}
        >
          <p className={`text-sm font-medium ${
            totalWeight === 100
              ? 'text-green-900'
              : 'text-red-900'
          }`}>
            المجموع: {totalWeight}% {totalWeight !== 100 && '(يجب أن يساوي 100%)'}
          </p>
        </div>
      </div>
    </BaseModal>
  )
}

export default SetParametersModal
