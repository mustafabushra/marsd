import React from 'react'
import BaseModal from './BaseModal'
import { AlertCircle } from 'lucide-react'

export function PreliminaryRatingWarningModal({ isOpen, onClose, reportCount = 0, trustScore = 0 }) {
  const actions = [
    {
      label: 'فهمت',
      onClick: onClose,
      variant: 'secondary',
    },
  ]

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="تقييم أولي"
      type="warning"
      actions={actions}
    >
      <div className="flex gap-4">
        <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <p className="text-slate-900 font-medium mb-2">
            هذا تقييم أولي فقط
          </p>
          <p className="text-slate-600 text-sm mb-3">
            يوجد حالياً {reportCount} تقارير معتمدة. المؤشر الحالي هو <span className="font-bold">{trustScore}</span> وقد يتغير مع إضافة المزيد من التقارير.
          </p>
          <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
            <p className="text-sm text-amber-900">
              <span className="font-medium">ملاحظة:</span> يُنصح بالانتظار حتى الوصول إلى 5 تقارير على الأقل
              للحصول على تقييم موثوق وأكثر دقة.
            </p>
          </div>
        </div>
      </div>
    </BaseModal>
  )
}

export default PreliminaryRatingWarningModal
