import { useCallback, useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { notifyTenant } from '../lib/notify'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'

/**
 * /admin/subscriptions — which plan each company is on, and until when.
 *
 * The screen has never displayed a subscription. Its select asked for
 * plans(name, price) — the column is price_monthly — and PostgREST rejects the
 * whole request when one embedded column is unknown, so subsData came back null
 * every time and the list rendered empty. The formatter then read s.start_date,
 * s.end_date, s.plan_name and s.price, none of which exist either; the columns
 * are current_period_start and current_period_end, and the price belongs to the
 * plan. Four wrong names in one screen, none of which could produce a visible
 * error because the first one already emptied the list.
 *
 * Renewing wrote end_date and did not read the row back, so it reported success
 * on a column that is not there.
 *
 * Changing what a company is subscribed to is a decision about that company.
 * It now tells them.
 */

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }
const COLS = '1.6fr 1.2fr 1fr 1.2fr 1fr 1.4fr'

const STATUS = {
  active:   { label: 'نشط',   bg: '#ECFDF5', c: '#15803D' },
  past_due: { label: 'متأخر', bg: '#FFFBEB', c: '#B45309' },
  canceled: { label: 'ملغى',  bg: '#FEE2E2', c: '#DC2626' },
  expired:  { label: 'منتهٍ', bg: '#F1F5F9', c: '#64748B' },
}

const RENEW_DAYS = 30

export default function AdminSubscriptions() {
  const { user } = useUser()
  const [rows, setRows] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState('')

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 4500) }

  const load = useCallback(async () => {
    try {
      setError('')
      const supabase = getSupabase()
      const [{ data, error: e }, { data: planRows }] = await Promise.all([
        supabase
          .from('subscriptions')
          .select(`
            id, tenant_id, plan_id, status, current_period_start, current_period_end, created_at,
            tenants ( id, name ),
            plans ( id, code, name, price_monthly )
          `)
          .order('created_at', { ascending: false }),
        supabase.from('plans').select('id, code, name, price_monthly, active').order('sort_order'),
      ])
      if (e) throw e
      setRows(data || [])
      setPlans(planRows || [])
    } catch (err) {
      setError(err.message || 'تعذّر تحميل الاشتراكات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const { connected, liveAt } = useLiveData(load, { tables: ['subscriptions', 'plans', 'tenants'] })

  const save = async (row, patch, notice) => {
    try {
      setBusyId(row.id)
      const supabase = getSupabase()

      const { data, error: e } = await supabase
        .from('subscriptions')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .select('id, status, plan_id, current_period_end')
      if (e) throw e
      // An UPDATE filtered out by RLS matches nothing and reports nothing.
      if (!data?.length) throw new Error('لم يُحفظ التغيير — تحقّق من صلاحيتك')

      await supabase.from('audit_logs').insert([{
        actor_id: user?.id,
        action: 'subscription_changed',
        entity: 'subscription',
        entity_id: row.id,
        tenant_id: row.tenant_id,
        meta: JSON.stringify(patch),
        created_at: new Date().toISOString(),
      }])

      await notifyTenant(row.tenant_id, 'subscription_changed', {
        title: 'تغيّر اشتراكك',
        message: notice,
        meta: { subscription_id: row.id, ...patch },
      })

      await load()
      showToast(`✅ ${notice}`)
    } catch (err) {
      showToast(`❌ ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  const renew = (row) => {
    const from = row.current_period_end && new Date(row.current_period_end) > new Date()
      ? new Date(row.current_period_end)   // extend, don't shorten an unexpired term
      : new Date()
    const end = new Date(from)
    end.setDate(end.getDate() + RENEW_DAYS)
    return save(row,
      { status: 'active', current_period_start: new Date().toISOString(), current_period_end: end.toISOString() },
      `جُدّد اشتراكك حتى ${end.toLocaleDateString('en-GB')}`)
  }

  const changePlan = (row, planId) => {
    const plan = plans.find((p) => p.id === planId)
    if (!plan || planId === row.plan_id) return
    return save(row, { plan_id: planId }, `أصبحت باقتك «${plan.name}»`)
  }

  const cancel = (row) => save(row, { status: 'canceled' }, 'أُلغي اشتراكك — حسابك على الباقة الافتراضية')

  const daysLeft = (row) => {
    if (!row.current_period_end) return null
    return Math.ceil((new Date(row.current_period_end) - new Date()) / 86400000)
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: '#64748B', fontWeight: 600 }}>جاري تحميل الاشتراكات...</div>
  }

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 100, boxShadow: '0 8px 24px rgba(15,23,42,.25)', maxWidth: '460px', lineHeight: 1.8 }}>{toast}</div>
      )}

      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px', textAlign: 'right' }}>الاشتراكات</h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>{rows.length} اشتراكاً · كل تغيير هنا يصل الشركة إشعاراً</p>
        </div>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#B91C1C', fontSize: '14px', fontWeight: 700, textAlign: 'right' }}>⚠️ {error}</div>
      )}

      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '14px 18px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B', textAlign: 'right' }}>
          <span>الشركة</span><span>الباقة</span><span>الشهري</span><span>ينتهي</span><span>الحالة</span><span>الإجراءات</span>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '44px', textAlign: 'center', color: '#64748B', fontSize: '14px', fontWeight: 600 }}>لا توجد اشتراكات</div>
        ) : rows.map((row) => {
          const s = STATUS[row.status] || { label: row.status, bg: '#F1F5F9', c: '#64748B' }
          const left = daysLeft(row)
          return (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: COLS, padding: '14px 18px', borderBottom: '1px solid #F1F5F9', alignItems: 'center', textAlign: 'right', opacity: busyId === row.id ? 0.55 : 1 }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{row.tenants?.name || '—'}</span>

              <select
                value={row.plan_id || ''}
                onChange={(e) => changePlan(row, e.target.value)}
                disabled={busyId === row.id}
                style={{ border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', fontFamily: 'inherit', background: '#fff', maxWidth: '140px' }}
              >
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              <span style={{ fontSize: '13px', color: '#334155', fontWeight: 700 }}>
                {Number(row.plans?.price_monthly || 0).toLocaleString('en-US')} ر.س
              </span>

              <span style={{ fontSize: '13px', color: left != null && left < 7 ? '#B45309' : '#64748B', fontWeight: 700 }}>
                {row.current_period_end ? new Date(row.current_period_end).toLocaleDateString('en-GB') : '—'}
                {left != null && <span style={{ fontSize: '11.5px', display: 'block', color: '#64748B' }}>{left >= 0 ? `${left} يوماً` : 'منتهٍ'}</span>}
              </span>

              <span><span style={{ background: s.bg, color: s.c, borderRadius: '7px', padding: '4px 11px', fontSize: '12.5px', fontWeight: 800 }}>{s.label}</span></span>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => renew(row)} disabled={busyId === row.id} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '8px', padding: '7px 13px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>تجديد {RENEW_DAYS} يوماً</button>
                {row.status === 'active' && (
                  <button onClick={() => cancel(row)} disabled={busyId === row.id} style={{ background: '#FEE2E2', color: '#B91C1C', border: 0, borderRadius: '8px', padding: '7px 13px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
