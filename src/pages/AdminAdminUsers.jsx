import { useState } from 'react'

export default function AdminAdminUsers() {
  const [admins, setAdmins] = useState([
    { id: 1, name: 'محمد علي', email: 'admin1@marsad.sa', role: 'super_admin', status: 'active', joinDate: '2026-06-01' },
    { id: 2, name: 'فاطمة خالد', email: 'admin2@marsad.sa', role: 'admin', status: 'active', joinDate: '2026-06-15' },
  ])

  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', email: '', role: 'admin', password: '' })

  const handleAddAdmin = () => {
    if (!formData.name || !formData.email || !formData.password) return
    setAdmins([...admins, { id: admins.length + 1, ...formData, status: 'active', joinDate: new Date().toISOString().split('T')[0] }])
    setFormData({ name: '', email: '', role: 'admin', password: '' })
    setShowAddForm(false)
  }

  const toggleStatus = (id) => {
    setAdmins(admins.map(a => a.id === id ? { ...a, status: a.status === 'active' ? 'disabled' : 'active' } : a))
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row-reverse' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', textAlign: 'right' }}>
            إدارة مسؤولي المنصة
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
            إضافة وإدارة مسؤولي النظام والأدوار
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
          {showAddForm ? 'إلغاء' : '+ إضافة مسؤول'}
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 16px 0', textAlign: 'right' }}>
            إضافة مسؤول جديد
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <input
              type="text"
              placeholder="الاسم الكامل"
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
              type="email"
              placeholder="البريد الإلكتروني"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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
              type="password"
              placeholder="كلمة المرور"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              style={{
                padding: '10px 12px',
                border: '1.5px solid #E2E8F0',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'Tajawal',
                textAlign: 'right',
              }}
            />
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              style={{
                padding: '10px 12px',
                border: '1.5px solid #E2E8F0',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'Tajawal',
              }}
            >
              <option value="admin">مسؤول عادي</option>
              <option value="super_admin">مسؤول أعلى</option>
            </select>
          </div>
          <button
            onClick={handleAddAdmin}
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
            إنشاء الحساب
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الاسم</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>البريد</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>الدور</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569', borderLeft: '1px solid #E2E8F0' }}>تاريخ الإضافة</th>
              <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#475569' }}>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {admins.map(admin => (
              <tr key={admin.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '16px', fontSize: '14px', color: '#0F172A', fontWeight: 600, borderLeft: '1px solid #E2E8F0' }}>
                  {admin.name}
                </td>
                <td style={{ padding: '16px', fontSize: '13px', color: '#64748B', borderLeft: '1px solid #E2E8F0' }}>
                  {admin.email}
                </td>
                <td style={{ padding: '16px', fontSize: '13px', color: '#475569', borderLeft: '1px solid #E2E8F0' }}>
                  <span style={{
                    padding: '4px 10px',
                    background: admin.role === 'super_admin' ? '#F0E5FF' : '#E0F2FE',
                    color: admin.role === 'super_admin' ? '#7C3AED' : '#0369A1',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}>
                    {admin.role === 'super_admin' ? 'مسؤول أعلى' : 'مسؤول'}
                  </span>
                </td>
                <td style={{ padding: '16px', fontSize: '13px', color: '#64748B', borderLeft: '1px solid #E2E8F0' }}>
                  {admin.joinDate}
                </td>
                <td style={{ padding: '16px', fontSize: '13px' }}>
                  <button
                    onClick={() => toggleStatus(admin.id)}
                    style={{
                      padding: '6px 12px',
                      background: admin.status === 'active' ? '#FEE2E2' : '#DCFCE7',
                      color: admin.status === 'active' ? '#DC2626' : '#15803D',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {admin.status === 'active' ? 'تعطيل' : 'تفعيل'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
