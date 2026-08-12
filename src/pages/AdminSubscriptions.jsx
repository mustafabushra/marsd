import { useCallback, useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabase } from '../lib/api'
import { notifyTenant } from '../lib/notify'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import DeferredSkeleton from '../components/DeferredSkeleton'
import { SkeletonPage, SkeletonTable } from '../components/Skeleton'
import { Card } from '../ui'

/**
 * /admin/subscriptions — every company's plan, and the only place any of them
 * changes.
 *
 * ============================================================================
 * History
 * ============================================================================
 * The screen originally displayed nothing at all: it asked for plans(name,
 * price) — the column is price_monthly — and PostgREST rejects the whole request
 * when one embedded column is unknown, so the list was empty every time. The
 * formatter then read start_date, end_date, plan_name and price, none of which
 * exist. Renewing wrote end_date and never read the row back, so it reported
 * success on a column that is not there.
 *
 * Then the names were right and the values were not. Measured against the CHECK
 * constraint and against my_entitlements: «إلغاء» wrote `canceled` where the
 * constraint accepts `cancelled`, so the only way to end a subscription failed
 * on every click; `past_due` had a label and cannot exist; `cancelled` and
 * `failed` can and had none; and the badge said «نشط» for rows whose period had
 * run out and which therefore granted nothing.
 *
 * ============================================================================
 * Why the writes are RPCs now
 * ============================================================================
 * Since migration 110 a company cannot set its own plan, so everything happens
 * here. Rules kept in this file would be advisory — the same table is one PATCH
 * away for anyone with an admin token. admin_set_subscription is the only way
 * in: it checks the role, demands a written reason, refuses a term more than
 * five years out (two rows in this database end in 2126, typed by hand) and
 * refuses to backdate an expiry, then writes the audit entry in the same
 * transaction. This screen cannot forget any of that, because it does not
 * perform any of it.
 *
 * Plan-change requests are decided on /admin/payments and are only surfaced
 * here. Two screens approving the same thing is how they come to disagree.
 */

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }

/**
 * The four values the column may hold:
 *   CHECK (status = ANY (ARRAY['active','cancelled','expired','failed']))
 * Kept honest by scripts/verify-status-vocabularies.mjs, which reads the
 * constraint at check time rather than trusting this list.
 */
const STATUS = {
  active:    { label: 'نشط',        bg: '#ECFDF5', c: '#15803D' },
  cancelled: { label: 'ملغى',       bg: '#FEE2E2', c: '#DC2626' },
  expired:   { label: 'منتهٍ',      bg: '#F1F5F9', c: '#64748B' },
  failed:    { label: 'فشل السداد', bg: '#FFFBEB', c: '#B45309' },
}

const CANCELLED = 'cancelled'

const TERMS = [
  { months: 1,  label: 'شهر' },
  { months: 3,  label: '3 أشهر' },
  { months: 6,  label: '6 أشهر' },
  { months: 12, label: 'سنة' },
]

const LIMIT_LABELS = {
  searches_per_month: 'فتح تقارير',
  users: 'مستخدمون',
  watchlist_items: 'مراقبة',
  compare_items: 'مقارنة',
  pending_reports: 'تقارير معلّقة',
}

const num = (n) => Number(n || 0).toLocaleString('en-US')
const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB') : '—')
const monthsFromNow = (m) => {
  const d = new Date()
  d.setMonth(d.getMonth() + m)
  return d.toISOString()
}

export default function AdminSubscriptions() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState('')

  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [reason, setReason] = useState('')

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 5000) }

  const load = useCallback(async () => {
    try {
      setError('')
      const supabase = getSupabase()
      const [{ data, error: e }, { data: planRows }] = await Promise.all([
        supabase.rpc('admin_subscription_overview'),
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

  const { connected, liveAt } = useLiveData(load, {
    tables: ['subscriptions', 'plans', 'tenants', 'invoices', 'plan_change_requests'],
  })

  /**
   * Every write goes through the same call, so the reason cannot be skipped by
   * adding a button. The server refuses without it; this only saves a round trip
   * to be told so.
   */
  const apply = async (row, patch, notice) => {
    const why = reason.trim()
    if (why.length < 3) { showToast('❌ اكتب سبب التغيير — يصل الشركة ويُحفظ في السجل'); return }
    try {
      setBusyId(row.subscription_id)
      const { data, error: e } = await getSupabase().rpc('admin_set_subscription', {
        p_subscription_id: row.subscription_id,
        p_reason: why,
        p_plan_id: patch.planId ?? null,
        p_status: patch.status ?? null,
        p_period_end: patch.periodEnd ?? null,
        p_no_expiry: patch.noExpiry ?? false,
      })
      if (e) throw e
      if (!data?.ok) throw new Error(data?.reason || 'لم يُحفظ التغيير')

      await notifyTenant(row.tenant_id, 'subscription_changed', {
        title: 'تغيّر اشتراكك',
        message: `${notice} — ${why}`,
        meta: { subscription_id: row.subscription_id },
      })

      setReason('')
      await load()
      showToast(`✅ ${notice}`)
    } catch (err) {
      showToast(`❌ ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  const createFor = async (row) => {
    const why = reason.trim()
    if (why.length < 3) { showToast('❌ اكتب سبب الإنشاء'); return }
    const def = plans.find((p) => p.code === 'free') || plans[0]
    if (!def) { showToast('❌ لا باقات معرّفة'); return }
    try {
      setBusyId(row.tenant_id)
      const { data, error: e } = await getSupabase().rpc('admin_create_subscription', {
        p_tenant_id: row.tenant_id, p_plan_id: def.id, p_months: 1, p_reason: why,
      })
      if (e) throw e
      if (!data?.ok) throw new Error(data?.reason || 'تعذّر الإنشاء')
      setReason('')
      await load()
      showToast('✅ أُنشئ اشتراك على الباقة الافتراضية')
    } catch (err) {
      showToast(`❌ ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  const shown = useMemo(() => {
    const needle = q.trim()
    return rows.filter((r) => {
      if (needle && !(r.tenant_name || '').includes(needle)) return false
      if (statusFilter === 'all') return true
      if (statusFilter === 'none') return !r.subscription_id
      if (statusFilter === 'live') return r.is_live
      if (statusFilter === 'dead') return !!r.subscription_id && !r.is_live
      if (statusFilter === 'soon') return r.is_live && r.days_left != null && r.days_left <= 30
      return true
    })
  }, [rows, q, statusFilter])

  const tally = useMemo(() => ({
    live: rows.filter((r) => r.is_live).length,
    soon: rows.filter((r) => r.is_live && r.days_left != null && r.days_left <= 30).length,
    dead: rows.filter((r) => r.subscription_id && !r.is_live).length,
    none: rows.filter((r) => !r.subscription_id).length,
    requests: rows.filter((r) => r.pending_request).length,
  }), [rows])

  if (loading) {
    return (
      <DeferredSkeleton>
        <SkeletonPage stats={4} panels={0} />
        <SkeletonTable rows={6} cols={5} />
      </DeferredSkeleton>
    )
  }

  const chip = (key, label, n, tone) => (
    <button
      onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
      style={{
        background: statusFilter === key ? tone.on : '#fff',
        color: statusFilter === key ? '#fff' : tone.c,
        border: `1px solid ${statusFilter === key ? tone.on : '#E2E8F0'}`,
        borderRadius: '11px', padding: '11px 16px', cursor: 'pointer',
        fontFamily: 'inherit', textAlign: 'right', minWidth: '130px',
      }}>
      <div style={{ fontSize: '21px', fontWeight: 900 }}>{n}</div>
      <div style={{ fontSize: '12.5px', fontWeight: 700 }}>{label}</div>
    </button>
  )

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 100, boxShadow: '0 8px 24px rgba(15,23,42,.25)', maxWidth: '460px', lineHeight: 1.8 }}>{toast}</div>
      )}

      <div style={{ marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px', textAlign: 'right' }}>الاشتراكات</h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
            {rows.length} كياناً · كل تغيير يحتاج سبباً، ويصل الشركة، ويُحفظ في السجل
          </p>
        </div>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      {/* Counts that are also the filter. A number you cannot click is a number
          you then have to go and find. */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {chip('live', 'يمنح صلاحيات', tally.live, { on: '#16A34A', c: '#15803D' })}
        {chip('soon', 'ينتهي خلال شهر', tally.soon, { on: '#B45309', c: '#B45309' })}
        {chip('dead', 'لا يمنح شيئاً', tally.dead, { on: '#DC2626', c: '#B91C1C' })}
        {chip('none', 'بلا اشتراك', tally.none, { on: '#1E2A52', c: '#334155' })}
      </div>

      {tally.requests > 0 && (
        <div style={{ marginBottom: '16px', padding: '13px 16px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13.5px', color: '#1E3A8A', fontWeight: 700, textAlign: 'right' }}>
            {tally.requests} طلب ترقية معلّق. القرار يُتخذ في صفحة المدفوعات — مكان واحد لا مكانان.
          </span>
          <button onClick={() => navigate('/admin/payments')} style={{ background: '#1D4ED8', color: '#fff', border: 0, borderRadius: '9px', padding: '8px 16px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            فتح المدفوعات
          </button>
        </div>
      )}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ابحث باسم الشركة…"
        style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #E2E8F0', borderRadius: '11px', padding: '12px 16px', fontSize: '14.5px', fontFamily: 'inherit', outline: 'none', marginBottom: '16px', textAlign: 'right' }}
      />

      {error && (
        <div style={{ marginBottom: '16px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#B91C1C', fontSize: '14px', fontWeight: 700, textAlign: 'right' }}>⚠️ {error}</div>
      )}

      <Card style={{ overflow: 'hidden' }}>
        {shown.length === 0 ? (
          <div style={{ padding: '44px', textAlign: 'center', color: '#64748B', fontSize: '14px', fontWeight: 600 }}>
            {rows.length === 0 ? 'لا توجد كيانات' : 'لا نتائج مطابقة'}
          </div>
        ) : shown.map((row) => {
          const s = STATUS[row.status] || { label: row.status || 'بلا اشتراك', bg: '#F1F5F9', c: '#64748B' }
          const key = row.subscription_id || row.tenant_id
          const open = openId === key
          const busy = busyId === key
          // Still shown, because a term this far out can only have been typed —
          // migration 113 removed the one the system had written itself, and
          // admin_set_subscription now refuses to create another.
          const absurd = row.days_left != null && row.days_left > 366 * 5
          const ceiling = Number(row.limits?.searches_per_month ?? -1)
          // No end date is not missing data. It is a subscription that does not
          // expire, which is what my_entitlements has always read it as.
          const noExpiry = !!row.subscription_id && row.period_end == null

          return (
            <div key={key} style={{ borderBottom: '1px solid #F1F5F9', opacity: busy ? 0.55 : 1 }}>
              <div
                onClick={() => { setOpenId(open ? null : key); setReason('') }}
                style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '15px 18px', cursor: 'pointer', flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: '160px', fontSize: '14.5px', fontWeight: 800, color: '#0F172A', textAlign: 'right' }}>
                  {row.tenant_name || '—'}
                </span>

                <span style={{ fontSize: '13px', color: '#475569', fontWeight: 700, minWidth: '110px', textAlign: 'right' }}>
                  {row.plan_name || 'بلا باقة'}
                  {row.plan_id && !row.plan_active && (
                    <span style={{ color: '#B45309' }}> · موقوفة</span>
                  )}
                </span>

                <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 700, minWidth: '92px', textAlign: 'right' }}>
                  {row.subscription_id ? `${num(row.price_monthly)} ر.س` : '—'}
                </span>

                <span style={{ fontSize: '13px', fontWeight: 700, minWidth: '120px', textAlign: 'right', color: absurd ? '#B45309' : '#64748B' }}>
                  {!row.subscription_id ? '—' : noExpiry ? 'بلا انتهاء' : day(row.period_end)}
                  {row.days_left != null && (
                    <span style={{ display: 'block', fontSize: '11.5px' }}>
                      {absurd ? '⚠️ تاريخ غير معقول'
                        : row.days_left >= 0 ? `${row.days_left} يوماً` : 'انتهت'}
                    </span>
                  )}
                </span>

                <span style={{ minWidth: '110px', textAlign: 'right' }}>
                  <span style={{ background: s.bg, color: s.c, borderRadius: '7px', padding: '4px 11px', fontSize: '12.5px', fontWeight: 800 }}>{s.label}</span>
                  {/* Says active and grants nothing: the period ran out and the
                      status was never moved. my_entitlements already treats it
                      as dead. */}
                  {row.status === 'active' && !row.is_live && (
                    <span style={{ display: 'block', fontSize: '11.5px', color: '#B45309', fontWeight: 800, marginTop: '4px' }}>
                      انتهت المدة — لا يمنح شيئاً
                    </span>
                  )}
                  {row.pending_request && (
                    <span style={{ display: 'block', fontSize: '11.5px', color: '#1D4ED8', fontWeight: 800, marginTop: '4px' }}>
                      طلب ترقية: {row.requested_plan_name || '—'}
                    </span>
                  )}
                </span>

                <span style={{ color: '#94A3B8', fontSize: '13px', fontWeight: 800 }}>{open ? '▾' : '◂'}</span>
              </div>

              {open && (
                <div style={{ padding: '4px 18px 20px', background: '#FAFCFF' }}>
                  {/* What the plan grants, and what has been used of it. An
                      operator deciding whether to extend was being asked to
                      decide without either. */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '11px', marginBottom: '14px' }}>
                    <Tile k="الاستهلاك هذا الشهر"
                      v={ceiling < 0 ? `${row.lookups_used} · بلا حد` : `${row.lookups_used} من ${ceiling}`}
                      warn={ceiling >= 0 && row.lookups_used >= ceiling} />
                    <Tile k="المستخدمون" v={`${row.seats_used}${row.limits?.users >= 0 ? ` من ${row.limits.users}` : ''}`} />
                    <Tile k="المحصّل" v={`${num(row.paid_total)} ر.س`} />
                    <Tile k="فواتير غير مسدّدة" v={num(row.unpaid_count)} warn={row.overdue_count > 0}
                      note={row.overdue_count > 0 ? `${row.overdue_count} متأخرة` : ''} />
                  </div>

                  {Object.keys(row.limits || {}).length > 0 && (
                    <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap', marginBottom: '14px' }}>
                      {Object.entries(LIMIT_LABELS).map(([k, label]) => {
                        const v = row.limits?.[k]
                        if (v === undefined) return null
                        return (
                          <span key={k} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '999px', padding: '4px 12px', fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                            {label}: {Number(v) < 0 ? 'بلا حد' : v}
                          </span>
                        )
                      })}
                    </div>
                  )}

                  {row.last_change_at && (
                    <div style={{ fontSize: '12.5px', color: '#64748B', marginBottom: '14px', textAlign: 'right', lineHeight: 1.8 }}>
                      آخر تغيير {day(row.last_change_at)}
                      {row.last_change_reason ? ` — «${row.last_change_reason}»` : ' — بلا سبب مسجَّل'}
                    </div>
                  )}

                  {!row.subscription_id ? (
                    <>
                      <p style={{ fontSize: '13.5px', color: '#B45309', fontWeight: 700, margin: '0 0 10px', textAlign: 'right' }}>
                        هذا الكيان بلا اشتراك، ولا يستطيع إنشاءه بنفسه. أنشئه على الباقة الافتراضية.
                      </p>
                      <Reason value={reason} onChange={setReason} />
                      <button disabled={busy} onClick={() => createFor(row)} style={act('#1E2A52', '#fff')}>
                        إنشاء اشتراك
                      </button>
                    </>
                  ) : (
                    <>
                      <Reason value={reason} onChange={setReason} />

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 800 }}>تجديد:</span>
                        {TERMS.map((t) => (
                          <button key={t.months} disabled={busy}
                            onClick={() => apply(row, { status: 'active', periodEnd: monthsFromNow(t.months) }, `جُدّد اشتراكك ${t.label}`)}
                            style={act('#16A34A', '#fff')}>
                            {t.label}
                          </button>
                        ))}
                        {/* The honest way to say what the century used to mean.
                            Migration 011 wrote `now() + 100 years` because the
                            column was NOT NULL; 113 made it nullable and both
                            readers already understood the absence. */}
                        {!noExpiry && (
                          <button disabled={busy}
                            onClick={() => apply(row, { status: 'active', noExpiry: true }, 'اشتراكك بلا تاريخ انتهاء')}
                            style={act('#F1F5F9', '#334155')}>
                            بلا انتهاء
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '10px' }}>
                        <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 800 }}>الباقة:</span>
                        <select
                          value={row.plan_id || ''}
                          disabled={busy}
                          onChange={(e) => {
                            const p = plans.find((x) => x.id === e.target.value)
                            if (p) apply(row, { planId: p.id }, `أصبحت باقتك «${p.name}»`)
                          }}
                          style={{ border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', fontFamily: 'inherit', background: '#fff' }}>
                          {plans
                            .filter((p) => p.active || p.id === row.plan_id)
                            .map((p) => (
                              <option key={p.id} value={p.id}>{p.name}{p.active ? '' : ' — موقوفة'}</option>
                            ))}
                        </select>

                        {row.status === 'active' && (
                          <button disabled={busy}
                            onClick={() => apply(row, { status: CANCELLED }, 'أُلغي اشتراكك — حسابك على الباقة الافتراضية')}
                            style={act('#FEE2E2', '#B91C1C')}>
                            إلغاء الاشتراك
                          </button>
                        )}
                        {row.status !== 'active' && (
                          <button disabled={busy}
                            onClick={() => apply(row, { status: 'active', periodEnd: monthsFromNow(1) }, 'أُعيد تفعيل اشتراكك')}
                            style={act('#16A34A', '#fff')}>
                            إعادة تفعيل
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </Card>
    </div>
  )
}

const act = (bg, c) => ({
  background: bg, color: c, border: 0, borderRadius: '8px', padding: '8px 14px',
  fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
})

function Tile({ k, v, warn, note }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${warn ? '#FDE68A' : '#E2E8F0'}`, borderRadius: '11px', padding: '11px 13px', textAlign: 'right' }}>
      <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 700, marginBottom: '4px' }}>{k}</div>
      <div style={{ fontSize: '15px', fontWeight: 900, color: warn ? '#B45309' : '#0F172A' }}>{v}</div>
      {note && <div style={{ fontSize: '11px', color: '#B45309', fontWeight: 700, marginTop: '2px' }}>{note}</div>}
    </div>
  )
}

/** The server refuses without one. This is only the field. */
function Reason({ value, onChange }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="سبب التغيير — يصل الشركة ويُحفظ في السجل"
      style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #E2E8F0', borderRadius: '9px', padding: '10px 13px', fontSize: '13.5px', fontFamily: 'inherit', outline: 'none', marginBottom: '11px', textAlign: 'right' }}
    />
  )
}
