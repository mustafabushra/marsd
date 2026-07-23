import { useState } from 'react'
import { useUserRole } from '../hooks/useUserRole'
import { useSystemStatus } from '../hooks/useSystemStatus'
import { canPerform } from '../utils/roles'

export default function CompanyUsers() {
  const { role, loading: roleLoading } = useUserRole()
  const systemStatus = useSystemStatus()
  const [users] = useState([
    { id: 1, name: 'أحمد السالم', email: 'ahmed@company.sa', role: 'مدير', status: 'نشط', stBg: '#ECFDF5', stC: '#15803D', last: 'منذ ساعة' },
    { id: 2, name: 'فاطمة محمد', email: 'fatima@company.sa', role: 'محرر', status: 'نشط', stBg: '#ECFDF5', stC: '#15803D', last: 'منذ 3 ساعات' },
    { id: 3, name: 'محمد علي', email: 'mohamad@company.sa', role: 'عارض', status: 'نشط', stBg: '#ECFDF5', stC: '#15803D', last: 'منذ يوم' },
    { id: 4, name: 'سارة أحمد', email: 'sarah@company.sa', role: 'محرر', status: 'معطل', stBg: '#FEE2E2', stC: '#DC2626', last: 'منذ أسبوع' }
  ])

  // Check access for user management (BUSINESS_RULES_MATRIX #55-63)
  const canManageUsers = canPerform(role, 'canManageUsers')
  const isViewOnly = role === 'viewer' || !canManageUsers

  // Only Owner and Admin can see user management
  if (roleLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        جاري التحميل...
      </div>
    )
  }

  if (!canManageUsers && role !== 'viewer') {
    return (
      <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '22px 28px' }}>
        <div style={{ maxWidth: '600px', margin: '60px auto', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
          <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#0F172A', marginBottom: '8px' }}>لا توجد صلاحية</h2>
          <p style={{ fontSize: '15px', color: '#64748B', marginBottom: '24px' }}>فقط Owner و Admin يستطيعان إدارة المستخدمين. دورك الحالي: <strong>{role}</strong></p>
        </div>
      </main>
    )
  }

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '22px 28px' }}>
      {isViewOnly && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '10px', padding: '12px 16px', marginBottom: '18px', fontSize: '13.5px', color: '#991B1B', fontWeight: 700 }}>
          ⚠️ صلاحيات محدودة — دور {role} لا يستطيع إدارة المستخدمين
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexDirection: 'row-reverse' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexDirection: 'row-reverse' }}>
          <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 0 0', textAlign: 'right' }}>المستخدمون</h3>
          <span style={{ background: '#EEF2FF', color: '#1E2A52', borderRadius: '999px', padding: '6px 14px', fontSize: '13px', fontWeight: 800 }}>4 من 8 مقاعد</span>
        </div>
        <button
          disabled={isViewOnly}
          title={isViewOnly ? `دور ${role} لا يستطيع إضافة مستخدمين` : ''}
          style={{
            background: isViewOnly ? '#D1D5DB' : '#16A34A',
            color: '#fff',
            border: 0,
            borderRadius: '10px',
            padding: '10px 20px',
            fontSize: '13.5px',
            fontWeight: 800,
            cursor: isViewOnly ? 'not-allowed' : 'pointer',
            opacity: isViewOnly ? 0.6 : 1,
          }}
        >
          + دعوة مستخدم
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 2fr 1fr 1fr 1.2fr', padding: '15px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B' }}>
          <span>الاسم</span>
          <span>البريد الإلكتروني</span>
          <span>الدور</span>
          <span>الحالة</span>
          <span>آخر دخول</span>
        </div>
        {users.map(u => (
          <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 2fr 1fr 1fr 1.2fr', padding: '15px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center' }}>
            <span style={{ fontSize: '14.5px', fontWeight: 700, color: '#0F172A' }}>{u.name}</span>
            <span style={{ fontSize: '13.5px', color: '#64748B' }}>{u.email}</span>
            <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 700 }}>{u.role}</span>
            <span>
              <span style={{ background: u.stBg, color: u.stC, borderRadius: '7px', padding: '4px 12px', fontSize: '12.5px', fontWeight: 800 }}>{u.status}</span>
            </span>
            <span style={{ fontSize: '13px', color: '#94A3B8', fontWeight: 600 }}>{u.last}</span>
          </div>
        ))}
      </div>
    </main>
  )
}
