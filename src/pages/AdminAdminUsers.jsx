import { useCallback, useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { SkeletonPage, SkeletonTable, SkeletonList } from '../components/Skeleton'
import { Card } from '../ui'
import { LIMITS } from '../lib/validate.js'

/**
 * /admin/admin-users — who works for Marsad.
 *
 * The screen held two invented administrators in useState and a form that took a
 * name, an email and a password and pushed a row onto the array. None of that
 * could ever have worked, in two separate ways. Clerk owns identity here — the
 * application has no password to set and no account to create — and
 * guard_user_insert refuses a row with role platform_admin from the application
 * regardless. A form asking for a password on a platform that does not hold
 * passwords is not an unfinished feature; it is a description of a different
 * product.
 *
 * What is actually possible, and is what this does: someone signs up normally,
 * and a platform administrator grants them a platform role. guard_user_privileges
 * allows exactly that, and allows it only to a platform administrator.
 */

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }
const COLS = '1.5fr 1.9fr 1.2fr 1fr 1.6fr'

const PLATFORM_ROLES = {
  platform_admin: { label: 'إدارة مرصد', bg: '#F0E5FF', c: '#7C3AED', note: 'صلاحية كاملة على المنصة' },
  reviewer:       { label: 'مراجع',      bg: '#FEF3C7', c: '#92400E', note: 'يراجع التقارير والشركات' },
}

export default function AdminAdminUsers() {
  const { user } = useUser()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState('')

  const [grantOpen, setGrantOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [grantRole, setGrantRole] = useState('reviewer')

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 4500) }

  const load = useCallback(async () => {
    try {
      setError('')
      const { data, error: e } = await getSupabase()
        .from('users')
        .select('id, email, first_name, last_name, role, status, last_login_at, created_at')
        .in('role', ['platform_admin', 'reviewer'])
        .order('role', { ascending: true })
        .order('created_at', { ascending: true })
      if (e) throw e
      setStaff(data || [])
    } catch (err) {
      setError(err.message || 'تعذّر تحميل مسؤولي المنصة')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const { connected, liveAt } = useLiveData(load, { tables: ['users'] })

  const admins = staff.filter((s) => s.role === 'platform_admin' && s.status === 'active')
  const fullName = (u) => `${u.first_name || ''} ${u.last_name || ''}`.trim() || '—'

  // Marsad must never be left without an administrator. The last active one can
  // be neither demoted nor suspended, and the check is on the loaded list rather
  // than on a count taken earlier, so it cannot go stale between renders.
  const isLastAdmin = (u) => u.role === 'platform_admin' && u.status === 'active' && admins.length <= 1

  const search = async (q) => {
    setQuery(q)
    if (q.trim().length < 3) { setResults([]); return }
    try {
      setSearching(true)
      const { data } = await getSupabase()
        .from('users')
        .select('id, email, first_name, last_name, role, tenants ( name )')
        .ilike('email', `%${q.trim()}%`)
        .not('role', 'in', '("platform_admin","reviewer")')
        .limit(8)
      setResults(data || [])
    } finally {
      setSearching(false)
    }
  }

  const write = async (id, patch, message) => {
    const { data, error: e } = await getSupabase().from('users').update(patch).eq('id', id).select('id, role, status')
    if (e) throw e
    // An UPDATE that RLS filters out returns no error and no rows, so the row
    // count is the only thing that says it happened.
    if (!data?.length) throw new Error('لم يُحفظ التغيير — تحقّق من صلاحيتك')
    await getSupabase().from('audit_logs').insert([{
      actor_id: user?.id, action: message, entity: 'user', entity_id: id,
      meta: JSON.stringify(patch), created_at: new Date().toISOString(),
    }])
  }

  const grant = async (target) => {
    try {
      setBusyId(target.id)
      await write(target.id, { role: grantRole }, 'platform_role_granted')
      setGrantOpen(false); setQuery(''); setResults([])
      await load()
      showToast(`✅ مُنح ${target.email} دور ${PLATFORM_ROLES[grantRole].label}`)
    } catch (err) {
      showToast(`❌ ${err.message}`)
    } finally { setBusyId(null) }
  }

  const revoke = async (u) => {
    if (isLastAdmin(u)) { showToast('❌ لا يمكن سحب الدور من آخر مدير نشط للمنصة'); return }
    try {
      setBusyId(u.id)
      // Back to an ordinary account. Tenant membership is untouched — moving
      // someone between companies is refused by the database anyway.
      await write(u.id, { role: 'company_member' }, 'platform_role_revoked')
      await load()
      showToast('تم سحب دور المنصة')
    } catch (err) {
      showToast(`❌ ${err.message}`)
    } finally { setBusyId(null) }
  }

  const setStatus = async (u, status) => {
    if (status !== 'active' && isLastAdmin(u)) { showToast('❌ لا يمكن إيقاف آخر مدير نشط للمنصة'); return }
    try {
      setBusyId(u.id)
      await write(u.id, { status }, status === 'active' ? 'admin_reactivated' : 'admin_suspended')
      await load()
      showToast(status === 'active' ? '✅ أُعيد التفعيل' : '✅ أُوقف الحساب')
    } catch (err) {
      showToast(`❌ ${err.message}`)
    } finally { setBusyId(null) }
  }

  if (loading) {
    return (
      <>
        <SkeletonPage stats={0} panels={0} />
        <SkeletonTable rows={7} cols={4} />
      </>
    )
  }

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 100, boxShadow: '0 8px 24px rgba(15,23,42,.25)', maxWidth: '460px', lineHeight: 1.8 }}>{toast}</div>
      )}

      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px', textAlign: 'right' }}>مسؤولو المنصة</h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>{staff.length} حساباً يحمل دوراً على مستوى مرصد</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <LiveBadge connected={connected} liveAt={liveAt} />
          <button onClick={() => { setGrantOpen((v) => !v); setQuery(''); setResults([]) }} style={{ background: grantOpen ? '#F1F5F9' : '#1E2A52', color: grantOpen ? '#334155' : '#fff', border: 0, borderRadius: '10px', padding: '11px 22px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            {grantOpen ? 'إلغاء' : '+ منح دور'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#B91C1C', fontSize: '14px', fontWeight: 700 }}>⚠️ {error}</div>
      )}

      {grantOpen && (
        <Card style={{ padding: '22px', marginBottom: '18px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px', textAlign: 'right' }}>منح دور على مستوى المنصة</h2>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px', fontWeight: 600, textAlign: 'right', lineHeight: 1.9 }}>
            الحسابات تُنشأ بالتسجيل العادي — مرصد لا يحتفظ بكلمات المرور. ابحث عن حساب قائم بالبريد ثم امنحه الدور.
          </p>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <input maxLength={LIMITS.search} value={query} onChange={(e) => search(e.target.value)} placeholder="البريد الإلكتروني (٣ أحرف على الأقل)…" style={{ flex: '1 1 280px', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 14px', fontSize: '14px', outline: 'none', fontFamily: 'inherit', textAlign: 'right' }} />
            <select value={grantRole} onChange={(e) => setGrantRole(e.target.value)} style={{ border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 14px', fontSize: '14px', outline: 'none', fontFamily: 'inherit', background: '#fff' }}>
              {Object.entries(PLATFORM_ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          <p style={{ fontSize: '12.5px', color: '#64748B', margin: '0 0 12px', fontWeight: 600, textAlign: 'right' }}>{PLATFORM_ROLES[grantRole].note}</p>

          {searching && <SkeletonList rows={2} />}
          {results.map((r) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '12px 14px', border: '1px solid #E2E8F0', borderRadius: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{`${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email}</div>
                <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>{r.email}{r.tenants?.name ? ` · ${r.tenants.name}` : ''}</div>
              </div>
              <button onClick={() => grant(r)} disabled={busyId === r.id} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '9px', padding: '9px 18px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>منح الدور</button>
            </div>
          ))}
          {query.trim().length >= 3 && !searching && results.length === 0 && (
            <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600, textAlign: 'right' }}>لا حساب مطابق — أو أنه يحمل دوراً على المنصة بالفعل.</div>
          )}
        </Card>
      )}

      <Card style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '14px 18px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B', textAlign: 'right' }}>
          <span>الاسم</span><span>البريد</span><span>الدور</span><span>الحالة</span><span>الإجراءات</span>
        </div>

        {staff.length === 0 ? (
          <div style={{ padding: '44px', textAlign: 'center', color: '#64748B', fontSize: '14px', fontWeight: 600 }}>لا يوجد مسؤولون</div>
        ) : staff.map((u) => {
          const r = PLATFORM_ROLES[u.role]
          const last = isLastAdmin(u)
          const isSelf = u.id === user?.id
          return (
            <div key={u.id} style={{ display: 'grid', gridTemplateColumns: COLS, padding: '14px 18px', borderBottom: '1px solid #F1F5F9', alignItems: 'center', textAlign: 'right', opacity: busyId === u.id ? 0.55 : 1 }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{fullName(u)}{isSelf ? ' (أنت)' : ''}</span>
              <span style={{ fontSize: '13px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</span>
              <span><span style={{ fontSize: '12.5px', fontWeight: 700, background: r.bg, color: r.c, padding: '4px 10px', borderRadius: '6px' }}>{r.label}</span></span>
              <span>
                <span style={{ background: u.status === 'active' ? '#ECFDF5' : '#FEE2E2', color: u.status === 'active' ? '#15803D' : '#DC2626', borderRadius: '7px', padding: '4px 11px', fontSize: '12.5px', fontWeight: 800 }}>
                  {u.status === 'active' ? 'نشط' : 'موقوف'}
                </span>
              </span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {u.status === 'active' ? (
                  <button onClick={() => setStatus(u, 'inactive')} disabled={busyId === u.id || last} title={last ? 'آخر مدير نشط' : ''} style={{ background: last ? '#F1F5F9' : '#FEE2E2', color: last ? '#94A3B8' : '#B91C1C', border: 0, borderRadius: '8px', padding: '7px 13px', fontSize: '12.5px', fontWeight: 800, cursor: last ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>إيقاف</button>
                ) : (
                  <button onClick={() => setStatus(u, 'active')} disabled={busyId === u.id} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '8px', padding: '7px 13px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>تفعيل</button>
                )}
                <button onClick={() => revoke(u)} disabled={busyId === u.id || last} title={last ? 'آخر مدير نشط' : ''} style={{ background: '#fff', color: last ? '#CBD5E1' : '#334155', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '7px 13px', fontSize: '12.5px', fontWeight: 800, cursor: last ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>سحب الدور</button>
              </div>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
