import React from 'react'
import BaseModal from './BaseModal'
import { Info } from 'lucide-react'

export function InsufficientDataModal({ isOpen, onClose, reportCount = 0, minRequired = 5 }) {
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
      title="بيانات غير كافية"
      type="default"
      actions={actions}
    >
      <div className="flex gap-4">
        <Info className="w-6 h-6 text-slate-600 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <p className="text-slate-900 font-medium mb-2">
            بيانات غير كافية لتحديد مؤشر موثوق
          </p>
          <p className="text-slate-600 text-sm mb-3">
            يوجد حالياً {reportCount} تقرير معتمد فقط. نحتاج إلى {minRequired} تقارير على الأقل
            لحساب مؤشر موثوق للشركة.
          </p>
          <div className="bg-slate-100 p-3 rounded-lg">
            <p className="text-slate-600 text-sm">
              <span className="font-medium text-slate-900">الخطوات التالية:</span> انتظر المزيد من التقارير
              أو ابدأ برفع تقارير جديدة عن هذه الشركة
            </p>
          </div>
        </div>
      </div>
    </BaseModal>
  )
}

export default InsufficientDataModal
