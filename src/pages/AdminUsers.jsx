import { useCallback, useState, useEffect } from 'react'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { SkeletonPage, SkeletonTable } from '../components/Skeleton'
import { Card } from '../ui'
import { LIMITS } from '../lib/validate.js'

/**
 * /admin/users — every account on Marsad.
 *
 * The screen read real users and then labelled them from a vocabulary that does
 * not exist: it looked for 'admin' and 'manager' and fell through to "مشاهد" for
 * everything else, so every account on the platform was displayed as a viewer
 * regardless of what it actually was — the same dead role ladder that made every
 * permission in the app resolve to false. The company each user belongs to was
 * not shown at all, which on a multi-tenant platform is most of the question.
 *
 * The two buttons — "عرض" and the pagination numbers — had no onClick. Pressing
 * a page number did nothing, so anything past the first twenty accounts was
 * unreachable from here.
 */

const ROLE = {
  platform_admin: { label: 'إدارة مرصد', bg: '#F0E5FF', c: '#7C3AED' },
  company_admin:  { label: 'مدير شركة',  bg: '#E0F2FE', c: '#0369A1' },
  company_member: { label: 'عضو شركة',   bg: '#F1F5F9', c: '#475569' },
  reviewer:       { label: 'مراجع',      bg: '#FEF3C7', c: '#92400E' },
}

const STATUS = {
  active: { label: 'نشط', bg: '#ECFDF5', c: '#15803D' },
  inactive: { label: 'موقوف', bg: '#FEE2E2', c: '#DC2626' },
  pending_email_verification: { label: 'بانتظار تأكيد البريد', bg: '#FFFBEB', c: '#B45309' },
}

const PAGE_SIZE = 20
const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }
const COLS = '1.4fr 1.8fr 1.3fr 1fr 1fr 0.9fr'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [toast, setToast] = useState('')

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 4000) }

  const load = useCallback(async () => {
    try {
      setError('')
      let q = getSupabase()
        .from('users')
        .select('id, email, first_name, last_name, role, status, last_login_at, created_at, tenant_id, tenants ( id, name )',
          { count: 'exact' })

      if (roleFilter !== 'all') q = q.eq('role', roleFilter)
      if (query.trim()) q = q.or(`email.ilike.%${query.trim()}%,first_name.ilike.%${query.trim()}%,last_name.ilike.%${query.trim()}%`)

      const { data, count, error: e } = await q
        .order('created_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      if (e) throw e
      setUsers(data || [])
      setTotal(count || 0)
    } catch (err) {
      setError(err.message || 'تعذّر تحميل المستخدمين')
    } finally {
      setLoading(false)
    }
  }, [page, query, roleFilter])

  useEffect(() => { load() }, [load])

  const { connected, liveAt } = useLiveData(load, { tables: ['users', 'tenants'] })

  // Suspending an account is the one control on this screen that changes
  // anything, and it reads the row back: an UPDATE that RLS filters out returns
  // no error and no rows, so "no error" would not mean it happened.
  const setStatus = async (u, status) => {
    try {
      setBusyId(u.id)
      const { data, error: e } = await getSupabase()
        .from('users')
        .update({ status })
        .eq('id', u.id)
        .select('id, status')
      if (e) throw e
      if (!data?.length) throw new Error('لم يُحفظ التغيير')
      await load()
      showToast(status === 'active' ? '✅ أُعيد تفعيل الحساب' : '✅ أُوقف الحساب')
    } catch (err) {
      showToast(`❌ ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const fullName = (u) => `${u.first_name || ''} ${u.last_name || ''}`.trim() || '—'

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
        <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 100, boxShadow: '0 8px 24px rgba(15,23,42,.25)' }}>{toast}</div>
      )}

      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px', textAlign: 'right' }}>إدارة المستخدمين</h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>{total} حساباً على المنصة</p>
        </div>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#B91C1C', fontSize: '14px', fontWeight: 700 }}>⚠️ {error}</div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input maxLength={LIMITS.search}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1) }}
          placeholder="ابحث بالاسم أو البريد…"
          style={{ flex: '1 1 260px', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 14px', fontSize: '14px', outline: 'none', fontFamily: 'inherit', textAlign: 'right' }}
        />
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }}
          style={{ border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 14px', fontSize: '14px', outline: 'none', fontFamily: 'inherit', background: '#fff' }}
        >
          <option value="all">كل الأدوار</option>
          {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <Card style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '14px 18px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B', textAlign: 'right' }}>
          <span>الاسم</span><span>البريد</span><span>الشركة</span><span>الدور</span><span>الحالة</span><span>الإجراء</span>
        </div>

        {users.length === 0 ? (
          <div style={{ padding: '44px', textAlign: 'center', color: '#64748B', fontSize: '14px', fontWeight: 600 }}>
            {query || roleFilter !== 'all' ? 'لا نتائج مطابقة' : 'لا يوجد مستخدمون'}
          </div>
        ) : users.map((u) => {
          const r = ROLE[u.role] || { label: u.role, bg: '#F1F5F9', c: '#64748B' }
          const s = STATUS[u.status] || { label: u.status, bg: '#F1F5F9', c: '#64748B' }
          const open = openId === u.id
          return (
            <div key={u.id} style={{ borderBottom: '1px solid #F1F5F9', opacity: busyId === u.id ? 0.55 : 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '14px 18px', alignItems: 'center', textAlign: 'right' }}>
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{fullName(u)}</span>
                <span style={{ fontSize: '13px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</span>
                <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>{u.tenants?.name || '—'}</span>
                <span><span style={{ fontSize: '12.5px', fontWeight: 700, background: r.bg, color: r.c, padding: '4px 10px', borderRadius: '6px' }}>{r.label}</span></span>
                <span><span style={{ background: s.bg, color: s.c, borderRadius: '7px', padding: '4px 11px', fontSize: '12.5px', fontWeight: 800 }}>{s.label}</span></span>
                <button onClick={() => setOpenId(open ? null : u.id)} style={{ background: '#fff', color: '#1E2A52', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '7px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {open ? 'إخفاء' : 'عرض'}
                </button>
              </div>

              {open && (
                <div style={{ padding: '4px 18px 18px', background: '#FAFCFF' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '14px', textAlign: 'right', marginBottom: '14px' }}>
                    <div><div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>مُعرّف الحساب</div><div style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', wordBreak: 'break-all' }}>{u.id}</div></div>
                    <div><div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>أُنشئ في</div><div style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155' }}>{u.created_at ? new Date(u.created_at).toLocaleString('en-GB') : '—'}</div></div>
                    <div><div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>آخر دخول</div><div style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155' }}>{u.last_login_at ? new Date(u.last_login_at).toLocaleString('en-GB') : 'لم يسجّل دخول'}</div></div>
                  </div>

                  {/* The role is not editable here on purpose: guard_user_privileges
                      refuses a change of role from the application, and offering a
                      control the database will refuse is worse than not offering it. */}
                  {u.status === 'active' ? (
                    <button onClick={() => setStatus(u, 'inactive')} disabled={busyId === u.id} style={{ background: '#FEE2E2', color: '#B91C1C', border: 0, borderRadius: '9px', padding: '9px 18px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إيقاف الحساب</button>
                  ) : (
                    <button onClick={() => setStatus(u, 'active')} disabled={busyId === u.id} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '9px', padding: '9px 18px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إعادة التفعيل</button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </Card>

      {pages > 1 && (
        <div style={{ marginTop: '18px', display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              style={{ padding: '8px 13px', background: p === page ? '#1E2A52' : '#fff', color: p === page ? '#fff' : '#0F172A', border: p === page ? 0 : '1px solid #E2E8F0', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, fontFamily: 'inherit' }}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
