import React, { useState } from 'react'
import BaseModal from './BaseModal'
import { XCircle } from 'lucide-react'

export function ConfirmRejectReportModal({ isOpen, onClose, onConfirm, companyName }) {
  const [selectedReason, setSelectedReason] = useState('')
  const [customReason, setCustomReason] = useState('')
  const [message, setMessage] = useState('')

  const reasons = [
    { id: 'insufficient-data', label: 'بيانات غير كافية' },
    { id: 'document-mismatch', label: 'عدم توافق المستندات' },
    { id: 'authenticity-doubt', label: 'شكوك في الصحة' },
    { id: 'other', label: 'سبب آخر' },
  ]

  const handleConfirm = () => {
    const finalReason = selectedReason === 'other' ? customReason : selectedReason
    onConfirm({ reason: finalReason, message })
    setSelectedReason('')
    setCustomReason('')
    setMessage('')
  }

  const actions = [
    {
      label: 'إلغاء',
      onClick: onClose,
      variant: 'secondary',
    },
    {
      label: 'رفض وإرسال رسالة',
      onClick: handleConfirm,
      variant: 'danger',
      disabled: !selectedReason || (selectedReason === 'other' && !customReason),
    },
  ]

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="رفض التقرير"
      type="danger"
      size="lg"
      actions={actions}
    >
      <div className="space-y-4">
        <div className="flex gap-4 mb-4">
          <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
          <div>
            <p className="text-slate-900 font-medium">
              رفض تقرير <span className="font-bold">{companyName}</span>
            </p>
            <p className="text-slate-600 text-sm mt-1">
              اختر سبب الرفض وأرسل رسالة للمرسل
            </p>
          </div>
        </div>

        {/* Reason Selection */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">
            سبب الرفض
          </label>
          <div className="space-y-2">
            {reasons.map((reason) => (
              <label
                key={reason.id}
                className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50"
              >
                <input
                  type="radio"
                  name="rejection-reason"
                  value={reason.id}
                  checked={selectedReason === reason.id}
                  onChange={(e) => setSelectedReason(e.target.value)}
                  className="w-4 h-4"
                />
                <span className="text-slate-700">{reason.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Custom Reason */}
        {selectedReason === 'other' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              وضح السبب
            </label>
            <input
              type="text"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="اكتب السبب هنا..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        )}

        {/* Message to Sender */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            رسالة للمرسل (اختياري)
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="أضف تفاصيل إضافية للمرسل..."
            rows="4"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
          />
        </div>
      </div>
    </BaseModal>
  )
}

export default ConfirmRejectReportModal
