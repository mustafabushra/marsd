import React, { useState } from 'react'
import BaseModal from './BaseModal'
import { Mail } from 'lucide-react'

export function InviteUserModal({ isOpen, onClose, onInvite }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('employee')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!email.trim()) return
    setLoading(true)
    await onInvite({ email, role })
    setLoading(false)
    setEmail('')
    setRole('employee')
  }

  const actions = [
    {
      label: 'إلغاء',
      onClick: onClose,
      variant: 'secondary',
    },
    {
      label: 'إرسال الدعوة',
      onClick: handleSubmit,
      variant: 'primary',
      disabled: !email.trim() || loading,
    },
  ]

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="دعوة مستخدم جديد"
      actions={actions}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            البريد الإلكتروني
          </label>
          <div className="relative">
            <Mail className="absolute right-3 top-3 w-5 h-5 text-slate-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full pr-10 pl-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            الدور
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="employee">موظف عادي</option>
            <option value="manager">مدير الشركة</option>
          </select>
          <p className="text-xs text-slate-500 mt-2">
            المدير: صلاحيات كاملة | الموظف: بحث وتقارير فقط
          </p>
        </div>

        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-900">
            سيتم إرسال رابط دعوة إلى بريد المستخدم. يجب عليه قبول الدعوة للانضمام إلى الشركة.
          </p>
        </div>
      </div>
    </BaseModal>
  )
}

export default InviteUserModal
