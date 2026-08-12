import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabase } from '../lib/api'
import { Card } from '../ui'

/**
 * What needs me, what is late, what broke, what is running.
 *
 * Not a dashboard. A dashboard answers «how are we doing»; this answers «is
 * anything wrong and where do I go». So there are no charts, no totals nobody
 * acts on, and no number without somewhere to click.
 *
 * ============================================================================
 * Every section loads on its own
 * ============================================================================
 * Ten calls, ten independent states. A failing health check must not blank the
 * queue beside it, and one slow query must not hold the whole screen — which is
 * why there is no page-level spinner anywhere in this file.
 *
 * ============================================================================
 * Nothing here is computed in the browser
 * ============================================================================
 * Every figure comes from a function that owns it. A count assembled here from
 * three tables would be a fourth opinion about the truth, and this screen exists
 * because those disagreements went unnoticed for weeks.
 *
 * There is deliberately no «↑ 3 since yesterday»: no daily snapshot is stored,
 * so a comparison could only be decoration.
 *
 * ============================================================================
 * Permissions hide actions; they do not protect data
 * ============================================================================
 * `my_permissions()` decides which buttons render. Every one of those buttons
 * calls a definer function that checks the same permission again — the check
 * here is courtesy, and the one in the database is the rule.
 */

// Colour carries meaning and nothing else. No card is a solid block of it — a
// screen that is entirely red says the same as one entirely grey: nothing.
const TONE = {
  critical: { fg: '#B91C1C', bg: '#FEF2F2', bd: '#FECACA', dot: '🔴' },
  overdue:  { fg: '#C2410C', bg: '#FFF7ED', bd: '#FED7AA', dot: '🟠' },
  waiting:  { fg: '#B45309', bg: '#FFFBEB', bd: '#FDE68A', dot: '🟡' },
  company:  { fg: '#1D4ED8', bg: '#EFF6FF', bd: '#BFDBFE', dot: '🔵' },
  done:     { fg: '#15803D', bg: '#F0FDF4', bd: '#BBF7D0', dot: '🟢' },
  neutral:  { fg: '#475569', bg: '#F8FAFC', bd: '#E2E8F0', dot: '⚪' },
}

const KIND_ROUTE = {
  registration: '/admin/work', claim: '/admin/work', data_update: '/admin/work',
  document_review: '/admin/work', report_review: '/admin/reports', dispute: '/admin/disputes',
}

const IMPORT_STATE = {
  created: 'أُنشئت', validating: 'قيد التحقّق', loading: 'جارٍ الاستيراد',
  verifying: 'قيد الفحص النهائي', ready: 'جاهزة للنشر', published: 'منشورة',
  failed: 'فشلت', cancelled: 'أُلغيت', rolled_back: 'تُوجِع عنها',
}

const num = (n) => Number(n ?? 0).toLocaleString('en')

// «بانتظار الشركة» sits beside «متأخّر», never inside it. Counting their delay
// against Marsad is what makes an SLA number stop meaning anything.
const SCOPES = [
  { v: 'now',          t: 'يحتاج تدخّلك', tone: 'critical', empty: '✓ لا توجد طلبات تحتاج تدخّلك الآن.' },
  { v: 'all',          t: 'الكل',          tone: 'neutral',  count: 'all',          empty: 'لا يوجد عمل مفتوح.' },
  { v: 'unassigned',   t: 'غير مُسنَد',     tone: 'waiting',  count: 'unassigned',   empty: '✓ كل شيء مُسنَد.' },
  { v: 'late',         t: 'متأخّر',         tone: 'overdue',  count: 'late',         empty: '✓ لا توجد طلبات متأخّرة.' },
  { v: 'waiting_them', t: 'بانتظار الشركة', tone: 'company',  count: 'waiting_them', empty: 'لا توجد طلبات بانتظار الشركة.' },
]

const fmtTime = (t) => t ? new Date(t).toLocaleString('ar-SA', {
  hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
}) : '—'

const since = (t) => {
  if (!t) return '—'
  const m = Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 60000))
  if (m < 1) return 'الآن'
  if (m < 60) return `منذ ${m} دقيقة`
  const h = Math.round(m / 60)
  if (h < 24) return `منذ ${h} ساعة`
  return `منذ ${Math.round(h / 24)} يوم`
}

/** How long past a deadline, in words. */
const overdueBy = (due) => {
  if (!due) return ''
  const h = Math.round((Date.now() - new Date(due).getTime()) / 3600000)
  if (h < 1) return 'أقل من ساعة'
  if (h < 24) return `${h} ساعة`
  return `${Math.round(h / 24)} يوم`
}

/** One independently-loading section. */
function useSection (fn, deps = []) {
  const [state, set] = useState({ data: null, loading: true, error: '' })

  const load = useCallback(async () => {
    set((s) => ({ ...s, loading: true, error: '' }))
    try {
      const data = await fn(getSupabase())
      set({ data, loading: false, error: '' })
    } catch (e) {
      set({ data: null, loading: false, error: e.message || 'تعذّر التحميل' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

const rpc = (name, args) => async (sb) => {
  const { data, error } = await sb.rpc(name, args)
  if (error) throw error
  return data
}

const card = {
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px',
  padding: '24px', minWidth: 0,
}
const titleStyle = { fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }
const noteStyle = { fontSize: '13px', color: '#64748B', margin: '0 0 16px' }
const btn = {
  minHeight: '40px', padding: '0 18px', borderRadius: '8px', fontSize: '13.5px',
  fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
}

function Skeleton ({ lines = 3, height = 14 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{
          height: `${height}px`, background: '#F1F5F9', borderRadius: '6px',
          marginBottom: '10px', width: `${100 - i * 10}%`,
        }} />
      ))}
    </div>
  )
}

/** A section that failed says so, and nothing around it changes. */
function SectionError ({ message, onRetry, what }) {
  return (
    <div role="alert" style={{ fontSize: '13.5px', color: '#B45309', lineHeight: 1.9 }}>
      تعذّر تحميل {what}
      <div style={{ color: '#94A3B8', fontSize: '12.5px' }}>{String(message).slice(0, 140)}</div>
      <button onClick={onRetry} style={{
        ...btn, marginTop: '10px', minHeight: '36px', background: '#fff',
        border: '1.5px solid #E2E8F0', color: '#334155',
      }}>إعادة المحاولة</button>
    </div>
  )
}

function Empty ({ children, ok = false }) {
  return (
    <div style={{
      fontSize: '13.5px', color: ok ? '#15803D' : '#64748B',
      fontWeight: ok ? 700 : 400, lineHeight: 1.9,
    }}>{children}</div>
  )
}

/** A section wrapper that owns its own three states. */
function Section ({ title, note, state, what, empty, children, action, style }) {
  return (
    <section style={{ ...card, ...style }} aria-label={title}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
        <h2 style={titleStyle}>{title}</h2>
        {action}
      </div>
      {note && <p style={noteStyle}>{note}</p>}
      {state.loading ? <Skeleton lines={4} height={22} />
        : state.error ? <SectionError message={state.error} onRetry={state.reload} what={what} />
          : (empty ?? children)}
    </section>
  )
}

export default function AdminCommandCenter () {
  const navigate = useNavigate()
  const [tick, setTick] = useState(0)
  const [refreshedAt, setRefreshedAt] = useState(Date.now())
  const [confirm, setConfirm] = useState(null)   // the publish dialog
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  // The queue's own scopes. «بانتظار الشركة» is a scope, never a subset of
  // «متأخّر» — the clock is stopped and the delay is not ours.
  const [scope, setScope] = useState('now')

  const perms    = useSection(rpc('my_permissions'), [])
  const counts   = useSection(rpc('admin_work_counts'), [tick])
  const items    = useSection(rpc('admin_work_items', { p_scope: 'all', p_limit: 200 }), [tick])
  const late     = useSection(rpc('admin_work_items', { p_scope: 'late', p_limit: 50 }), [tick])
  const waiting  = useSection(rpc('admin_work_items', { p_scope: 'waiting_them', p_limit: 50 }), [tick])
  const health   = useSection(rpc('admin_model_health'), [tick])
  const today    = useSection(rpc('admin_completed_today'), [tick])
  const official = useSection(rpc('admin_official_status_changes', { p_days: 30 }), [tick])
  const jobs     = useSection(rpc('admin_background_jobs'), [tick])
  const imports  = useSection(rpc('registry_import_history', { p_limit: 5 }), [tick])
  const activity = useSection(rpc('admin_activity_feed', { p_limit: 12 }), [tick])

  const can = useMemo(() => {
    const keys = new Set((perms.data || []).map((p) => p.key))
    return (k) => keys.has(k)
  }, [perms.data])

  const refresh = () => { setTick((t) => t + 1); setRefreshedAt(Date.now()); setActionError('') }

  // A screen somebody trusts to be live has to admit when it is not.
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])
  const staleMinutes = Math.floor((now - refreshedAt) / 60000)

  const criticalHealth = (health.data || []).filter((h) => h.status === 'critical')
  const all = items.data || []
  const scoped = scope === 'now' ? all.filter((i) => i.priority === 'critical')
    : scope === 'unassigned' ? all.filter((i) => !i.assignee && i.assignable)
      : scope === 'late' ? all.filter((i) => ['late_response', 'late_resolution'].includes(i.sla_state))
        : scope === 'waiting_them' ? all.filter((i) => i.sla_state === 'paused')
          : all
  const healthBad = (health.data || []).filter((h) => h.status !== 'healthy').length
  const criticalItems  = (items.data || []).filter((i) => i.priority === 'critical')
  const runningJob = (imports.data || []).find((j) =>
    ['created', 'validating', 'loading', 'verifying', 'ready'].includes(j.status))
  const publishedJob = (imports.data || []).find((j) => j.is_published)
  const failedJob = (imports.data || []).find((j) => j.status === 'failed')

  const alerts = [
    ...criticalHealth.map((h) => ({
      key: h.key, text: h.label, detail: h.detail, to: h.target,
    })),
    ...(failedJob ? [{
      key: 'import_failed', text: 'مهمّة استيراد فاشلة',
      detail: failedJob.failure_reason, to: '/admin/registry-import',
    }] : []),
  ]

  /** Take a request. The database checks the same permission again. */
  const takeIt = async (id) => {
    setBusy(true)
    setActionError('')
    try {
      const { error } = await getSupabase().rpc('assign_company_request', { p_request_id: id })
      if (error) throw error
      refresh()
    } catch (e) {
      setActionError(e.message || 'تعذّر استلام الطلب')
    } finally { setBusy(false) }
  }

  /** Open the publish dialog with the full picture, diff included. */
  const openPublish = async (jobId) => {
    setBusy(true)
    setActionError('')
    try {
      const { data, error } = await getSupabase()
        .rpc('admin_import_job_detail', { p_job_id: jobId, p_with_diff: true })
      if (error) throw error
      setConfirm(data)
    } catch (e) {
      setActionError(e.message || 'تعذّر فتح التفاصيل')
    } finally { setBusy(false) }
  }

  /** Publishing goes through the database, which re-checks everything. */
  const doPublish = async () => {
    setBusy(true)
    setActionError('')
    try {
      const { error } = await getSupabase().rpc('import_job_publish', {
        p_job_id: confirm.job.id, p_confirm_shrink: true,
      })
      if (error) throw error
      setConfirm(null)
      refresh()
    } catch (e) {
      setActionError(e.message || 'تعذّر النشر')
    } finally { setBusy(false) }
  }

  const workRow = (i, tone) => (
    <div key={`${i.kind}-${i.item_id}`} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '12px', padding: '12px 0', borderTop: '1px solid #F1F5F9', flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 0, flex: '1 1 260px' }}>
        <div style={{ fontSize: '12.5px', color: tone.fg, fontWeight: 700 }}>
          {tone.dot} {i.kind_label}
          {i.sla_state === 'late_resolution' && i.due_at ? ` · متأخّر ${overdueBy(i.due_at)}` : ''}
          {i.sla_state === 'late_response' ? ' · لم يُستلَم' : ''}
        </div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
          {i.company_name || i.title}
        </div>
        <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '2px' }}>
          {i.status_label}
          {' · '}{i.assignee || 'غير مُسنَد'}
          {i.due_at ? ` · المهلة ${fmtTime(i.due_at)}` : ''}
          {i.waiting_days ? ` · منذ ${i.waiting_days} يوم` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', flex: 'none' }}>
        {/* Shown only when the caller may do it and the item can take it. The
            database refuses it regardless — this is so nobody is offered a
            button that will only tell them no. */}
        {!i.assignee && i.assignable && can('work.assign_self') && (
          <button onClick={() => takeIt(i.item_id)} disabled={busy}
            aria-label={`استلام ${i.kind_label} — ${i.company_name || i.title}`}
            style={{ ...btn, minHeight: '36px', background: '#0F172A', color: '#fff', border: 0 }}>
            استلام
          </button>
        )}
        <button onClick={() => navigate(KIND_ROUTE[i.kind] || '/admin/work')}
          aria-label={`فتح ${i.kind_label} — ${i.company_name || i.title}`}
          style={{ ...btn, minHeight: '36px', background: '#fff', color: '#334155', border: '1.5px solid #E2E8F0' }}>
          فتح
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto' }}>

      {/* --- Header --- */}
      <header style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: '16px', flexWrap: 'wrap', marginBottom: '24px',
      }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>
            مركز القيادة
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
            نظرة تشغيلية فورية على ما يحتاج تدخّلك وحالة النظام.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span aria-live="polite" style={{
            fontSize: '12.5px', fontWeight: 700,
            color: staleMinutes >= 5 ? '#B45309' : '#94A3B8',
          }}>
            {staleMinutes >= 5
              ? `⚠ البيانات منذ ${staleMinutes} دقيقة`
              : `آخر تحديث ${since(refreshedAt)}`}
          </span>
          <button onClick={refresh} aria-label="تحديث كل الأقسام"
            style={{ ...btn, background: '#0F172A', color: '#fff', border: 0 }}>
            ↻ تحديث
          </button>
        </div>
      </header>

      {actionError && (
        <div role="alert" style={{
          background: TONE.critical.bg, border: `1px solid ${TONE.critical.bd}`,
          color: TONE.critical.fg, borderRadius: '10px', padding: '12px 18px',
          marginBottom: '12px', fontSize: '13.5px', fontWeight: 700,
        }}>{actionError}</div>
      )}

      {/* --- Critical alerts --- */}
      {alerts.map((a) => (
        <button key={a.key} onClick={() => navigate(a.to || '/admin/work')} style={{
          display: 'block', width: '100%', textAlign: 'right', cursor: 'pointer',
          background: TONE.critical.bg, border: `1px solid ${TONE.critical.bd}`,
          borderRadius: '12px', padding: '18px 24px', marginBottom: '12px',
          fontFamily: 'inherit',
        }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: TONE.critical.fg }}>
            🔴 {a.text}
          </div>
          {a.detail && (
            <div style={{ fontSize: '13.5px', color: '#7F1D1D', marginTop: '4px', lineHeight: 1.8 }}>
              {a.detail}
            </div>
          )}
          <div style={{ fontSize: '12.5px', color: TONE.critical.fg, marginTop: '8px', fontWeight: 700 }}>
            فتح التفاصيل ←
          </div>
        </button>
      ))}

      {/* --- KPI strip --- */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: '16px', marginBottom: '32px',
      }}>
        {[
          { k: 'now',   t: 'يحتاج تدخّلك', tone: 'critical', n: criticalItems.length + criticalHealth.length, sub: 'حرج', to: '/admin/work', st: items },
          { k: 'late',  t: 'متأخّر', tone: 'overdue', n: counts.data?.late, sub: 'تجاوز المهلة', to: '/admin/work?scope=late', st: counts },
          { k: 'waiting_them', t: 'بانتظار الشركة', tone: 'company', n: counts.data?.waiting_them, sub: 'الكرة عندهم', to: '/admin/work?scope=waiting_them', st: counts },
          { k: 'today', t: 'أُنجز اليوم', tone: 'done', n: today.data?.total, sub: 'قرار وإجراء', to: '/admin/work', st: today },
          // «غير مُسنَد» is a filter on the queue below, not a headline. Model
          // health is: it is the only figure here that says whether the rules
          // the product rests on are still holding.
          { k: 'health', t: 'صحّة النموذج', tone: healthBad ? 'critical' : 'done',
            n: healthBad, sub: healthBad ? 'يحتاج مراجعة' : 'سليم',
            to: '/admin/system-health', st: health },
        ].map((c) => {
          const tone = TONE[c.tone]
          return (
            <button key={c.k} onClick={() => navigate(c.to)}
              aria-label={`${c.t}: ${c.st.loading ? 'قيد التحميل' : (c.n ?? 0)}`}
              style={{ ...card, padding: '20px', cursor: 'pointer', textAlign: 'right', fontFamily: 'inherit', borderRight: `3px solid ${tone.fg}` }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                {tone.dot} {c.t}
              </div>
              <div style={{ fontSize: '32px', fontWeight: 700, color: '#0F172A', margin: '8px 0 2px' }}>
                {c.st.loading ? <span style={{ color: '#E2E8F0' }}>—</span>
                  : c.st.error ? <span style={{ color: '#FCA5A5', fontSize: '18px' }}>؟</span>
                    : (c.n ?? 0)}
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8' }}>{c.sub}</div>
            </button>
          )
        })}
      </div>

      {/* --- Needs you now --- */}
      <Section title="🔴 يحتاج تدخّلك الآن"
        note="عناصر تتطلّب قراراً أو تدخّلاً إدارياً."
        state={items} what="العناصر الحرجة"
        style={{ marginBottom: '24px' }}
        action={
          <div role="tablist" aria-label="تصفية الطابور"
            style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {SCOPES.map((sc) => (
              <button key={sc.v} role="tab" aria-selected={scope === sc.v}
                onClick={() => setScope(sc.v)}
                style={{
                  minHeight: '32px', padding: '0 12px', borderRadius: '999px',
                  fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1.5px solid ${scope === sc.v ? '#0F172A' : '#E2E8F0'}`,
                  background: scope === sc.v ? '#0F172A' : '#fff',
                  color: scope === sc.v ? '#fff' : '#475569',
                }}>
                {sc.t}{counts.data?.[sc.count] != null ? ` (${counts.data[sc.count]})` : ''}
              </button>
            ))}
          </div>
        }
        empty={!items.loading && !items.error && scoped.length === 0
          ? <Empty ok>{SCOPES.find((x) => x.v === scope)?.empty}</Empty> : null}>
        {scoped.slice(0, 8).map((i) => workRow(i, TONE[SCOPES.find((x) => x.v === scope)?.tone || 'critical']))}
      </Section>

      {/* --- Late / waiting --- */}
      <div className="marsad-cc-grid" style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: '24px', marginBottom: '24px',
      }}>
        <Section title="🟠 متأخّر" note="تجاوزت مهلتها، والكرة عندنا."
          state={late} what="المتأخّرات" style={{ alignSelf: 'start' }}
          empty={!late.loading && !late.error && (late.data || []).length === 0
            ? <Empty ok>✓ لا توجد طلبات متأخّرة.</Empty> : null}>
          {(late.data || []).slice(0, 6).map((i) => workRow(i, TONE.overdue))}
        </Section>

        {/* Waiting on the company is not a Marsad delay. It is never counted as
            overdue and never coloured as a fault — the clock is stopped. */}
        <Section title="🔵 بانتظار الشركة" note="الكرة عندهم — الساعة متوقّفة."
          state={waiting} what="ما ينتظر الشركات" style={{ alignSelf: 'start' }}
          empty={!waiting.loading && !waiting.error && (waiting.data || []).length === 0
            ? <Empty>لا توجد طلبات بانتظار الشركة.</Empty> : null}>
          {(waiting.data || []).slice(0, 6).map((i) => (
            <div key={i.item_id} style={{ padding: '12px 0', borderTop: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: '12.5px', color: TONE.company.fg, fontWeight: 700 }}>
                🔵 {i.kind_label}
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                {i.company_name || i.title}
              </div>
              <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '2px' }}>
                {i.status_label} · آخر تحديث {since(i.updated_at)}
                {i.assignee ? ` · ${i.assignee}` : ''}
              </div>
            </div>
          ))}
        </Section>
      </div>

      {/* --- Today / health --- */}
      <div className="marsad-cc-grid" style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: '24px', marginBottom: '24px',
      }}>
        <Section title="🟢 أُنجز اليوم" note="قرارات وإجراءات هذا اليوم."
          state={today} what="إنجاز اليوم" style={{ alignSelf: 'start' }}
          empty={!today.loading && !today.error && !(today.data?.total)
            ? <Empty>لم تُنجز أي إجراءات اليوم بعد.</Empty> : null}>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'baseline' }}>
            <span style={{ fontSize: '32px', fontWeight: 700, color: '#0F172A' }}>
              {today.data?.total ?? 0}
            </span>
            <span style={{ fontSize: '13.5px', color: '#64748B', lineHeight: 2 }}>
              {today.data?.approved ?? 0} قبول · {today.data?.rejected ?? 0} رفض ·
              {' '}{today.data?.clarified ?? 0} طلب توضيح · {today.data?.documents ?? 0} تدقيق مستند
              {today.data?.last_at ? ` · آخر قرار ${since(today.data.last_at)}` : ''}
            </span>
          </div>
        </Section>

        <Section title="🔴 صحّة النموذج" note="هل يعمل النظام وفق قواعده؟"
          state={health} what="صحّة النموذج" style={{ alignSelf: 'start' }}
          empty={!health.loading && !health.error && (health.data || []).length === 0
            ? <Empty ok>✓ النموذج سليم</Empty> : null}>
          {(health.data || []).map((h) => {
            const tone = h.status === 'critical' ? TONE.critical
              : h.status === 'warning' ? TONE.waiting : TONE.done
            const mark = h.status === 'critical' ? '🔴' : h.status === 'warning' ? '⚠' : '✓'
            const clickable = Number(h.n) > 0 && h.target
            return (
              <button key={h.key} disabled={!clickable}
                onClick={() => clickable && navigate(h.target)}
                aria-label={`${h.label}: ${h.n}`}
                style={{
                  display: 'flex', width: '100%', alignItems: 'flex-start', gap: '10px',
                  justifyContent: 'space-between', padding: '10px 0', background: 'none',
                  border: 0, borderTop: '1px solid #F1F5F9', textAlign: 'right',
                  fontFamily: 'inherit', cursor: clickable ? 'pointer' : 'default',
                }}>
                <span style={{ fontSize: '13px', color: tone.fg, fontWeight: 700, minWidth: 0 }}>
                  {mark} {h.label}
                  {h.detail && (
                    <span style={{ display: 'block', color: '#64748B', fontWeight: 400, fontSize: '12px', marginTop: '2px' }}>
                      {h.detail}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: tone.fg, flex: 'none' }}>
                  {h.n}
                </span>
              </button>
            )
          })}
        </Section>
      </div>

      {/* --- Official / registry --- */}
      <div className="marsad-cc-grid" style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: '24px', marginBottom: '24px',
      }}>
        <Section title="🏛 حالات رسمية جديدة" note="ما تقوله الوزارة، لا ما تقوله مرصد."
          state={official} what="الحالات الرسمية" style={{ alignSelf: 'start' }}
          action={(official.data || []).length > 0 ? (
            <button onClick={() => navigate('/admin/companies?filter=official_status')}
              style={{ background: 'none', border: 0, color: '#1D4ED8', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              عرض الكل ←
            </button>
          ) : null}
          empty={!official.loading && !official.error && (official.data || []).length === 0
            ? <Empty ok>✓ لا تغيّرات رسمية خلال آخر ٣٠ يوماً</Empty> : null}>
          {(official.data || []).slice(0, 6).map((o) => (
            <button key={o.company_id} onClick={() => navigate(`/admin/company/${o.company_id}`)}
              style={{
                display: 'block', width: '100%', textAlign: 'right', padding: '12px 0',
                borderTop: '1px solid #F1F5F9', background: 'none', border: 0,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{o.company_name}</div>
              <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '2px' }}>
                سجل {o.cr_number || '—'} · {since(o.changed_at)}
                {o.source ? ` · ${o.source}` : ''}
              </div>
              {/* Two claims, never merged. «Active in Marsad» and «in liquidation
                  at the Ministry» are both true, and flattening them into one
                  badge is the most dangerous thing this screen could do. */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: TONE.done.bg, color: TONE.done.fg }}>
                  مرصد: {o.marsad_status}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: TONE.critical.bg, color: TONE.critical.fg }}>
                  الوزارة: {o.official_status}
                </span>
              </div>
            </button>
          ))}
        </Section>

        <Section title="📦 السجل التجاري والاستيراد" note="المهمّة الجارية، والجيل المنشور."
          state={imports} what="حالة الاستيراد" style={{ alignSelf: 'start' }}
          empty={!imports.loading && !imports.error && (imports.data || []).length === 0
            ? <Empty>لا توجد مهامّ استيراد مسجّلة.</Empty> : null}>

          {runningJob && (
            <div style={{ padding: '12px 0', borderTop: '1px solid #F1F5F9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                  {runningJob.snapshot_period || runningJob.file_name}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: TONE.neutral.bg, color: TONE.neutral.fg }}>
                  {IMPORT_STATE[runningJob.status] || runningJob.status}
                </span>
              </div>
              <div role="progressbar" aria-valuenow={Number(runningJob.completeness ?? 0)}
                aria-valuemin={0} aria-valuemax={100}
                style={{ height: '8px', background: '#F1F5F9', borderRadius: '999px', margin: '10px 0 6px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, Number(runningJob.completeness ?? 0))}%`, height: '100%', background: TONE.neutral.fg }} />
              </div>
              <div style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.9 }}>
                متوقّع {num(runningJob.expected_rows)} · محمّل {num(runningJob.rows_loaded)} · مرفوض {num(runningJob.rows_rejected)}
                <div style={{ fontWeight: 700 }}>اكتمال {runningJob.completeness ?? 0}%</div>
              </div>

              {/* Only a generation that passed every check. The database refuses
                  it either way — this is so nobody is invited to try. */}
              {runningJob.status === 'ready' && can('data.publish') && (
                <button onClick={() => openPublish(runningJob.job_id)} disabled={busy}
                  style={{ ...btn, marginTop: '10px', background: '#16A34A', color: '#fff', border: 0 }}>
                  نشر هذه المجموعة
                </button>
              )}
            </div>
          )}

          {failedJob && (
            <div style={{ padding: '12px 0', borderTop: '1px solid #F1F5F9' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: TONE.critical.fg }}>
                🔴 فشل الاستيراد — {failedJob.snapshot_period}
              </div>
              <div style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.9, marginTop: '4px' }}>
                {failedJob.failure_reason}
                <div>محمّل {num(failedJob.rows_loaded)} · مرفوض {num(failedJob.rows_rejected)} · {fmtTime(failedJob.finished_at)}</div>
              </div>
            </div>
          )}

          {publishedJob && (
            <div style={{ padding: '12px 0', borderTop: '1px solid #F1F5F9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>
                  الجيل المنشور — {publishedJob.snapshot_period}
                </span>
                <span style={{
                  fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px',
                  background: Number(publishedJob.completeness) < 100 ? TONE.critical.bg : TONE.done.bg,
                  color: Number(publishedJob.completeness) < 100 ? TONE.critical.fg : TONE.done.fg,
                }}>منشورة</span>
              </div>
              <div style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.9, marginTop: '4px' }}>
                محمّل {num(publishedJob.rows_loaded)} من {num(publishedJob.expected_rows)}
                <div style={{
                  fontWeight: 700,
                  color: Number(publishedJob.completeness) < 100 ? TONE.critical.fg : TONE.done.fg,
                }}>اكتمال {publishedJob.completeness}%</div>
              </div>
            </div>
          )}
        </Section>
      </div>

      {/* --- Jobs / activity --- */}
      <div className="marsad-cc-grid" style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: '24px', marginBottom: '32px',
      }}>
        <Section title="⚙ المهامّ الخلفية" note="ما يعمل دون أن يراه أحد."
          state={jobs} what="المهامّ الخلفية" style={{ alignSelf: 'start' }}
          empty={!jobs.loading && !jobs.error && !jobs.data
            ? <Empty>لا توجد مهامّ خلفية مسجّلة.</Empty> : null}>
          {['cleanup', 'import'].map((k) => {
            const j = jobs.data?.[k]
            if (!j) return null
            // «Never run» is a state of its own. Showing it as «success, 0» is
            // how a job that never fires looks healthy forever.
            const st = j.status === 'success' ? TONE.done
              : j.status === 'failed' ? TONE.critical
                : j.status === 'never' ? TONE.neutral
                  : j.status === 'stalled' ? TONE.overdue : TONE.neutral
            const label = { success: 'نجح', failed: 'فشل', never: 'لم يعمل قطّ', stalled: 'متوقّف' }[j.status]
              || IMPORT_STATE[j.status] || j.status
            return (
              <div key={k} style={{ padding: '12px 0', borderTop: '1px solid #F1F5F9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{j.name}</span>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: st.fg }}>{st.dot} {label}</span>
                </div>
                <div style={{ fontSize: '12.5px', color: '#64748B', marginTop: '4px', lineHeight: 1.9 }}>
                  {k === 'cleanup'
                    ? <>آخر تشغيل {fmtTime(j.last_at)} · حرّر {j.released ?? 0} · الجدولة <code>{j.schedule}</code></>
                    : <>{j.period} · محمّل {num(j.loaded)} من {num(j.expected)}</>}
                </div>
              </div>
            )
          })}
        </Section>

        <Section title="🕘 النشاط التشغيلي" note="من فعل ماذا، ومتى."
          state={activity} what="سجلّ النشاط" style={{ alignSelf: 'start' }}
          empty={!activity.loading && !activity.error && (activity.data || []).length === 0
            ? <Empty>لا يوجد نشاط تشغيلي حديث.</Empty> : null}>
          {(activity.data || []).map((a, i) => (
            <div key={i} style={{
              display: 'flex', gap: '10px', padding: '9px 0',
              borderTop: i ? '1px solid #F1F5F9' : 0, fontSize: '13px', color: '#334155',
            }}>
              <span style={{ color: '#94A3B8', flex: 'none', fontSize: '12px', minWidth: '68px' }}>
                {fmtTime(a.at)}
              </span>
              {/* The Arabic comes from `activity_action_types()` with the row, so
                  no component keeps its own copy of the words. `a.action` is
                  still carried for anyone reading the log itself. */}
              <span style={{ minWidth: 0 }} title={a.action}>
                <b>{a.actor || 'النظام'}</b>
                <span style={{ color: '#64748B' }}> · {a.label || a.action}</span>
              </span>
            </div>
          ))}
        </Section>
      </div>

      {/* --- Publish confirmation --- */}
      {confirm && (
        <div role="dialog" aria-modal="true" aria-label="تأكيد نشر مجموعة السجل التجاري"
          onClick={(e) => e.target === e.currentTarget && setConfirm(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
          }}>
          <Card style={{ maxWidth: '620px', width: '100%', maxHeight: '86vh', overflowY: 'auto' }}>
            <h2 style={{ ...titleStyle, fontSize: '20px' }}>نشر مجموعة السجل التجاري</h2>
            <p style={noteStyle}>
              النشر يبدّل السجل الذي يقرأه المنتج كلّه. هذه أرقامه قبل التنفيذ.
            </p>

            <dl style={{ margin: 0, fontSize: '13.5px', color: '#334155', lineHeight: 2.2 }}>
              {[
                ['الفترة', confirm.job.snapshot_period],
                ['متوقّع', num(confirm.job.expected_rows)],
                ['محمّل', num(confirm.job.rows_loaded)],
                ['مرفوض', num(confirm.job.rows_rejected)],
                ['الأعداد متّسقة', confirm.job.accounted ? '✓ نعم' : '✗ لا'],
                ['اكتمال', `${confirm.job.completeness ?? 0}%`],
                ['بلا رقم سجل وله رقم موحّد', num(confirm.quality?.no_cr_with_unified)],
                ['بلا أي معرّف', num(confirm.quality?.no_identifier)],
                ['رقم سجل مكرّر', num(confirm.quality?.duplicate_cr)],
                ['رقم موحّد مكرّر', num(confirm.quality?.duplicate_unified)],
                ...(confirm.diff ? [
                  ['جديد', num(confirm.diff.new)],
                  ['متغيّر', num(confirm.diff.changed)],
                  ['محذوف من ملف الوزارة', num(confirm.diff.removed)],
                ] : []),
                ['المنشورة الآن', String(confirm.published_now || '—').slice(0, 8)],
                ['ستصبح المنشورة', String(confirm.job.dataset_id).slice(0, 8)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', borderBottom: '1px solid #F1F5F9' }}>
                  <dt style={{ color: '#64748B' }}>{k}</dt>
                  <dd style={{ margin: 0, fontWeight: 700 }}>{v}</dd>
                </div>
              ))}
            </dl>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
              <button onClick={doPublish} disabled={busy || !confirm.job.accounted}
                style={{
                  ...btn, background: confirm.job.accounted ? '#16A34A' : '#CBD5E1',
                  color: '#fff', border: 0,
                  cursor: confirm.job.accounted ? 'pointer' : 'not-allowed',
                }}>
                {busy ? 'جارٍ…' : 'تأكيد النشر'}
              </button>
              <button onClick={() => setConfirm(null)} disabled={busy}
                style={{ ...btn, background: '#fff', color: '#334155', border: '1.5px solid #E2E8F0' }}>
                إلغاء
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
