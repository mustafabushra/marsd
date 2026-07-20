import React, { useEffect } from 'react'
import { CheckCircle, X } from 'lucide-react'

export function SuccessNotificationModal({
  isOpen,
  onClose,
  message = 'تم بنجاح!',
  duration = 4000,
}) {
  useEffect(() => {
    if (isOpen && duration) {
      const timer = setTimeout(onClose, duration)
      return () => clearTimeout(timer)
    }
  }, [isOpen, onClose, duration])

  if (!isOpen) return null

  return (
    <div className="fixed top-6 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg shadow-lg p-4 max-w-sm">
        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-green-900">{message}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-green-100 rounded transition-colors"
          aria-label="Close notification"
        >
          <X className="w-4 h-4 text-green-600" />
        </button>
      </div>
    </div>
  )
}

export default SuccessNotificationModal
