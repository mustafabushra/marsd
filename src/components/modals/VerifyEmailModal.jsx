import React, { useState } from 'react'
import BaseModal from './BaseModal'
import { Mail, CheckCircle } from 'lucide-react'

export function VerifyEmailModal({ isOpen, onClose, onResend, email = '', isVerified = false }) {
  const [resendLoading, setResendLoading] = useState(false)

  const handleResend = async () => {
    setResendLoading(true)
    await onResend()
    setResendLoading(false)
  }

  const actions = [
    {
      label: 'لاحقاً',
      onClick: onClose,
      variant: 'secondary',
    },
    {
      label: 'أعد الإرسال',
      onClick: handleResend,
      variant: 'primary',
      disabled: resendLoading,
    },
  ]

  if (isVerified) {
    return (
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        title="تم التحقق"
        type="success"
      >
        <div className="flex gap-4 text-center justify-center">
          <div className="flex-1">
            <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
            <p className="text-slate-900 font-medium mb-1">
              تم التحقق من بريدك الإلكتروني
            </p>
            <p className="text-slate-600 text-sm">
              حسابك الآن مفعل تماماً ويمكنك البدء في استخدام Marsad
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
            >
              ابدأ الآن
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
      title="التحقق من البريد الإلكتروني"
      type="default"
      actions={actions}
    >
      <div className="text-center">
        <Mail className="w-12 h-12 text-blue-600 mx-auto mb-3" />
        <p className="text-slate-900 font-medium mb-2">
          تحقق من بريدك الإلكتروني
        </p>
        <p className="text-slate-600 text-sm mb-2">
          أرسلنا رسالة تأكيد إلى:
        </p>
        <p className="font-mono bg-slate-100 p-2 rounded text-sm text-slate-700 mb-4">
          {email}
        </p>
        <p className="text-slate-600 text-sm">
          انقر على الرابط في الرسالة لتفعيل حسابك. إذا لم تستلم الرسالة،
          تحقق من مجلد البريد العشوائي أو اطلب إعادة الإرسال.
        </p>
      </div>
    </BaseModal>
  )
}

export default VerifyEmailModal
