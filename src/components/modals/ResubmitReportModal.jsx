import React, { useState } from 'react'
import BaseModal from './BaseModal'
import { AlertCircle } from 'lucide-react'

export function ResubmitReportModal({
  isOpen,
  onClose,
  onResubmit,
  rejectionReason = '',
  rejectionMessage = '',
  canResubmit = true,
}) {
  const [loading, setLoading] = useState(false)

  const handleResubmit = async () => {
    setLoading(true)
    await onResubmit()
    setLoading(false)
  }

  const actions = [
    {
      label: 'إلغاء',
      onClick: onClose,
      variant: 'secondary',
    },
    {
      label: 'المتابعة للتعديل',
      onClick: handleResubmit,
      variant: 'primary',
      disabled: !canResubmit || loading,
    },
  ]

  if (!canResubmit) {
    return (
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        title="التقرير المرفوض"
        type="danger"
      >
        <div className="flex gap-4">
          <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <p className="text-slate-900 font-medium mb-2">
              لا يمكن إعادة إرسال هذا التقرير
            </p>
            <p className="text-slate-600 text-sm mb-3">
              لقد قمت بإعادة إرسال هذا التقرير مرة واحدة بالفعل. لا يمكن إعادة إرساله مرة أخرى.
              يرجى رفع تقرير جديد.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 text-slate-900 rounded-md hover:bg-slate-300 font-medium"
            >
              فهمت
            </button>
          </div>
        </div>
      </BaseModal>
    )
  }

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="إعادة إرسال التقرير"
      type="warning"
      size="lg"
      actions={actions}
    >
      <div className="space-y-4">
        <div className="flex gap-4">
          <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <p className="text-slate-900 font-medium mb-1">
              تم رفض التقرير
            </p>
            <p className="text-slate-600 text-sm">
              يمكنك إعادة إرسال التقرير مرة واحدة فقط بعد تعديله
            </p>
          </div>
        </div>

        {/* Rejection Reason */}
        {rejectionReason && (
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <p className="text-sm font-medium text-red-900 mb-2">سبب الرفض:</p>
            <p className="text-sm text-red-800">{rejectionReason}</p>
          </div>
        )}

        {/* Rejection Message */}
        {rejectionMessage && (
          <div className="bg-slate-100 p-4 rounded-lg border border-slate-200">
            <p className="text-sm font-medium text-slate-900 mb-2">رسالة من المراجع:</p>
            <p className="text-sm text-slate-700">{rejectionMessage}</p>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-900 font-medium mb-2">الخطوات التالية:</p>
          <ul className="text-sm text-blue-800 space-y-1 ml-4">
            <li>1. أكمل القراءة لفهم سبب الرفض</li>
            <li>2. عدّل بيانات التقرير حسب الملاحظات</li>
            <li>3. أرفع المستندات الإضافية إن لزم الأمر</li>
            <li>4. أرسل التقرير مجدداً</li>
          </ul>
        </div>

        <p className="text-xs text-slate-600">
          تذكير: هذه فرصتك الأخيرة لإعادة إرسال هذا التقرير.
        </p>
      </div>
    </BaseModal>
  )
}

export default ResubmitReportModal
