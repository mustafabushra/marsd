import { useState, useEffect } from 'react'
import { useUser, useAuth } from '@clerk/react'
import { UserPlus, Trash2, RotateCcw } from 'lucide-react'
import { getSupabase } from '../lib/api'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function CompanyUsers() {
  const { user } = useUser()
  const { getToken } = useAuth()
  const [users, setUsers] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [tenantId, setTenantId] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('company_member')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState('')

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  useEffect(() => { if (user?.id) loadUsers() }, [user?.id])

  const loadUsers = async () => {
    try {
      setError('')
      const supabase = getSupabase()
      if (!user?.id) throw new Error('يجب تسجيل الدخول')

      const { data: me } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!me?.tenant_id) throw new Error('لم يتم العثور على شركة مرتبطة بحسابك')
      setTenantId(me.tenant_id)

      const { data: companyUsers } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, role, status, last_login_at')
        .eq('tenant_id', me.tenant_id)
        .order('created_at', { ascending: true })

      const rows = companyUsers || []
      setIsAdmin(rows.find((u) => u.id === user.id)?.role === 'company_admin')
      setUsers(rows.map((u) => ({
        id: u.id,
        name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'مستخدم',
        email: u.email,
        rawRole: u.role,
        role: u.role === 'company_admin' ? 'مدير' : 'محرر',
        active: u.status === 'active',
        isSelf: u.id === user.id,
        lastLogin: u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('en-GB') : 'لم يسجّل دخول',
      })))

      const { data: invites } = await supabase
        .from('pending_invites')
        .select('id, email, role, status, created_at')
        .eq('tenant_id', me.tenant_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      setPendingInvites(invites || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase()
    setError('')
    if (!email) { setError('أدخل البريد الإلكتروني'); return }
    if (!EMAIL_RE.test(email)) { setError('صيغة البريد الإلكتروني غير صحيحة'); return }
    if (users.some((u) => (u.email || '').toLowerCase() === email)) { setError('هذا البريد مسجّل بالفعل ضمن مستخدمي الشركة'); return }
    if (pendingInvites.some((i) => (i.email || '').toLowerCase() === email)) { setError('توجد دعوة معلّقة لهذا البريد بالفعل'); return }

    setSubmitting(true)
    try {
      if (!tenantId) throw new Error('لم يتم العثور على شركة مرتبطة بحسابك')

      // Prefer the server endpoint, which sends a real Clerk invitation email.
      const server = await tryServerInvite(email, inviteRole)
      if (server.error) { setError(server.error); return }

      if (!server.emailSent) {
        // Endpoint not deployed yet: fall back to recording the invite only,
        // so the feature degrades gracefully (no email until the server is up).
        const supabase = getSupabase()
        const { error: invErr } = await supabase.from('pending_invites').insert([{
          tenant_id: tenantId,
          email,
          role: inviteRole,
          invited_by: user.id,
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }])
        if (invErr) throw invErr
        await supabase.from('audit_logs').insert([{
          tenant_id: tenantId, actor_id: user.id, action: 'user_invited', entity: 'user',
          meta: { email, role: inviteRole, delivery: 'record_only' }, created_at: new Date().toISOString(),
        }])
      }

      setInviteEmail('')
      setInviteRole('company_member')
      setShowInviteForm(false)
      await loadUsers()
      showToast(server.emailSent
        ? `✅ تم إرسال الدعوة بالبريد إلى ${email}`
        : `✅ تم إنشاء الدعوة لـ ${email} (سيبدأ الإرسال بالبريد بعد نشر الخادم)`)
    } catch (err) {
      setError(err.message || 'تعذّر إنشاء الدعوة')
    } finally {
      setSubmitting(false)
    }
  }

  // Calls /api/invite-user. Distinguishes a real business error (JSON 4xx from
  // our function) from the endpoint simply not being deployed (network error or
  // the SPA fallback serving index.html), so we only fall back in the latter.
  const tryServerInvite = async (email, role) => {
    let token
    try { token = await getToken() } catch { token = null }
    if (!token) return { emailSent: false }
    let resp
    try {
      resp = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, role }),
      })
    } catch { return { emailSent: false } }
    const ct = resp.headers.get('content-type') || ''
    if (!ct.includes('application/json')) return { emailSent: false }
    const data = await resp.json().catch(() => null)
    if (!data) return { emailSent: false }
    if (resp.ok && data.emailSent) return { emailSent: true }
    return { error: data.error || 'تعذّر إرسال الدعوة' }
  }

  const cancelInvite = async (invite) => {
    if (!window.confirm(`إلغاء الدعوة المعلّقة لـ ${invite.email}؟`)) return
    try {
      setBusyId(invite.id)
      const supabase = getSupabase()
      const { error: e } = await supabase.from('pending_invites').delete().eq('id', invite.id)
      if (e) throw e
      setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id))
      showToast('تم إلغاء الدعوة')
    } catch (err) {
      showToast('❌ تعذّر إلغاء الدعوة')
    } finally { setBusyId(null) }
  }

  const setUserActive = async (u, active) => {
    if (u.isSelf && !active) { showToast('لا يمكنك تعطيل حسابك'); return }
    if (!window.confirm(active ? `إعادة تفعيل ${u.name}؟` : `تعطيل ${u.name}؟`)) return
    try {
      setBusyId(u.id)
      const supabase = getSupabase()
      const { error: e } = await supabase.from('users').update({ status: active ? 'active' : 'inactive' }).eq('id', u.id)
      if (e) throw e
      await supabase.from('audit_logs').insert([{
        tenant_id: tenantId, actor_id: user.id, action: active ? 'user_reactivated' : 'user_deactivated',
        entity: 'user', entity_id: u.id, created_at: new Date().toISOString(),
      }])
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, active } : x)))
      showToast(active ? 'تم تفعيل المستخدم' : 'تم تعطيل المستخدم')
    } catch (err) {
      showToast('❌ تعذّر تغيير الحالة: ' + (err?.message || ''))
    } finally { setBusyId(null) }
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: '#64748B', fontWeight: 600 }}>جاري التحميل...</div>
  }

  return (
    <div>
      {toast && <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 120, boxShadow: '0 8px 24px rgba(15,23,42,.25)' }}>{toast}</div>}

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '13px 16px', marginBottom: '16px', color: '#B91C1C', fontSize: '14px', fontWeight: 700 }}>⚠️ {error}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h3 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: 0 }}>المستخدمون ({users.length})</h3>
          {pendingInvites.length > 0 && (
            <span style={{ background: '#FEF3C7', color: '#92400E', borderRadius: '999px', padding: '6px 14px', fontSize: '13px', fontWeight: 800 }}>{pendingInvites.length} دعوة معلّقة</span>
          )}
        </div>
        {isAdmin && (
          <button onClick={() => { setShowInviteForm((v) => !v); setError('') }} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '10px 20px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'inherit' }}>
            <UserPlus size={16} /> دعوة مستخدم
          </button>
        )}
      </div>

      {!isAdmin && (
        <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '12px', padding: '13px 16px', marginBottom: '16px', fontSize: '13.5px', color: '#3730A3', fontWeight: 700 }}>ℹ إدارة المستخدمين (الدعوة والتعطيل) متاحة لمدير الشركة فقط. يمكنك عرض القائمة.</div>
      )}

      {isAdmin && showInviteForm && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', marginBottom: '18px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input type="email" placeholder="البريد الإلكتروني" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleInvite()} style={{ flex: 1, minWidth: '200px', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', outline: 'none', direction: 'ltr', textAlign: 'left', fontFamily: 'inherit' }} />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', outline: 'none', fontFamily: 'inherit', background: '#fff' }}>
            <option value="company_member">محرّر</option>
            <option value="company_admin">مدير</option>
          </select>
          <button onClick={handleInvite} disabled={submitting} style={{ background: submitting ? '#94A3B8' : '#16A34A', color: '#fff', border: 0, borderRadius: '8px', padding: '10px 18px', fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{submitting ? 'جارٍ…' : 'إرسال الدعوة'}</button>
          <button onClick={() => { setShowInviteForm(false); setError('') }} style={{ background: '#F1F5F9', color: '#64748B', border: 0, borderRadius: '8px', padding: '10px 18px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
        </div>
      )}

      {/* Current users */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflowX: 'auto', marginBottom: '20px' }}>
        <div style={{ minWidth: '640px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 2fr 0.9fr 0.9fr 1.1fr 1fr', padding: '15px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B' }}>
            <span>الاسم</span><span>البريد الإلكتروني</span><span>الدور</span><span>الحالة</span><span>آخر دخول</span><span>{isAdmin ? 'الإجراءات' : ''}</span>
          </div>
          {users.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8', fontSize: '14px' }}>لا يوجد مستخدمون بعد</div>
          ) : users.map((u) => (
            <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '1.7fr 2fr 0.9fr 0.9fr 1.1fr 1fr', padding: '14px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center' }}>
              <span style={{ fontSize: '14.5px', fontWeight: 700, color: '#0F172A' }}>{u.name}{u.isSelf && <span style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 600 }}> (أنت)</span>}</span>
              <span style={{ fontSize: '13.5px', color: '#64748B', direction: 'ltr', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</span>
              <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 700 }}>{u.role}</span>
              <span><span style={{ background: u.active ? '#ECFDF5' : '#FEE2E2', color: u.active ? '#15803D' : '#B91C1C', borderRadius: '7px', padding: '4px 12px', fontSize: '12.5px', fontWeight: 800 }}>{u.active ? 'نشط' : 'معطّل'}</span></span>
              <span style={{ fontSize: '12.5px', color: '#94A3B8', fontWeight: 600 }}>{u.lastLogin}</span>
              <span style={{ display: 'flex', gap: '8px' }}>
                {isAdmin && !u.isSelf && (
                  u.active ? (
                    <button onClick={() => setUserActive(u, false)} disabled={busyId === u.id} title="تعطيل" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: '7px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700, fontFamily: 'inherit' }}><Trash2 size={13} /> تعطيل</button>
                  ) : (
                    <button onClick={() => setUserActive(u, true)} disabled={busyId === u.id} title="تفعيل" style={{ background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', borderRadius: '7px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700, fontFamily: 'inherit' }}><RotateCcw size={13} /> تفعيل</button>
                  )
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #FDE68A', borderRadius: '16px', overflowX: 'auto' }}>
          <div style={{ minWidth: '520px' }}>
            <div style={{ padding: '14px 22px', background: '#FFFBEB', borderBottom: '1px solid #FDE68A', fontSize: '14px', fontWeight: 900, color: '#92400E' }}>الدعوات المعلّقة</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '12px 22px', background: '#FEFCE8', borderBottom: '1px solid #FDE68A', fontSize: '12.5px', fontWeight: 800, color: '#92400E' }}>
              <span>البريد الإلكتروني</span><span>الدور</span><span>الحالة</span><span>{isAdmin ? 'إجراء' : ''}</span>
            </div>
            {pendingInvites.map((invite) => (
              <div key={invite.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '13px 22px', borderBottom: '1px solid #FEF3C7', alignItems: 'center' }}>
                <span style={{ fontSize: '13.5px', color: '#334155', direction: 'ltr', textAlign: 'right' }}>{invite.email}</span>
                <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 700 }}>{invite.role === 'company_admin' ? 'مدير' : 'محرّر'}</span>
                <span><span style={{ background: '#FEF3C7', color: '#92400E', borderRadius: '7px', padding: '4px 11px', fontSize: '12px', fontWeight: 800 }}>معلّقة</span></span>
                <span>{isAdmin && (
                  <button onClick={() => cancelInvite(invite)} disabled={busyId === invite.id} style={{ background: '#fff', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: '7px', padding: '6px 12px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
                )}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
