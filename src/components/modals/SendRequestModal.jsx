import React, { useState } from 'react'
import BaseModal from './BaseModal'
import { Send } from 'lucide-react'

export function SendRequestModal({ isOpen, onClose, onSend, recipientCompanyName = '' }) {
  const [formData, setFormData] = useState({
    type: 'collaboration',
    message: '',
  })
  const [loading, setLoading] = useState(false)

  const requestTypes = [
    { id: 'collaboration', label: 'تعاون تجاري', icon: '🤝' },
    { id: 'purchase', label: 'استعلام شراء', icon: '💰' },
    { id: 'sale', label: 'عرض بيع', icon: '📦' },
    { id: 'partnership', label: 'شراكة استراتيجية', icon: '🔗' },
    { id: 'other', label: 'أخرى', icon: '💬' },
  ]

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async () => {
    if (!formData.message.trim()) return
    setLoading(true)
    await onSend(formData)
    setLoading(false)
    setFormData({ type: 'collaboration', message: '' })
  }

  const actions = [
    {
      label: 'إلغاء',
      onClick: onClose,
      variant: 'secondary',
    },
    {
      label: 'إرسال الطلب',
      onClick: handleSubmit,
      variant: 'primary',
      disabled: !formData.message.trim() || loading,
    },
  ]

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="إرسال طلب عمل"
      size="lg"
      actions={actions}
    >
      <div className="space-y-4">
        <div className="flex gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <Send className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-medium">إرسال طلب إلى {recipientCompanyName}</p>
            <p className="text-xs mt-1">سيتم إرسال طلبك إلى فريق الشركة للنظر فيه</p>
          </div>
        </div>

        {/* Request Type */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-3">
            نوع الطلب
          </label>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {requestTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => setFormData((prev) => ({ ...prev, type: type.id }))}
                className={`p-3 rounded-lg border-2 text-center transition-all ${
                  formData.type === type.id
                    ? 'border-green-500 bg-green-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <span className="text-lg mb-1 block">{type.icon}</span>
                <span className="text-xs font-medium text-slate-700">{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            الرسالة *
          </label>
          <textarea
            name="message"
            value={formData.message}
            onChange={handleChange}
            placeholder="اكتب تفاصيل طلبك هنا. كن واضحاً ومحترفاً..."
            rows="5"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
          />
          <p className="text-xs text-slate-500 mt-2">
            الحد الأدنى: 10 أحرف | الحد الأقصى: 1000 حرف ({formData.message.length}/1000)
          </p>
        </div>

        {/* Privacy Notice */}
        <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
          <p className="text-xs text-amber-900">
            <span className="font-medium">ملاحظة:</span> سيتم إرسال بريدك الإلكتروني إلى الشركة
            المستقبلة. تأكد من رغبتك في مشاركة معلومات الاتصال الخاصة بك.
          </p>
        </div>
      </div>
    </BaseModal>
  )
}

export default SendRequestModal
