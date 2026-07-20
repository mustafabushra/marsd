import React, { useState } from 'react'
import BaseModal from './BaseModal'
import { AlertTriangle } from 'lucide-react'

export function UnsubscribeConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  planName = '',
  nextBillingDate = '',
}) {
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    await onConfirm()
    setLoading(false)
    setConfirmText('')
  }

  const isConfirmed = confirmText === 'إلغاء الاشتراك'

  const actions = [
    {
      label: 'بقاء',
      onClick: onClose,
      variant: 'secondary',
    },
    {
      label: 'إلغاء الاشتراك',
      onClick: handleConfirm,
      variant: 'danger',
      disabled: !isConfirmed || loading,
    },
  ]

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="إلغاء الاشتراك"
      type="danger"
      size="lg"
      actions={actions}
    >
      <div className="space-y-4">
        <div className="flex gap-4">
          <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <p className="text-slate-900 font-medium mb-2">
              هل تريد فعلاً إلغاء الاشتراك؟
            </p>
            <p className="text-slate-600 text-sm">
              ستفقد الوصول إلى جميع الميزات المدفوعة وستنتقل إلى الباقة المجانية.
            </p>
          </div>
        </div>

        {/* Consequences */}
        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
          <p className="text-sm font-medium text-red-900 mb-3">سيتم فقدان:</p>
          <ul className="space-y-2">
            <li className="flex gap-2 text-sm text-red-800">
              <span>•</span>
              <span>البيانات الرسمية (السجل التجاري، الحالة)</span>
            </li>
            <li className="flex gap-2 text-sm text-red-800">
              <span>•</span>
              <span>بيانات المجتمع التجاري والمؤشرات</span>
            </li>
            <li className="flex gap-2 text-sm text-red-800">
              <span>•</span>
              <span>قوائم المراقبة والمقارنة</span>
            </li>
            <li className="flex gap-2 text-sm text-red-800">
              <span>•</span>
              <span>تقارير متقدمة والتحليلات</span>
            </li>
          </ul>
        </div>

        {/* Billing Info */}
        {nextBillingDate && (
          <div className="bg-slate-100 p-4 rounded-lg border border-slate-200">
            <p className="text-sm text-slate-700">
              <span className="font-medium">الفاتورة القادمة:</span> {nextBillingDate}
            </p>
            <p className="text-xs text-slate-600 mt-1">
              سيتم إلغاء الاشتراك في نهاية فترة الفوترة الحالية
            </p>
          </div>
        )}

        {/* Confirmation */}
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">
            أدخل "إلغاء الاشتراك" للتأكيد:
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="اكتب هنا"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        {/* Support Option */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-900">
            هل تواجه مشكلة في الخدمة؟
            <a href="/contact" className="font-medium hover:underline ml-1">
              تواصل معنا
            </a>
          </p>
        </div>
      </div>
    </BaseModal>
  )
}

export default UnsubscribeConfirmModal
