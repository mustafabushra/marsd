import React, { useEffect, useState } from 'react'
import BaseModal from './BaseModal'
import { Clock, LogOut } from 'lucide-react'

export function SessionExpiredModal({ isOpen, onClose, onLogin, countdown = 60 }) {
  const [timeLeft, setTimeLeft] = useState(countdown)

  useEffect(() => {
    if (!isOpen) return

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          onLogin() // Auto-redirect to login when countdown ends
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [isOpen, onLogin])

  const actions = [
    {
      label: 'تسجيل الدخول',
      onClick: onLogin,
      variant: 'primary',
    },
  ]

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={() => {}} // Prevent closing by clicking backdrop or close button
      title="انتهت جلستك"
      type="warning"
      closeButton={false}
      actions={actions}
    >
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="p-4 bg-amber-100 rounded-full">
            <LogOut className="w-8 h-8 text-amber-600" />
          </div>
        </div>

        <div>
          <p className="text-slate-900 font-medium text-lg mb-2">
            انتهت جلستك
          </p>
          <p className="text-slate-600 text-sm">
            لم تقم بأي نشاط لفترة من الوقت. يرجى تسجيل الدخول مجدداً لمتابعة استخدام Marsad.
          </p>
        </div>

        {/* Countdown */}
        <div className="flex items-center justify-center gap-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
          <Clock className="w-5 h-5 text-slate-600" />
          <p className="text-slate-700 text-sm font-medium">
            سيتم التحويل تلقائياً بعد <span className="font-bold text-lg">{timeLeft}</span> ثانية
          </p>
        </div>

        {/* Additional Info */}
        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
          <p className="text-xs text-blue-900">
            <span className="font-medium">نصيحة:</span> هذا إجراء أمان لحماية حسابك. لا تقلق، بيانات عملك محفوظة.
          </p>
        </div>
      </div>
    </BaseModal>
  )
}

export default SessionExpiredModal
