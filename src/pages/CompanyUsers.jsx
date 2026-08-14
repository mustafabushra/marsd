import { useCallback, useState, useEffect } from 'react'
import { useUser, useAuth } from '@clerk/react'
import { UserPlus, Trash2, RotateCcw } from 'lucide-react'
import { getSupabase } from '../lib/api'
import { useEntitlements } from '../hooks/useEntitlements'
import { UNLIMITED } from '../lib/entitlements'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { SkeletonPage, SkeletonTable } from '../components/Skeleton'
import { LIMITS } from '../lib/validate.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLE_LABEL = { company_admin: 'مدير', company_member: 'محرّر' }
const USERS_GRID = '1.6fr 2fr 1.15fr 0.85fr 1.05fr 1.25fr'
const INVITES_GRID = '2fr 1fr 1fr 1.4fr'

// Shared inline-style fragments — the page styles inline throughout; these just
// keep the repeated values in one place.
const S = {
  card: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' },
  headRow: { background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B' },
  badge: (bg, fg) => ({ background: bg, color: fg, borderRadius: '7px', padding: '4px 12px', fontSize: '12.5px', fontWeight: 800, whiteSpace: 'nowrap' }),
  btn: (bg, fg, border) => ({ background: bg, color: fg, border: border || 0, borderRadius: '7px', padding: '6px 10px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit' }),
  input: { border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', outline: 'none', fontFamily: 'inherit', background: '#fff' },
}

const isExpired = (invite) => !!invite.expires_at && new Date(invite.expires_at) < new Date()

export default function CompanyUsers() {
  const { isLoaded: isUserLoaded, user } = useUser()
  const { getToken } = useAuth()
  const { entitlements, limitOf } = useEntitlements()
  const [users, setUsers] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  // People asking to be let in. The mirror of an invite: an invite is the
  // company reaching out, this is somebody knocking — and until now nobody
  // could hear it.
  const [joinRequests, setJoinRequests] = useState([])
  const [joinBusy, setJoinBusy] = useState('')
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

  // A company must never be able to lock itself out: the last *active* admin
  // can be neither demoted nor deactivated.
  const activeAdmins = users.filter((u) => u.rawRole === 'company_admin' && u.active)
  const isLastActiveAdmin = (u) => u.rawRole === 'company_admin' && u.active && activeAdmins.length <= 1

  // `loading` starts true and only loadUsers clears it, so gating the effect on
  // user?.id alone left the page on "جاري التحميل..." indefinitely whenever the
  // session resolved without a user. Wait for Clerk, then always settle.
  useEffect(() => {
    if (!isUserLoaded) return
    if (user?.id) {
      loadUsers()
    } else {
      setError('انتهت الجلسة — أعد تسجيل الدخول')
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoaded, user?.id])

  const loadUsers = useCallback(async () => {
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
      // A platform administrator administers companies too — checking only for
      // company_admin locked whoever runs Marsad out of the screen that manages
      // members of the company they belong to.
      const myRole = rows.find((u) => u.id === user.id)?.role
      setIsAdmin(myRole === 'company_admin' || myRole === 'platform_admin')
      setUsers(rows.map((u) => ({
        id: u.id,
        name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'مستخدم',
        email: u.email,
        rawRole: u.role,
        role: ROLE_LABEL[u.role] || u.role,
        active: u.status === 'active',
        isSelf: u.id === user.id,
        lastLogin: u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('en-GB') : 'لم يسجّل دخول',
      })))

      // Expiry is shown, not filtered out — a silently vanished invite looks
      // like the invite was never sent.
      const { data: invites } = await supabase
        .from('pending_invites')
        .select('id, email, role, status, created_at, expires_at')
        .eq('tenant_id', me.tenant_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      setPendingInvites(invites || [])

      const { data: joins } = await supabase.rpc('company_join_requests')
      setJoinRequests(Array.isArray(joins) ? joins.filter((j) => j.status === 'pending') : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  // Seats change from three directions: an invitation accepted, a colleague
  // deactivated by another admin, and the platform changing what the plan allows.
  const { connected, liveAt } = useLiveData(loadUsers, {
    tables: ['users', 'pending_invites'],
    enabled: !!user?.id,
  })

  const writeAudit = async (entry) => {
    try {
      const supabase = getSupabase()
      await supabase.from('audit_logs').insert([{
        tenant_id: tenantId,
        actor_id: user.id,
        entity: 'user',
        created_at: new Date().toISOString(),
        ...entry,
      }])
    } catch {
      // Auditing must never block the operation the admin actually asked for.
    }
  }

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase()
    setError('')
    if (!email) { setError('أدخل البريد الإلكتروني'); return }
    if (!EMAIL_RE.test(email)) { setError('صيغة البريد الإلكتروني غير صحيحة'); return }
    if (users.some((u) => (u.email || '').toLowerCase() === email)) { setError('هذا البريد مسجّل بالفعل ضمن مستخدمي الشركة'); return }
    if (pendingInvites.some((i) => (i.email || '').toLowerCase() === email)) { setError('توجد دعوة معلّقة لهذا البريد بالفعل — استخدم "إعادة إرسال"'); return }

    // Seats are counted before the invitation goes out, and pending invitations
    // count against them: an invitation is a seat already promised, and letting
    // a company invite past its plan on the grounds that nobody has accepted yet
    // would put it over the moment they did.
    const seats = limitOf('users')
    if (seats !== UNLIMITED && !entitlements?.degraded && !entitlements?.enforcementDisabled) {
      const taken = users.length + pendingInvites.length
      if (taken >= seats) {
        setError(
          `باقتك تتيح ${seats} ${seats === 2 ? 'مستخدمَين' : 'مستخدمين'}، ` +
          `ولديك ${users.length} مستخدماً${pendingInvites.length ? ` و${pendingInvites.length} دعوة معلّقة` : ''}. ` +
          'ألغِ دعوة معلّقة أو عطّل مستخدماً، أو رقّ باقتك لمقاعد أكثر.',
        )
        return
      }
    }

    setSubmitting(true)
    try {
      if (!tenantId) throw new Error('لم يتم العثور على شركة مرتبطة بحسابك')

      // Prefer the server endpoint, which sends a real Clerk invitation email.
      const server = await callServerInvite(email, inviteRole)
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
        await writeAudit({ action: 'user_invited', meta: { email, role: inviteRole, delivery: 'record_only' } })
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

  const resendInvite = async (invite) => {
    if (!window.confirm(`إعادة إرسال الدعوة إلى ${invite.email}؟ ستُجدَّد صلاحيتها 7 أيام.`)) return
    setBusyId(invite.id)
    try {
      const server = await callServerInvite(invite.email, invite.role, true)
      if (server.error) { showToast(`❌ ${server.error}`); return }

      if (server.emailSent) {
        await loadUsers()
        showToast(`✅ أُعيد إرسال الدعوة إلى ${invite.email}`)
        return
      }

      // No server: at least refresh the expiry so the invite stops reading as dead.
      const supabase = getSupabase()
      const { error: e } = await supabase
        .from('pending_invites')
        .update({ expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
        .eq('id', invite.id)
      if (e) throw e
      await writeAudit({ action: 'user_invite_resent', entity_id: invite.id, meta: { email: invite.email, delivery: 'record_only' } })
      await loadUsers()
      showToast('✅ جُدِّدت صلاحية الدعوة (الإرسال بالبريد يحتاج نشر الخادم)')
    } catch (err) {
      showToast('❌ تعذّرت إعادة الإرسال: ' + (err?.message || ''))
    } finally {
      setBusyId(null)
    }
  }

  // Calls /api/invite-user. Distinguishes a real business error (JSON 4xx from
  // our function) from the endpoint simply not being deployed (network error or
  // the SPA fallback serving index.html), so we only fall back in the latter.
  const callServerInvite = async (email, role, resend = false) => {
    let token
    try { token = await getToken() } catch { token = null }
    if (!token) return { emailSent: false }
    let resp
    try {
      resp = await fetch('/api/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, role, resend }),
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
    if (!window.confirm(`إلغاء الدعوة لـ ${invite.email}؟`)) return
    try {
      setBusyId(invite.id)
      const supabase = getSupabase()
      const { error: e } = await supabase.from('pending_invites').delete().eq('id', invite.id)
      if (e) throw e
      await writeAudit({ action: 'user_invite_cancelled', entity_id: invite.id, meta: { email: invite.email, role: invite.role } })
      setPendingInvites((prev) => prev.filter((i) => i.id !== invite.id))
      showToast('تم إلغاء الدعوة')
    } catch {
      showToast('❌ تعذّر إلغاء الدعوة')
    } finally { setBusyId(null) }
  }

  const changeRole = async (u, nextRole) => {
    if (nextRole === u.rawRole) return
    if (nextRole === 'company_member' && isLastActiveAdmin(u)) {
      showToast('❌ لا يمكن تخفيض آخر مدير نشط — عيّن مديراً آخر أولاً')
      return
    }
    const warning = u.isSelf && nextRole === 'company_member'
      ? `\n\n⚠️ أنت تخفّض حسابك — ستفقد صلاحيات إدارة المستخدمين فوراً.`
      : ''
    if (!window.confirm(`تغيير دور ${u.name} من "${ROLE_LABEL[u.rawRole]}" إلى "${ROLE_LABEL[nextRole]}"؟${warning}`)) return

    try {
      setBusyId(u.id)
      const supabase = getSupabase()
      const { error: e } = await supabase.from('users').update({ role: nextRole }).eq('id', u.id)
      if (e) throw e
      await writeAudit({ action: 'user_role_changed', entity_id: u.id, meta: { email: u.email, from: u.rawRole, to: nextRole } })
      await loadUsers()
      showToast(`تم تغيير دور ${u.name} إلى ${ROLE_LABEL[nextRole]}`)
    } catch (err) {
      showToast('❌ تعذّر تغيير الدور: ' + (err?.message || ''))
    } finally { setBusyId(null) }
  }

  const setUserActive = async (u, active) => {
    if (u.isSelf && !active) { showToast('لا يمكنك تعطيل حسابك'); return }
    if (!active && isLastActiveAdmin(u)) {
      showToast('❌ لا يمكن تعطيل آخر مدير نشط — عيّن مديراً آخر أولاً')
      return
    }
    if (!window.confirm(active ? `إعادة تفعيل ${u.name}؟` : `تعطيل ${u.name}؟`)) return
    try {
      setBusyId(u.id)
      const supabase = getSupabase()
      const { error: e } = await supabase.from('users').update({ status: active ? 'active' : 'inactive' }).eq('id', u.id)
      if (e) throw e
      await writeAudit({ action: active ? 'user_reactivated' : 'user_deactivated', entity_id: u.id, meta: { email: u.email } })
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, active } : x)))
      showToast(active ? 'تم تفعيل المستخدم' : 'تم تعطيل المستخدم')
    } catch (err) {
      showToast('❌ تعذّر تغيير الحالة: ' + (err?.message || ''))
    } finally { setBusyId(null) }
  }

  const decideJoin = async (id, approve, role) => {
    try {
      setJoinBusy(id)
      const { error: e } = await getSupabase().rpc('decide_join_request', {
        p_request_id: id, p_approve: approve, p_role: role || 'company_member', p_note: null,
      })
      if (e) throw e
      await loadUsers()
    } catch (err) {
      setError(err.message || 'تعذّر حفظ القرار')
    } finally { setJoinBusy('') }
  }

  if (loading) {
    return (
      <>
        <SkeletonPage stats={0} panels={0} />
        <SkeletonTable rows={7} cols={4} />
      </>
    )
  }

  const expiredCount = pendingInvites.filter(isExpired).length

  return (
    <div>
      {toast && <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 120, boxShadow: '0 8px 24px rgba(15,23,42,.25)', maxWidth: '420px' }}>{toast}</div>}

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '13px 16px', marginBottom: '16px', color: '#B91C1C', fontSize: '14px', fontWeight: 700 }}>⚠️ {error}</div>
      )}

      {/* Somebody asking to be let in.
          Above the roster on purpose: a request nobody sees is a person
          waiting, and this is the only screen where it can be answered. */}
      {isAdmin && joinRequests.length > 0 && (
        <div style={{
          background: '#fff', border: '1.5px solid #FDE68A', borderRadius: '14px',
          padding: '18px', marginBottom: '18px',
        }}>
          <h2 style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }}>
            طلبات انضمام ({joinRequests.length})
          </h2>
          <p style={{ fontSize: '12.5px', color: '#64748B', margin: '0 0 14px', lineHeight: 1.9 }}>
            أشخاص يطلبون الانضمام إلى شركتك. القرار لك — وبقبولهم يصبحون أعضاء فوراً.
          </p>
          {joinRequests.map((j, i) => (
            <div key={j.id} style={{
              borderTop: i ? '1px solid #F1F5F9' : 0, padding: '13px 0',
              display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
            }}>
              <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
                  {j.user_name || j.user_email || '—'}
                </div>
                {j.user_name && j.user_email && (
                  <div style={{ fontSize: '12.5px', color: '#64748B' }}>{j.user_email}</div>
                )}
                {j.message && (
                  <div style={{ fontSize: '12.5px', color: '#334155', marginTop: '4px', lineHeight: 1.9 }}>
                    «{j.message}»
                  </div>
                )}
                <div style={{ fontSize: '11.5px', color: '#94A3B8', marginTop: '3px' }}>
                  {new Date(j.created_at).toLocaleDateString('ar-SA')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <button onClick={() => decideJoin(j.id, true, 'company_member')} disabled={joinBusy === j.id}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', border: 0,
                    background: joinBusy === j.id ? '#86EFAC' : '#16A34A', color: '#fff',
                    fontSize: '12.5px', fontWeight: 800,
                    cursor: joinBusy === j.id ? 'default' : 'pointer', fontFamily: 'inherit',
                  }}>قبول كعضو</button>
                <button onClick={() => decideJoin(j.id, true, 'company_admin')} disabled={joinBusy === j.id}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', border: '1.5px solid #E2E8F0',
                    background: '#fff', color: '#1E2A52', fontSize: '12.5px', fontWeight: 800,
                    cursor: joinBusy === j.id ? 'default' : 'pointer', fontFamily: 'inherit',
                  }}>قبول كمسؤول</button>
                <button onClick={() => decideJoin(j.id, false)} disabled={joinBusy === j.id}
                  style={{
                    padding: '8px 16px', borderRadius: '8px', border: '1.5px solid #FECACA',
                    background: '#fff', color: '#B91C1C', fontSize: '12.5px', fontWeight: 800,
                    cursor: joinBusy === j.id ? 'default' : 'pointer', fontFamily: 'inherit',
                  }}>رفض</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: 0 }}>المستخدمون ({users.length})</h2>
          <LiveBadge connected={connected} liveAt={liveAt} />
          {pendingInvites.length > 0 && (
            <span style={S.badge('#FEF3C7', '#92400E')}>{pendingInvites.length} دعوة معلّقة</span>
          )}
          {expiredCount > 0 && (
            <span style={S.badge('#FEE2E2', '#B91C1C')}>{expiredCount} منتهية</span>
          )}
        </div>
        {isAdmin && (
          <button onClick={() => { setShowInviteForm((v) => !v); setError('') }} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '10px 20px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'inherit' }}>
            <UserPlus size={16} /> دعوة مستخدم
          </button>
        )}
      </div>

      {!isAdmin && (
        <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '12px', padding: '13px 16px', marginBottom: '16px', fontSize: '13.5px', color: '#3730A3', fontWeight: 700 }}>ℹ إدارة المستخدمين (الدعوة وتغيير الأدوار والتعطيل) متاحة لمدير الشركة فقط. يمكنك عرض القائمة.</div>
      )}

      {isAdmin && activeAdmins.length <= 1 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '13px 16px', marginBottom: '16px', fontSize: '13.5px', color: '#92400E', fontWeight: 700 }}>
          ⚠️ يوجد مدير نشط واحد فقط. لحماية الشركة من فقدان الوصول، لا يمكن تخفيض دوره أو تعطيله حتى تعيّن مديراً آخر.
        </div>
      )}

      {isAdmin && showInviteForm && (
        <div style={{ ...S.card, borderRadius: '12px', padding: '16px', marginBottom: '18px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input maxLength={LIMITS.email} type="email" placeholder="البريد الإلكتروني" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleInvite()} style={{ ...S.input, flex: 1, minWidth: '200px', direction: 'ltr', textAlign: 'left' }} />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={S.input}>
            <option value="company_member">محرّر</option>
            <option value="company_admin">مدير</option>
          </select>
          <button onClick={handleInvite} disabled={submitting} style={{ background: submitting ? '#94A3B8' : '#16A34A', color: '#fff', border: 0, borderRadius: '8px', padding: '10px 18px', fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{submitting ? 'جارٍ…' : 'إرسال الدعوة'}</button>
          <button onClick={() => { setShowInviteForm(false); setError('') }} style={{ background: '#F1F5F9', color: '#64748B', border: 0, borderRadius: '8px', padding: '10px 18px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
        </div>
      )}

      {/* Current users */}
      <div style={{ ...S.card, overflowX: 'auto', marginBottom: '20px' }}>
        <div style={{ minWidth: '760px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: USERS_GRID, padding: '15px 22px', ...S.headRow }}>
            <span>الاسم</span><span>البريد الإلكتروني</span><span>الدور</span><span>الحالة</span><span>آخر دخول</span><span>{isAdmin ? 'الإجراءات' : ''}</span>
          </div>
          {users.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontSize: '14px' }}>لا يوجد مستخدمون بعد</div>
          ) : users.map((u) => {
            const roleLocked = isLastActiveAdmin(u)
            return (
              <div key={u.id} style={{ display: 'grid', gridTemplateColumns: USERS_GRID, padding: '14px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14.5px', fontWeight: 700, color: '#0F172A' }}>{u.name}{u.isSelf && <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}> (أنت)</span>}</span>
                <span style={{ fontSize: '13.5px', color: '#64748B', direction: 'ltr', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</span>
                <span>
                  {isAdmin ? (
                    <select
                      value={u.rawRole}
                      disabled={busyId === u.id || roleLocked}
                      title={roleLocked ? 'آخر مدير نشط — لا يمكن تغيير دوره' : 'تغيير الدور'}
                      onChange={(e) => changeRole(u, e.target.value)}
                      style={{ ...S.input, padding: '6px 8px', fontSize: '13px', fontWeight: 700, color: '#334155', cursor: roleLocked ? 'not-allowed' : 'pointer', opacity: roleLocked ? 0.6 : 1, width: '100%' }}
                    >
                      <option value="company_member">محرّر</option>
                      <option value="company_admin">مدير</option>
                    </select>
                  ) : (
                    <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 700 }}>{u.role}</span>
                  )}
                </span>
                <span><span style={S.badge(u.active ? '#ECFDF5' : '#FEE2E2', u.active ? '#15803D' : '#B91C1C')}>{u.active ? 'نشط' : 'معطّل'}</span></span>
                <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>{u.lastLogin}</span>
                <span style={{ display: 'flex', gap: '8px' }}>
                  {isAdmin && !u.isSelf && (
                    u.active ? (
                      <button onClick={() => setUserActive(u, false)} disabled={busyId === u.id || roleLocked} title={roleLocked ? 'آخر مدير نشط — لا يمكن تعطيله' : 'تعطيل'} style={{ ...S.btn('#FEF2F2', '#B91C1C', '1px solid #FECACA'), cursor: roleLocked ? 'not-allowed' : 'pointer', opacity: roleLocked ? 0.5 : 1 }}><Trash2 size={13} /> تعطيل</button>
                    ) : (
                      <button onClick={() => setUserActive(u, true)} disabled={busyId === u.id} title="تفعيل" style={S.btn('#F0FDF4', '#15803D', '1px solid #BBF7D0')}><RotateCcw size={13} /> تفعيل</button>
                    )
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <div style={{ ...S.card, border: '1px solid #FDE68A', overflowX: 'auto' }}>
          <div style={{ minWidth: '620px' }}>
            <div style={{ padding: '14px 22px', background: '#FFFBEB', borderBottom: '1px solid #FDE68A', fontSize: '14px', fontWeight: 900, color: '#92400E' }}>الدعوات المعلّقة</div>
            <div style={{ display: 'grid', gridTemplateColumns: INVITES_GRID, padding: '12px 22px', background: '#FEFCE8', borderBottom: '1px solid #FDE68A', fontSize: '12.5px', fontWeight: 800, color: '#92400E' }}>
              <span>البريد الإلكتروني</span><span>الدور</span><span>الحالة</span><span>{isAdmin ? 'إجراء' : ''}</span>
            </div>
            {pendingInvites.map((invite) => {
              const expired = isExpired(invite)
              return (
                <div key={invite.id} style={{ display: 'grid', gridTemplateColumns: INVITES_GRID, padding: '13px 22px', borderBottom: '1px solid #FEF3C7', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13.5px', color: '#334155', direction: 'ltr', textAlign: 'right' }}>{invite.email}</span>
                  <span style={{ fontSize: '13.5px', color: '#334155', fontWeight: 700 }}>{ROLE_LABEL[invite.role] || invite.role}</span>
                  <span>
                    <span style={expired ? S.badge('#FEE2E2', '#B91C1C') : S.badge('#FEF3C7', '#92400E')}>{expired ? 'منتهية' : 'معلّقة'}</span>
                  </span>
                  <span style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {isAdmin && (
                      <>
                        <button onClick={() => resendInvite(invite)} disabled={busyId === invite.id} title="إعادة إرسال الدعوة" style={S.btn('#F0FDF4', '#15803D', '1px solid #BBF7D0')}><RotateCcw size={13} /> إعادة إرسال</button>
                        <button onClick={() => cancelInvite(invite)} disabled={busyId === invite.id} style={S.btn('#fff', '#B91C1C', '1px solid #FECACA')}>إلغاء</button>
                      </>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
