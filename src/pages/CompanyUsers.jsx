import { useState, useEffect } from 'react'
import { UserPlus, Trash2, Edit2 } from 'lucide-react'
import { getSupabase } from '../lib/api'

export default function CompanyUsers() {
  const [users, setUsers] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('company_member')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const supabase = getSupabase()
      const { data: authUser } = await supabase.auth.getUser()
      if (!authUser.user) throw new Error('Unauthorized')

      // Get user's tenant
      const { data: userData } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', authUser.user.id)
        .single()

      if (!userData?.tenant_id) throw new Error('Tenant not found')

      // Get company users
      const { data: companyUsers } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, role, status, last_login_at')
        .eq('tenant_id', userData.tenant_id)

      const formatted = (companyUsers || []).map(u => ({
        id: u.id,
        name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'مستخدم',
        email: u.email,
        role: u.role === 'company_admin' ? 'مدير' : 'محرر',
        status: u.status === 'active' ? 'نشط' : 'معطل',
        stBg: u.status === 'active' ? '#ECFDF5' : '#FEE2E2',
        stC: u.status === 'active' ? '#15803D' : '#DC2626',
        lastLogin: u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('ar-SA') : 'لم يسجل دخول'
      }))

      setUsers(formatted)

      // Get pending invites
      const { data: invites } = await supabase
        .from('pending_invites')
        .select('id, email, role, status, created_at')
        .eq('tenant_id', userData.tenant_id)

      setPendingInvites(invites || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleInviteUser = async () => {
    if (!inviteEmail.trim()) {
      setError('أدخل بريد إلكتروني صحيح')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const supabase = getSupabase()
      const { data: authUser } = await supabase.auth.getUser()
      if (!authUser.user) throw new Error('Unauthorized')

      // Get tenant
      const { data: userData } = await supabase
        .from('users')
        .select('tenant_id')
        .eq('id', authUser.user.id)
        .single()

      // Create pending invite
      const { error: inviteError } = await supabase
        .from('pending_invites')
        .insert([{
          tenant_id: userData.tenant_id,
          email: inviteEmail,
          role: inviteRole,
          invited_by: authUser.user.id,
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }])

      if (inviteError) throw inviteError

      // Audit log
      await supabase
        .from('audit_logs')
        .insert([{
          tenant_id: userData.tenant_id,
          actor_id: authUser.user.id,
          action: 'user_invited',
          entity: 'user',
          meta: JSON.stringify({ email: inviteEmail, role: inviteRole }),
          created_at: new Date().toISOString()
        }])
        .catch(err => console.warn('Audit log warning:', err))

      setInviteEmail('')
      setInviteRole('company_member')
      setShowInviteForm(false)
      loadUsers()
      alert(`✅ تم إرسال دعوة إلى ${inviteEmail}`)
    } catch (err) {
      setError(err.message || 'فشل إرسال الدعوة')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return

    try {
      const supabase = getSupabase()
      const { error } = await supabase
        .from('users')
        .update({ status: 'inactive' })
        .eq('id', userId)

      if (error) throw error

      setUsers(users.filter(u => u.id !== userId))
      alert('✅ تم تعطيل المستخدم بنجاح')
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        جاري التحميل...
      </div>
    )
  }

  return (
    <main style={{ background: '#F8FAFC', minHeight: '100vh', padding: '22px 28px' }}>
      {error && (
        <div style={{
          background: '#FEE2E2',
          border: '1px solid #FECACA',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px',
          color: '#DC2626'
        }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexDirection: 'row-reverse' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexDirection: 'row-reverse' }}>
          <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 0 0', textAlign: 'right' }}>المستخدمون ({users.length})</h3>
          {pendingInvites.length > 0 && (
            <span style={{ background: '#FEF3C7', color: '#92400E', borderRadius: '999px', padding: '6px 14px', fontSize: '13px', fontWeight: 800 }}>
              {pendingInvites.length} دعوة معلقة
            </span>
          )}
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
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', marginBottom: '18px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="email"
            placeholder="البريد الإلكتروني"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleInviteUser()}
            style={{ flex: 1, minWidth: '200px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', outline: 'none' }}
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', outline: 'none' }}
          >
            <option value="company_member">محرر</option>
            <option value="company_admin">مدير</option>
          </select>
          <button
            onClick={handleInviteUser}
            disabled={submitting}
            style={{ background: submitting ? '#CCCCCC' : '#16A34A', color: '#fff', border: 0, borderRadius: '8px', padding: '10px 16px', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer' }}
          >
            {submitting ? '⏳' : '✓'} إرسال
          </button>
          <button
            onClick={() => setShowInviteForm(false)}
            style={{ background: '#E2E8F0', color: '#64748B', border: 0, borderRadius: '8px', padding: '10px 16px', fontWeight: 700, cursor: 'pointer' }}
          >
            إلغاء
          </button>
        </div>
      )}

      {/* Current Users */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 2fr 1fr 1fr 1fr', padding: '15px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B' }}>
          <span>الاسم</span>
          <span>البريد الإلكتروني</span>
          <span>الدور</span>
          <span>الحالة</span>
          <span>الإجراءات</span>
        </div>
        {users.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
            لا توجد مستخدمين حالياً
          </div>
        ) : (
          users.map(u => (
            <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1.8fr 2fr 1fr 1fr 1fr', padding: '15px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center' }}>
              <span style={{ fontSize: '14.5px', fontWeight: 700, color: '#0F172A' }}>{u.name}</span>
              <span style={{ fontSize: '13.5px', color: '#64748B', direction: 'ltr' }}>{u.email}</span>
              <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 700 }}>{u.role}</span>
              <span>
                <span style={{ background: u.stBg, color: u.stC, borderRadius: '7px', padding: '4px 12px', fontSize: '12.5px', fontWeight: 800 }}>{u.status}</span>
              </span>
              <span style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleDeleteUser(u.id)}
                  title="تعطيل"
                  style={{ background: '#EF4444', color: '#fff', border: 0, borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}
                >
                  <Trash2 size={14} />
                  تعطيل
                </button>
              </span>
            </div>
          ))
        )}
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '15px 22px', background: '#FEFCE8', borderBottom: '1px solid #FCD34D', fontSize: '13px', fontWeight: 800, color: '#92400E' }}>
            <span>البريد الإلكتروني</span>
            <span>الدور</span>
            <span>الحالة</span>
          </div>
          {pendingInvites.map(invite => (
            <div key={invite.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '15px 22px', borderBottom: '1px solid #FCD34D', alignItems: 'center' }}>
              <span style={{ fontSize: '13.5px', color: '#92400E', direction: 'ltr' }}>{invite.email}</span>
              <span style={{ fontSize: '13.5px', color: '#92400E' }}>
                {invite.role === 'company_admin' ? 'مدير' : 'محرر'}
              </span>
              <span style={{ background: '#FEFCE8', color: '#92400E', borderRadius: '7px', padding: '4px 12px', fontSize: '12.5px', fontWeight: 800 }}>
                معلقة
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
