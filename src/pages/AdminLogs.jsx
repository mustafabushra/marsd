import { useState, useEffect, useMemo, useCallback } from 'react'
import { getSupabase } from '../lib/api'
import { Skeleton, SkeletonTable } from '../components/Skeleton'
import { Card } from '../ui'

/**
 * The platform's memory, made readable.
 *
 * ============================================================================
 * Why this was rebuilt
 * ============================================================================
 * Fifteen screens write to `audit_logs`. Every company approval, every
 * suspension, every export, every invitation lands there. The screen that read
 * it back showed a flat list of the newest fifty rows, stamped every one of
 * them «نجاح» whatever had actually happened, and offered no way to ask a
 * question — no filter, no search, no way to see what an entry was about.
 *
 * That made the audit trail effectively write-only. «من اعتمد هذه الشركة؟» and
 * «ماذا جرى أمس؟» are the two questions an audit trail exists to answer, and
 * neither could be asked. A trail nobody can query is a cost with no benefit:
 * it is still written on every action, and it still proves nothing.
 *
 * ============================================================================
 * What it does now
 * ============================================================================
 * Filters by action, by entity and by date, searches, resolves actor ids to
 * names, links an entry to the thing it happened to, and shows the `meta` the
 * writing screen recorded — which is usually the field that says why.
 *
 * The filtering runs in the database. Filtering a page you have already fetched
 * narrows the wrong fifty rows.
 */

// The actions the platform writes. Anything unlisted still appears — the label
// falls back to the raw action, which is visibly unlabelled rather than
// silently missing.
const ACTION_LABELS = {
  company_approved: 'اعتماد شركة',
  company_rejected: 'رفض شركة',
  company_suspended: 'إيقاف شركة',
  company_reactivated: 'إعادة تفعيل شركة',
  company_add_requested: 'طلب إضافة شركة',
  company_updated: 'تعديل بيانات شركة',
  company_merged: 'دمج شركتين',
  company_verification_granted: 'منح توثيق',
  company_verification_withdrawn: 'سحب توثيق',
  company_report_viewed: 'فتح تقرير شركة',
  company_add_suspended_on: 'إيقاف إضافة الشركات',
  company_add_suspended_off: 'رفع إيقاف الإضافة',
  report_submitted: 'إرسال تقرير',
  report_approved: 'اعتماد تقرير',
  report_rejected: 'رفض تقرير',
  added_to_watchlist: 'إضافة لقائمة المراقبة',
  removed_from_watchlist: 'حذف من قائمة المراقبة',
  user_invited: 'دعوة مستخدم',
  user_role_changed: 'تغيير صلاحية',
  data_exported: 'تصدير بيانات',
  plan_changed: 'تغيير باقة',
  subscription_changed: 'تغيير اشتراك',
  partnership_granted: 'منح شراكة',
  partnership_revoked: 'سحب شراكة',
}

/**
 * Which entries a person scanning the list should stop on.
 *
 * Not a severity — an audit trail holds no failures, only things that happened.
 * This marks the ones that removed access, withdrew a status, or took data out:
 * the entries somebody would come here looking for.
 */
const NOTABLE = /suspend|reject|withdraw|revoke|delete|export|merge|role_changed/

const entityPath = (entity, id) => {
  if (!id) return null
  if (entity === 'company') return `/admin/company/${id}`
  if (entity === 'report') return `/admin/reports?id=${id}`
  if (entity === 'tenant') return `/admin/tenants?id=${id}`
  return null
}

const PAGE = 50

export default function AdminLogs() {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [action, setAction] = useState('')
  const [entity, setEntity] = useState('')
  const [days, setDays] = useState('30')
  const [q, setQ] = useState('')

  // Names, so the list says who rather than showing a Clerk id. Fetched for the
  // rows on screen rather than joined: `actor_id` is text pointing at Clerk, so
  // PostgREST has no relationship to follow.
  const [actors, setActors] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const supabase = getSupabase()
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })

      if (action) query = query.eq('action', action)
      if (entity) query = query.eq('entity', entity)
      if (days !== 'all') {
        const since = new Date(Date.now() - Number(days) * 86400000).toISOString()
        query = query.gte('created_at', since)
      }
      if (q.trim()) {
        const term = `%${q.trim()}%`
        query = query.or(`entity_id.ilike.${term},actor_id.ilike.${term},action.ilike.${term}`)
      }

      const from = (page - 1) * PAGE
      const { data, count, error: err } = await query.range(from, from + PAGE - 1)
      if (err) throw err

      setLogs(data ?? [])
      setTotal(count ?? 0)

      const ids = [...new Set((data ?? []).map((l) => l.actor_id).filter(Boolean))]
      if (ids.length) {
        // public.users has first_name and last_name; there is no full_name.
        // Asking for it made PostgREST refuse the whole request with 42703, so
        // the lookup returned nothing and every entry in the audit log was
        // attributed to a raw Clerk id instead of a person. The error was
        // swallowed — `data` was destructured without `error` — which is why a
        // log nobody could read still looked like it was working.
        const { data: people, error: peopleErr } = await supabase
          .from('users').select('id, email, first_name, last_name').in('id', ids)
        if (peopleErr) throw peopleErr
        setActors(Object.fromEntries((people ?? []).map((u) => {
          const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
          return [u.id, name || u.email]
        })))
      }
    } catch (e) {
      setError(e.message || 'تعذّر تحميل السجل')
    } finally {
      setLoading(false)
    }
  }, [action, entity, days, q, page])

  useEffect(() => { load() }, [load])
  // Any filter change invalidates the page number: page 3 of the old result set
  // is not page 3 of the new one.
  useEffect(() => { setPage(1) }, [action, entity, days, q])

  const entities = useMemo(
    () => [...new Set(logs.map((l) => l.entity).filter(Boolean))].sort(), [logs])

  const pages = Math.max(1, Math.ceil(total / PAGE))

  const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }
  const input = {
    padding: '9px 12px', border: '1.5px solid #E2E8F0', borderRadius: '9px',
    fontSize: '13px', fontFamily: 'inherit', background: '#fff', minWidth: '150px',
  }

  return (
    <div>
      <h1 style={{ fontSize: '23px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px' }}>
        سجل العمليات
      </h1>
      <p style={{ fontSize: '14px', color: '#64748B', margin: '0 0 20px', lineHeight: 1.9 }}>
        كل إجراء تم على المنصة — من فعله، ومتى، وعلى ماذا. لا يُعدَّل ولا يُحذف.
      </p>

      <Card style={{ padding: '16px', marginBottom: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={action} onChange={(e) => setAction(e.target.value)} style={input}>
          <option value="">كل الإجراءات</option>
          {Object.entries(ACTION_LABELS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>

        <select value={entity} onChange={(e) => setEntity(e.target.value)} style={input}>
          <option value="">كل الكيانات</option>
          {entities.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>

        <select value={days} onChange={(e) => setDays(e.target.value)} style={input}>
          <option value="1">آخر 24 ساعة</option>
          <option value="7">آخر 7 أيام</option>
          <option value="30">آخر 30 يوماً</option>
          <option value="90">آخر 90 يوماً</option>
          <option value="all">كل الفترة</option>
        </select>

        <input value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="ابحث برقم كيان أو معرّف مستخدم…"
               style={{ ...input, flex: 1, minWidth: '220px' }} />

        {(action || entity || q || days !== '30') && (
          <button onClick={() => { setAction(''); setEntity(''); setQ(''); setDays('30') }}
                  style={{ ...input, cursor: 'pointer', fontWeight: 800, color: '#1E2A52', minWidth: 0 }}>
            مسح الفلاتر
          </button>
        )}
      </Card>

      <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 700, marginBottom: '10px' }}>
        {loading ? <Skeleton w={90} h={13} style={{ display: 'inline-block', verticalAlign: 'middle' }} /> : `${total} عملية`}
        {!loading && total > PAGE && ` · صفحة ${page} من ${pages}`}
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: '11px', padding: '14px 16px', marginBottom: '14px', fontSize: '13.5px', fontWeight: 700 }}>
          {error}
        </div>
      )}

      {!loading && !logs.length && !error && (
        <Card style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontSize: '14px' }}>
          لا عمليات تطابق هذه الفلاتر.
        </Card>
      )}

      <div style={{ display: 'grid', gap: '8px' }}>
        {logs.map((log) => {
          const notable = NOTABLE.test(log.action || '')
          const path = entityPath(log.entity, log.entity_id)
          const meta = log.meta && typeof log.meta === 'object' ? log.meta
            : (() => { try { return JSON.parse(log.meta) } catch { return null } })()

          return (
            <div key={log.id} style={{
              ...card, padding: '13px 16px',
              borderInlineStartWidth: '4px',
              borderInlineStartColor: notable ? '#DC2626' : '#E2E8F0',
            }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span style={{ fontSize: '14px', fontWeight: 800, color: notable ? '#B91C1C' : '#0F172A' }}>
                  {ACTION_LABELS[log.action] || log.action}
                </span>

                <span style={{ fontSize: '12.5px', color: '#475569', fontWeight: 700 }}>
                  {actors[log.actor_id] || (log.actor_id ? 'مستخدم غير معروف' : 'النظام')}
                </span>

                {log.actor_role && (
                  <span style={{ background: '#F1F5F9', color: '#64748B', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 800 }}>
                    {log.actor_role}
                  </span>
                )}

                <span style={{ marginInlineStart: 'auto', fontSize: '12px', color: '#94A3B8', direction: 'ltr' }}>
                  {new Date(log.created_at).toLocaleString('en-GB')}
                </span>
              </div>

              {(log.entity || meta) && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginTop: '7px', fontSize: '12px', color: '#64748B' }}>
                  {log.entity && (
                    <span>
                      {log.entity}
                      {log.entity_id && (
                        path
                          ? <a href={path} style={{ color: '#1E2A52', fontWeight: 700, marginInlineStart: '5px' }}>فتح ↗</a>
                          : <code style={{ direction: 'ltr', marginInlineStart: '5px', fontSize: '11px' }}>{String(log.entity_id).slice(0, 8)}</code>
                      )}
                    </span>
                  )}
                  {/* What the writing screen thought was worth recording. Shown
                      rather than hidden behind a toggle: it is usually the one
                      field that says why, and a reason nobody reads is a reason
                      nobody bothers to write. */}
                  {meta && Object.entries(meta).slice(0, 4).map(([k, v]) => (
                    <span key={k} style={{ background: '#F8FAFC', borderRadius: '6px', padding: '2px 8px' }}>
                      {k}: {String(v).slice(0, 60)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', gap: '9px', justifyContent: 'center', marginTop: '18px' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ ...input, cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.5 : 1, fontWeight: 800 }}>
            السابق
          </button>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}
                  style={{ ...input, cursor: page >= pages ? 'default' : 'pointer', opacity: page >= pages ? 0.5 : 1, fontWeight: 800 }}>
            التالي
          </button>
        </div>
      )}
    </div>
  )
}
