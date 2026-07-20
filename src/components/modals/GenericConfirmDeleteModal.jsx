import React from 'react'
import BaseModal from './BaseModal'
import { AlertTriangle } from 'lucide-react'

export function GenericConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  itemType = 'العنصر',
  itemName = '',
  message = 'هل أنت متأكد من حذف هذا العنصر؟',
  subMessage = 'هذا الإجراء لا يمكن الرجوع عنه.'
}) {
  const actions = [
    {
      label: 'إلغاء',
      onClick: onClose,
      variant: 'secondary',
    },
    {
      label: `حذف ${itemType}`,
      onClick: onConfirm,
      variant: 'danger',
    },
  ]

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={`حذف ${itemType}`}
      type="danger"
      actions={actions}
    >
      <div className="flex gap-4">
        <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <p className="text-slate-900 font-medium mb-2">
            {itemName ? `${message.replace('هذا العنصر', itemName)}` : `${message}؟`}
          </p>
          <p className="text-slate-600 text-sm">
            {subMessage}
          </p>
        </div>
      </div>
    </BaseModal>
  )
}

export default GenericConfirmDeleteModal
