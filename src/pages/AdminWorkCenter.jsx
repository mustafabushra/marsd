import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getSupabase } from '../lib/api'
import { Card } from '../ui'

/**
 * One queue over everything that needs a person.
 *
 * Registration in one screen, documents in another, claims in a third,
 * verification in a fourth, reports in a fifth, disputes in a sixth — six lists
 * with no shared idea of who holds a thing, how long it has waited, or which one
 * to open first. `admin_work_items` returns all six in one shape; this is the
 * screen that reads it.
 *
 * The Command Center links here with `?scope=`. Those links were dead until this
 * existed — a number that is clickable to a 404 is worse than one that is not
 * clickable at all, because it teaches somebody the screen is broken rather
 * than that it is finished.
 *
 * Nothing decides anything here. Taking a request is the one act available,
 * because it is the one that costs nothing to undo; every decision belongs on
 * the request's own page where the evidence is.
 */

const TONE = {
  critical: { fg: '#B91C1C', bg: '#FEF2F2', dot: '🔴' },
  high:     { fg: '#C2410C', bg: '#FFF7ED', dot: '🟠' },
  normal:   { fg: '#475569', bg: '#F8FAFC', dot: '⚪' },
}

const SLA_LABEL = {
  late_response:   { t: 'لم يُستلَم', fg: '#B91C1C' },
  late_resolution: { t: 'متأخّر', fg: '#C2410C' },
  due_soon:        { t: 'يستحق قريباً', fg: '#B45309' },
  paused:          { t: 'بانتظارهم', fg: '#1D4ED8' },
  ok:              { t: '', fg: '#64748B' },
}

// «بانتظار الشركة» is a scope of its own and never a subset of «متأخّر». The
// clock is stopped while the ball is theirs, and counting that against Marsad
// is what makes an SLA figure stop meaning anything.
const SCOPES = [
  { v: 'all',          t: 'الكل',          count: 'all' },
  { v: 'unassigned',   t: 'غير مُسنَد',     count: 'unassigned' },
  { v: 'late',         t: 'متأخّر',         count: 'late' },
  { v: 'waiting_them', t: 'بانتظار الشركة', count: 'waiting_them' },
  { v: 'mine',         t: 'عليّ',           count: 'mine' },
]

const KINDS = [
  { v: null, t: 'كل الأنواع' },
  { v: 'registration', t: 'تسجيل شركة' },
  { v: 'claim', t: 'مطالبة بملكية' },
  { v: 'data_update', t: 'تصحيح بيانات' },
  { v: 'document_review', t: 'مراجعة مستندات' },
  { v: 'report_review', t: 'مراجعة تقرير' },
  { v: 'dispute', t: 'اعتراض' },
]

const OPEN_ROUTE = {
  report_review: '/admin/reports',
  dispute: '/admin/disputes',
}

const fmt = (t) => t ? new Date(t).toLocaleString('ar-SA', {
  hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
}) : '—'

const overdueBy = (due) => {
  if (!due) return ''
  const h = Math.round((Date.now() - new Date(due).getTime()) / 3600000)
  if (h < 1) return 'أقل من ساعة'
  if (h < 24) return `${h} ساعة`
  return `${Math.round(h / 24)} يوم`
}

export default function AdminWorkCenter () {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const scope = params.get('scope') || 'all'
  const kind = params.get('kind') || null

  const [rows, setRows] = useState(null)
  const [counts, setCounts] = useState(null)
  const [perms, setPerms] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const can = useMemo(() => {
    const keys = new Set((perms || []).map((p) => p.key))
    return (k) => keys.has(k)
  }, [perms])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const sb = getSupabase()
      const [items, c, p] = await Promise.all([
        sb.rpc('admin_work_items', { p_scope: scope, p_kind: kind, p_limit: 200 }),
        sb.rpc('admin_work_counts'),
        sb.rpc('my_permissions'),
      ])
      if (items.error) throw items.error
      setRows(items.data || [])
      setCounts(c.data || null)
      setPerms(p.data || [])
    } catch (e) {
      setError(e.message || 'تعذّر تحميل الطابور')
    } finally {
      setLoading(false)
    }
  }, [scope, kind])

  useEffect(() => { load() }, [load])

  const setParam = (k, v) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v); else next.delete(k)
    setParams(next, { replace: true })
  }

  /** Take a request. The database checks the same permission again. */
  const takeIt = async (id) => {
    setBusy(true)
    setError('')
    try {
      const { error: e } = await getSupabase().rpc('assign_company_request', { p_request_id: id })
      if (e) throw e
      await load()
    } catch (e) {
      setError(e.message || 'تعذّر استلام الطلب')
    } finally {
      setBusy(false)
    }
  }

  const card = {
    background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '24px',
  }
  const chip = (active) => ({
    minHeight: '34px', padding: '0 14px', borderRadius: '999px', fontSize: '13px',
    fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
    border: `1.5px solid ${active ? '#0F172A' : '#E2E8F0'}`,
    background: active ? '#0F172A' : '#fff', color: active ? '#fff' : '#475569',
  })

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
      <header style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>
          مركز العمل
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
          كل ما يحتاج إجراءً من مرصد — التسجيل والملكية والتصحيح والمستندات
          والتقارير والاعتراضات، في طابور واحد.
        </p>
      </header>

      {error && (
        <div role="alert" style={{
          background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C',
          borderRadius: '10px', padding: '12px 18px', marginBottom: '14px',
          fontSize: '13.5px', fontWeight: 700,
        }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}
        role="tablist" aria-label="نطاق العمل">
        {SCOPES.map((s) => (
          <button key={s.v} role="tab" aria-selected={scope === s.v}
            onClick={() => setParam('scope', s.v === 'all' ? null : s.v)}
            style={chip(scope === s.v)}>
            {s.t}{counts?.[s.count] != null ? ` (${counts[s.count]})` : ''}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}
        role="tablist" aria-label="نوع العمل">
        {KINDS.map((k) => (
          <button key={k.v || 'any'} role="tab" aria-selected={kind === k.v}
            onClick={() => setParam('kind', k.v)}
            style={{ ...chip(kind === k.v), minHeight: '30px', fontSize: '12.5px' }}>
            {k.t}
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <div aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{
                height: '54px', background: '#F1F5F9', borderRadius: '8px', marginBottom: '10px',
              }} />
            ))}
          </div>
        ) : !rows?.length ? (
          <div style={{ fontSize: '14px', color: '#15803D', fontWeight: 700, lineHeight: 2 }}>
            ✓ لا يوجد عمل في هذا النطاق
            <div style={{ color: '#94A3B8', fontWeight: 400, fontSize: '13px' }}>
              جرّب نطاقاً آخر، أو عُد إلى مركز القيادة.
            </div>
          </div>
        ) : rows.map((r, i) => {
          const tone = TONE[r.priority] || TONE.normal
          const sla = SLA_LABEL[r.sla_state] || SLA_LABEL.ok
          return (
            <div key={`${r.kind}-${r.item_id}`} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '12px', padding: '14px 0', flexWrap: 'wrap',
              borderTop: i ? '1px solid #F1F5F9' : 0,
            }}>
              <div style={{ minWidth: 0, flex: '1 1 300px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: tone.fg }}>
                  {tone.dot} {r.kind_label}
                  {sla.t && <span style={{ color: sla.fg }}> · {sla.t}
                    {r.sla_state === 'late_resolution' && r.due_at ? ` ${overdueBy(r.due_at)}` : ''}
                  </span>}
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginTop: '3px' }}>
                  {r.company_name || r.title}
                </div>
                <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '3px', lineHeight: 1.9 }}>
                  {r.status_label} · {r.assignee || 'غير مُسنَد'}
                  {r.due_at ? ` · المهلة ${fmt(r.due_at)}` : ''}
                  {r.waiting_days ? ` · منذ ${r.waiting_days} يوم` : ''}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flex: 'none' }}>
                {/* Hidden when the caller may not, refused again by the database
                    when they try anyway. */}
                {!r.assignee && r.assignable && can('work.assign_self') && (
                  <button onClick={() => takeIt(r.item_id)} disabled={busy}
                    aria-label={`استلام ${r.kind_label} — ${r.company_name || r.title}`}
                    style={{
                      minHeight: '38px', padding: '0 16px', background: '#0F172A', color: '#fff',
                      border: 0, borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>استلام</button>
                )}
                <button
                  onClick={() => navigate(OPEN_ROUTE[r.kind]
                    || (r.company_id ? `/admin/company/${r.company_id}` : '/admin/company-requests'))}
                  aria-label={`فتح ${r.kind_label} — ${r.company_name || r.title}`}
                  style={{
                    minHeight: '38px', padding: '0 16px', background: '#fff', color: '#334155',
                    border: '1.5px solid #E2E8F0', borderRadius: '8px', fontSize: '13px',
                    fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}>فتح</button>
              </div>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
