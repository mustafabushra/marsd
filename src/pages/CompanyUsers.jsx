import { useState } from 'react'
import { AlertCircle, UserPlus, Trash2, Edit2 } from 'lucide-react'

export default function CompanyUsers() {
  const [users, setUsers] = useState([
    { id: 1, name: 'أحمد السالم', email: 'ahmed@company.sa', role: 'مدير', status: 'نشط', stBg: '#ECFDF5', stC: '#15803D', last: 'منذ ساعة' },
    { id: 2, name: 'فاطمة محمد', email: 'fatima@company.sa', role: 'محرر', status: 'نشط', stBg: '#ECFDF5', stC: '#15803D', last: 'منذ 3 ساعات' },
    { id: 3, name: 'محمد علي', email: 'mohamad@company.sa', role: 'عارض', status: 'نشط', stBg: '#ECFDF5', stC: '#15803D', last: 'منذ يوم' },
    { id: 4, name: 'سارة أحمد', email: 'sarah@company.sa', role: 'محرر', status: 'معطل', stBg: '#FEE2E2', stC: '#DC2626', last: 'منذ أسبوع' }
  ])
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')

  const handleInviteUser = () => {
    if (inviteEmail.trim()) {
      alert(`✅ تم إرسال دعوة إلى ${inviteEmail}`)
      setInviteEmail('')
      setShowInviteForm(false)
    }
  }

  const handleDeleteUser = (userId) => {
    if (window.confirm('هل أنت متأكد من حذف هذا المستخدم؟')) {
      setUsers(users.filter(u => u.id !== userId))
      alert('✅ تم حذف المستخدم بنجاح')
    }
  }

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '22px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexDirection: 'row-reverse' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexDirection: 'row-reverse' }}>
          <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 0 0', textAlign: 'right' }}>المستخدمون</h3>
          <span style={{ background: '#EEF2FF', color: '#1E2A52', borderRadius: '999px', padding: '6px 14px', fontSize: '13px', fontWeight: 800 }}>{users.length} مستخدمين</span>
        </div>
        <button
          onClick={() => setShowInviteForm(!showInviteForm)}
          style={{
            background: '#16A34A',
            color: '#fff',
            border: 0,
            borderRadius: '10px',
            padding: '10px 20px',
            fontSize: '13.5px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <UserPlus size={16} />
          + دعوة مستخدم
        </button>
      </div>

      {showInviteForm && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', marginBottom: '18px', display: 'flex', gap: '8px' }}>
          <input
            type="email"
            placeholder="البريد الإلكتروني"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleInviteUser()}
            style={{ flex: 1, border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', outline: 'none' }}
          />
          <button
            onClick={handleInviteUser}
            style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '8px', padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}
          >
            إرسال
          </button>
          <button
            onClick={() => setShowInviteForm(false)}
            style={{ background: '#E2E8F0', color: '#64748B', border: 0, borderRadius: '8px', padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}
          >
            إلغاء
          </button>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 2fr 1fr 1fr 1fr', padding: '15px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B' }}>
          <span>الاسم</span>
          <span>البريد الإلكتروني</span>
          <span>الدور</span>
          <span>الحالة</span>
          <span>الإجراءات</span>
        </div>
        {users.map(u => (
          <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1.8fr 2fr 1fr 1fr 1fr', padding: '15px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center' }}>
            <span style={{ fontSize: '14.5px', fontWeight: 700, color: '#0F172A' }}>{u.name}</span>
            <span style={{ fontSize: '13.5px', color: '#64748B' }}>{u.email}</span>
            <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 700 }}>{u.role}</span>
            <span>
              <span style={{ background: u.stBg, color: u.stC, borderRadius: '7px', padding: '4px 12px', fontSize: '12.5px', fontWeight: 800 }}>{u.status}</span>
            </span>
            <span style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => alert(`تعديل المستخدم: ${u.name}`)}
                title="تعديل"
                style={{ background: '#3B82F6', color: '#fff', border: 0, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}
              >
                <Edit2 size={14} />
                تعديل
              </button>
              <button
                onClick={() => handleDeleteUser(u.id)}
                title="حذف"
                style={{ background: '#EF4444', color: '#fff', border: 0, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}
              >
                <Trash2 size={14} />
                حذف
              </button>
            </span>
          </div>
        ))}
      </div>
    </main>
  )
}
