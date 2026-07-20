import React from 'react'
import BaseModal from './BaseModal'
import { AlertTriangle, CheckCircle } from 'lucide-react'

export function GenericConfirmActionModal({
  isOpen,
  onClose,
  onConfirm,
  action = 'approve',
  itemType = 'العنصر',
  itemName = '',
  variant = 'success',
  message = '',
  subMessage = '',
  confirmLabel = ''
}) {
  const variantConfig = {
    success: { color: 'text-green-600', bg: '#16A34A', type: 'success' },
    danger: { color: 'text-red-600', bg: '#DC2626', type: 'danger' },
    warning: { color: 'text-amber-600', bg: '#F59E0B', type: 'warning' }
  }

  const config = variantConfig[variant] || variantConfig.success
  const Icon = variant === 'success' ? CheckCircle : AlertTriangle

  const actionLabels = {
    approve: 'موافقة',
    reject: 'رفض',
    suspend: 'إيقاف'
  }

  const actionMessages = {
    approve: `هل تريد الموافقة على ${itemName}؟`,
    reject: `هل تريد رفض ${itemName}؟`,
    suspend: `هل تريد إيقاف ${itemName}؟`
  }

  const actions = [
    {
      label: 'إلغاء',
      onClick: onClose,
      variant: 'secondary',
    },
    {
      label: confirmLabel || actionLabels[action],
      onClick: onConfirm,
      variant: variant === 'danger' ? 'danger' : 'success',
    },
  ]

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={`${actionLabels[action]} ${itemType}`}
      type={variant}
      actions={actions}
    >
      <div className="flex gap-4">
        <Icon className={`w-6 h-6 ${config.color} flex-shrink-0 mt-1`} />
        <div className="flex-1">
          <p className="text-slate-900 font-medium mb-2">
            {message || actionMessages[action]}
          </p>
          {subMessage && (
            <p className="text-slate-600 text-sm">
              {subMessage}
            </p>
          )}
        </div>
      </div>
    </BaseModal>
  )
}

export default GenericConfirmActionModal
