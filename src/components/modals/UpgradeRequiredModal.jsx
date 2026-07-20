import React from 'react'
import BaseModal from './BaseModal'
import { Lock, Check } from 'lucide-react'

export function UpgradeRequiredModal({ isOpen, onClose, onUpgrade, featureName = '' }) {
  const plans = [
    {
      name: 'أساسي',
      price: '99 ريال/شهر',
      features: ['البحث غير محدود', 'تقارير مجتمع'],
    },
    {
      name: 'احترافي',
      price: '299 ريال/شهر',
      features: ['كل ميزات الأساسي', 'البيانات الرسمية', 'قوائم المراقبة', 'المقارنة'],
    },
    {
      name: 'مؤسسات',
      price: 'حسب الطلب',
      features: ['كل الميزات', 'دعم أولويات', 'API مخصص'],
    },
  ]

  const actions = [
    {
      label: 'لاحقاً',
      onClick: onClose,
      variant: 'secondary',
    },
    {
      label: 'ترقية الآن',
      onClick: onUpgrade,
      variant: 'primary',
    },
  ]

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="ترقية الباقة"
      size="lg"
      actions={actions}
    >
      <div className="space-y-4">
        <div className="flex gap-3 p-3 bg-slate-50 rounded-lg">
          <Lock className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" />
          <p className="text-slate-700 text-sm">
            هذه الميزة <span className="font-medium">{featureName}</span> متاحة فقط في الباقات المدفوعة
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className="border border-slate-200 rounded-lg p-4 hover:border-green-400 transition-colors"
            >
              <h3 className="font-bold text-slate-900 mb-1">{plan.name}</h3>
              <p className="text-green-600 font-medium mb-3">{plan.price}</p>
              <ul className="space-y-2">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex gap-2 text-sm text-slate-600">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </BaseModal>
  )
}

export default UpgradeRequiredModal
