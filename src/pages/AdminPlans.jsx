import { useState } from 'react'

export default function AdminPlans() {
  const [plans, setPlans] = useState([
    { id: 1, name: 'برونز', monthlyPrice: 500, yearlyPrice: 5000, features: ['5 تقارير/شهر', 'دعم عام', 'قاعدة 100 شركة'], status: 'active', customers: 45 },
    { id: 2, name: 'فضي', monthlyPrice: 1500, yearlyPrice: 15000, features: ['50 تقارير/شهر', 'أولوية دعم', 'قاعدة 1000 شركة'], status: 'active', customers: 28 },
    { id: 3, name: 'ذهبي', monthlyPrice: 5000, yearlyPrice: 50000, features: ['بلا حد للتقارير', 'دعم 24/7', 'قاعدة غير محدودة'], status: 'active', customers: 12 },
  ])

  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({ name: '', monthlyPrice: '', yearlyPrice: '', features: '' })

  const handleAddPlan = () => {
    if (!formData.name || !formData.monthlyPrice || !formData.yearlyPrice) return
    const newPlan = {
      id: Math.max(...plans.map(p => p.id), 0) + 1,
      ...formData,
      monthlyPrice: parseInt(formData.monthlyPrice),
      yearlyPrice: parseInt(formData.yearlyPrice),
      features: formData.features.split(',').map(f => f.trim()),
      status: 'active',
      customers: 0
    }
    setPlans([...plans, newPlan])
    setFormData({ name: '', monthlyPrice: '', yearlyPrice: '', features: '' })
    setShowAddForm(false)
  }

  const toggleStatus = (id) => {
    setPlans(plans.map(p => p.id === id ? { ...p, status: p.status === 'active' ? 'disabled' : 'active' } : p))
  }

  const deletePlan = (id) => {
    setPlans(plans.filter(p => p.id !== id))
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row-reverse' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
            إدارة الباقات
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
            إنشاء وتعديل خطط الاشتراك
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: '10px 20px',
            background: '#16A34A',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {showAddForm ? 'إلغاء' : '+ باقة جديدة'}
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>
            باقة جديدة
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <input
              type="text"
              placeholder="اسم الباقة"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={{
                padding: '10px 12px',
                border: '1.5px solid #E2E8F0',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'Tajawal',
                textAlign: 'right',
              }}
            />
            <input
              type="number"
              placeholder="السعر الشهري (ريال)"
              value={formData.monthlyPrice}
              onChange={(e) => setFormData({ ...formData, monthlyPrice: e.target.value })}
              style={{
                padding: '10px 12px',
                border: '1.5px solid #E2E8F0',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'Tajawal',
                textAlign: 'right',
              }}
            />
            <input
              type="number"
              placeholder="السعر السنوي (ريال)"
              value={formData.yearlyPrice}
              onChange={(e) => setFormData({ ...formData, yearlyPrice: e.target.value })}
              style={{
                padding: '10px 12px',
                border: '1.5px solid #E2E8F0',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'Tajawal',
                textAlign: 'right',
              }}
            />
            <textarea
              placeholder="المميزات (مفصولة بفاصلة)"
              value={formData.features}
              onChange={(e) => setFormData({ ...formData, features: e.target.value })}
              style={{
                padding: '10px 12px',
                border: '1.5px solid #E2E8F0',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'Tajawal',
                textAlign: 'right',
                gridColumn: '1 / -1',
                minHeight: '80px',
              }}
            />
          </div>
          <button
            onClick={handleAddPlan}
            style={{
              marginTop: '16px',
              padding: '10px 20px',
              background: '#16A34A',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              width: '100%',
            }}
          >
            حفظ الباقة
          </button>
        </div>
      )}

      {/* Plans Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {plans.map(plan => (
          <div key={plan.id} style={{
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '20px',
          }}>
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px 0' }}>
                  {plan.name}
                </h3>
                <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>
                  {plan.customers} عميل
                </p>
              </div>
              <span style={{
                padding: '4px 10px',
                background: plan.status === 'active' ? '#DCFCE7' : '#FEE2E2',
                color: plan.status === 'active' ? '#15803D' : '#DC2626',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
              }}>
                {plan.status === 'active' ? 'نشط' : 'معطل'}
              </span>
            </div>

            <div style={{ marginBottom: '16px', padding: '12px', background: '#F8FAFC', borderRadius: '8px' }}>
              <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '6px' }}>السعر الشهري</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#1E2A52' }}>
                {plan.monthlyPrice} ر.س
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                أو {plan.yearlyPrice} ر.س سنويًا
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
                المميزات:
              </div>
              <ul style={{ margin: 0, paddingRight: '20px', textAlign: 'right' }}>
                {plan.features.map((feature, idx) => (
                  <li key={idx} style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                onClick={() => toggleStatus(plan.id)}
                style={{
                  padding: '8px 12px',
                  background: plan.status === 'active' ? '#FEE2E2' : '#DCFCE7',
                  color: plan.status === 'active' ? '#DC2626' : '#15803D',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {plan.status === 'active' ? 'تعطيل' : 'تفعيل'}
              </button>
              <button
                onClick={() => deletePlan(plan.id)}
                style={{
                  padding: '8px 12px',
                  background: '#FEE2E2',
                  color: '#DC2626',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                حذف
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
