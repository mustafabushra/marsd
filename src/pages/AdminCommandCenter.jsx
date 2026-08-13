import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabase } from '../lib/api'
import { docLabel } from '../lib/enums'
import { S, NAVY, GREEN, BRAND, OK, TONE as TINT, card, innerCard, btnPrimary, btnGhost } from '../styles/adminTheme'

/**
 * /admin/command-center — مركز الإجراءات
 *
 * What needs a decision, ranked, with the evidence attached and somewhere to
 * click. Not a dashboard: a dashboard answers «how are we doing», and this
 * answers «what do I do next».
 *
 * ============================================================================
 * Every section loads on its own
 * ============================================================================
 * Six independent states. A failing trust query must not blank the queue beside
 * it, which is why there is no page-level spinner in this file.
 *
 * ============================================================================
 * No number is invented here
 * ============================================================================
 * Every figure traces to a function or a table that owns it. The tiles read
 * `admin_work_counts().by_kind` — the same call the sidebar badges read, so a
 * tile and the badge beside it cannot disagree. The trust panel is computed
 * from `company_roster`, and says what it actually measured rather than
 * borrowing a more impressive label.
 *
 * ============================================================================
 * Every button does something
 * ============================================================================
 * There is no «quick approve»: approval means a different thing for a
 * registration, a claim, a document and a report, and no single RPC spans them.
 * So the card offers the three acts that are real — take it, open the queue
 * where the decision is made with its evidence, open the company file.
 */

const TONE = {
  critical: { fg: '#b91c1c', bg: '#fef2f2', bd: '#fecaca' },
  high:     { fg: '#c2410c', bg: '#fff7ed', bd: '#fed7aa' },
  normal:   { fg: S[600], bg: S[50], bd: S[200] },
}

// Where the decision is actually made, per kind.
const KIND_ROUTE = {
  registration: '/admin/company-requests?kind=registration',
  claim: '/admin/claim-requests',
  data_update: '/admin/requests',
  document_review: '/admin/documents?tab=pending',
  report_review: '/admin/reports',
  dispute: '/admin/disputes',
}

const OFFICIAL_LABEL = {
  insolvency: 'تعثّر مالي', suspended: 'إيقاف نشاط', liquidation: 'تصفية',
  bankruptcy: 'إفلاس', struck_off: 'شطب السجل',
}

// البلاطة رقم يُضغط. فإن عدّت من مصدر وفتحت شاشة تقرأ مصدراً آخر، فهي تكذب —
// وهذا ما كان يحدث: «١ تقرير للمراجعة» تفتح /admin/reports التي تُصفّي على
// pending_review وحدها، والتقرير الوحيد حالته request_info، فتُفتح الشاشة
// فارغة. ومثلها «١ طلب انضمام» تعدّ company_requests وتفتح شاشة تقرأ
// companies.status.
//
// القاعدة الآن: وجهة كل بلاطة تقرأ نفس ما عدّته.
//   - أنواع الطابور الأربعة → مركز العمل مُصفّى بالنوع، وهو حرفياً
//     admin_work_items، أي نفس دالة العدّ.
//   - المستندات → documents_overview، وهي مصدر الشاشة نفسها.
//   - الثقة → فلتر في سجلّ الشركات يعرض الشركات المعدودة عينها.
const TILES = [
  { key: 'report_review',   t: 'تقارير للمراجعة', tone: 'red',    icon: '📄', to: '/admin/work?kind=report_review' },
  // «تنبيهات الثقة» كان اسماً يصطدم بـ«تنبيهات المراقبة الفورية» أسفل الصفحة،
  // وهما يعدّان شيئين مختلفين — درجة متدنّية هنا، وملاحظات جودة أو حالة رسمية
  // هناك. فيقرأ المشرف رقمين متجاورين باسم واحد ويظنّ أحدهما خطأً.
  { key: 'trust',           t: 'مؤشر ثقة منخفض',  tone: 'red',    icon: '📉', to: '/admin/companies?filter=low_trust' },
  { key: 'registration',    t: 'طلبات انضمام',    tone: 'orange', icon: '👥', to: '/admin/company-requests?kind=registration' },
  { key: 'claim',           t: 'طلبات ملكية',     tone: 'orange', icon: '🛡', to: '/admin/work?kind=claim' },
  { key: 'document_review', t: 'تحقق مستندات',    tone: 'orange', icon: '🗂', to: '/admin/documents?tab=pending' },
  { key: 'dispute',         t: 'اعتراضات نشطة',   tone: 'navy',   icon: '⚖', to: '/admin/work?kind=dispute' },
]

const RED_TXT = '#B91C1C'

const num = (n) => Number(n ?? 0).toLocaleString('en')

const since = (t) => {
  if (!t) return '—'
  const m = Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 60000))
  if (m < 1) return 'الآن'
  if (m < 60) return `منذ ${m} دقيقة`
  const h = Math.round(m / 60)
  if (h < 24) return `منذ ${h} ساعة`
  return `منذ ${Math.round(h / 24)} يوم`
}

const overdueBy = (due) => {
  if (!due) return ''
  const h = Math.round((Date.now() - new Date(due).getTime()) / 3600000)
  if (h < 1) return 'أقل من ساعة'
  if (h < 24) return `${h} ساعة`
  return `${Math.round(h / 24)} يوم`
}

/** Where a score sits, in words. */
const band = (s) => s >= 80 ? { t: 'عالي جداً (ممتاز)', fg: '#15803D' }
  : s >= 65 ? { t: 'جيد', fg: '#65A30D' }
    : s >= 50 ? { t: 'متوسط', fg: '#B45309' }
      : { t: 'منخفض', fg: '#B91C1C' }

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

/**
 * The trust panel, and the monitoring alerts under it, from one roster read.
 *
 * Both describe the same population, so computing them from two queries would
 * be two opinions about how many companies there are.
 */
const rosterSummary = async (sb) => {
  const { data, error } = await sb.rpc('company_roster')
  if (error) throw error
  const rows = (data || []).filter((r) => r.approved)

  // صفر يعني «غير مصنّفة»، لا «ثقتها صفر».
  //
  // نموذج الثقة يعطي الطبقة المجتمعية نصف الوزن، فشركة بلا تقارير معتمدة
  // تُخزَّن بـ score = 0 و tier = 'none' — أي أن الدرجة لم تُحتسب أصلاً.
  // وأدنى درجة محتسَبة هي ٥ لأن الـ clamp يضع أرضية عندها، فالصفر لا يمكن
  // أن يكون ناتج حساب. جمع هذه الأصفار في متوسط كان يعرض «٠٫٠٪ — منخفض»
  // على منصّة كل شركاتها ببساطة لم تُقيَّم بعد.
  const rated = rows.filter((r) => r.trust_score != null && Number(r.trust_score) > 0)
  const avg = rated.length
    ? rated.reduce((a, r) => a + Number(r.trust_score), 0) / rated.length
    : null
  const clean = rows.filter((r) => !(r.quality_issues || []).length).length

  // Anything Marsad would want to look at today, worst first.
  const alerts = rows
    .filter((r) => (r.official_status && r.official_status !== 'none')
      || (r.quality_issues || []).length || r.open_clarifications > 0)
    .sort((a, b) => (Number(a.trust_score ?? 999) - Number(b.trust_score ?? 999)))
    .slice(0, 6)

  return {
    avg,
    total: rows.length,
    rated: rated.length,
    // شركة مصنّفة ودرجتها متدنّية — لا شركة لم تُقيَّم بعد. كانت الأخيرة
    // تُحسب «تنبيه ثقة»، فيقرأ المشرف إنذاراً حيث لا يوجد إلا غياب بيانات.
    lowTrust: rated.filter((r) => Number(r.trust_score) < 50).length,
    unrated: rows.length - rated.length,
    cleanPct: rows.length ? (clean / rows.length) * 100 : null,
    alerts,
  }
}

/**
 * المستندات المنتظرة — مجمّعة بالشركة للأدلة، ومعدودة للبلاطة.
 *
 * البلاطة كانت تقرأ by_kind.document_review، وهو عدّ صفوف في
 * company_requests من نوع «طلب مراجعة مستند» — لا عدّ المستندات نفسها. فكانت
 * تقول صفراً بينما خمسة مستندات تنتظر التوثيق في company_documents. الرقم
 * والشاشة الآن من documents_overview كلاهما.
 */
const pendingDocs = async (sb) => {
  const { data, error } = await sb.rpc('documents_overview', { p_state: 'pending' })
  if (error) throw error
  const items = data?.items || []
  const by = {}
  for (const d of items) {
    if (!d.company_id) continue
    ;(by[d.company_id] = by[d.company_id] || []).push(d)
  }
  return { by, total: items.length }
}

const shell = { ...card, padding: '22px' }
const btn = {
  minHeight: '38px', padding: '0 16px', borderRadius: '10px', fontSize: '12.5px',
  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
}

function Bars ({ lines = 3 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{
          height: '16px', background: '#F1F5F9', borderRadius: '6px',
          marginBottom: '10px', width: `${100 - i * 12}%`,
        }} />
      ))}
    </div>
  )
}

function Failed ({ what, message, onRetry }) {
  return (
    <div role="alert" style={{ fontSize: '13px', color: '#B45309', lineHeight: 1.9 }}>
      تعذّر تحميل {what}
      <div style={{ color: '#94A3B8', fontSize: '12px' }}>{String(message).slice(0, 120)}</div>
      <button onClick={onRetry} style={{
        ...btn, marginTop: '8px', minHeight: '34px', background: '#fff',
        border: '1.5px solid #E2E8F0', color: '#334155',
      }}>إعادة المحاولة</button>
    </div>
  )
}

export default function AdminCommandCenter () {
  const navigate = useNavigate()
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [onlyUrgent, setOnlyUrgent] = useState(false)

  const perms   = useSection(rpc('my_permissions'), [])
  const counts  = useSection(rpc('admin_work_counts'), [tick])
  const items   = useSection(rpc('admin_work_items', { p_scope: 'all', p_limit: 200 }), [tick])
  const roster  = useSection(rosterSummary, [tick])
  const docs    = useSection(pendingDocs, [tick])

  const can = useMemo(() => {
    const keys = new Set((perms.data || []).map((p) => p.key))
    return (k) => keys.has(k)
  }, [perms.data])

  const refresh = () => { setTick((t) => t + 1); setActionError('') }

  const byKind = counts.data?.by_kind || {}
  const all = items.data || []
  const urgent = all.filter((i) => i.priority === 'critical')
  const shown = onlyUrgent ? urgent : all
  const openTotal = counts.data?.all ?? all.length

  // كل بلاطة من المصدر الذي تفتحه وجهتها — لا من by_kind دائماً.
  const tileValue = (key) => {
    if (key === 'trust') return roster.data?.lowTrust ?? null
    if (key === 'document_review') return docs.data?.total ?? null
    return byKind[key] || 0
  }

  /** Take a request. The database checks the same permission again. */
  const takeIt = async (id) => {
    setBusy(true); setActionError('')
    try {
      const { error } = await getSupabase().rpc('assign_company_request', { p_request_id: id })
      if (error) throw error
      refresh()
    } catch (e) {
      setActionError(e.message || 'تعذّر استلام الطلب')
    } finally { setBusy(false) }
  }

  const avg = roster.data?.avg
  const avgBand = avg != null ? band(avg) : null

  return (
    <div style={{ maxWidth: '1500px', margin: '0 auto' }}>

      {/* ---------------------------------------------------------------- */}
      {/* Header                                                            */}
      {/* ---------------------------------------------------------------- */}
      <section style={{ ...shell, padding: '26px 28px', marginBottom: '18px' }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: '18px', flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 0 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: BRAND[50], color: NAVY,
              border: `1px solid ${BRAND[100]}`, borderRadius: '999px', padding: '4px 12px',
              fontSize: '12px', fontWeight: 600, marginBottom: '10px',
            }}>⚡ مركز الإجراءات والتدقيق المباشر</span>

            <h1 style={{ fontSize: '30px', fontWeight: 700, color: S[900], margin: '0 0 8px', letterSpacing: '-.02em' }}>
              مركز الإجراءات
            </h1>
            <p style={{ fontSize: '14px', color: S[500], margin: 0 }}>
              {items.loading
                ? 'جارٍ حساب ما يحتاج قراراً…'
                : openTotal > 0
                  ? <>لديك <strong style={{ color: RED_TXT, fontWeight: 800 }}>{num(openTotal)} إجراءً</strong> يحتاج انتباهك الفوري والمراجعة</>
                  : 'لا يوجد عمل مفتوح — كل الطوابير فارغة.'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/admin/work')}
              style={{ ...btnPrimary, minHeight: '42px' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = BRAND[700] }}
              onMouseLeave={(e) => { e.currentTarget.style.background = NAVY }}>
              فتح صندوق المراجعة الموحد ‹
            </button>
            <button onClick={() => navigate('/admin/trust-score')}
              style={{ ...btnGhost, minHeight: '42px' }}>
              مراقبة مؤشر الثقة
            </button>
            <button onClick={refresh} aria-label="تحديث كل الأقسام"
              style={{ ...btnGhost, minHeight: '42px', padding: '10px 14px' }}>
              ↻
            </button>
          </div>
        </div>
      </section>

      {actionError && (
        <div role="alert" style={{
          background: TONE.critical.bg, border: `1px solid ${TONE.critical.bd}`,
          color: TONE.critical.fg, borderRadius: '10px', padding: '12px 18px',
          marginBottom: '14px', fontSize: '13.5px', fontWeight: 700,
        }}>{actionError}</div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Six tiles                                                         */}
      {/* ---------------------------------------------------------------- */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))',
        gap: '14px', marginBottom: '18px',
      }}>
        {TILES.map((tile) => {
          const v = tileValue(tile.key)
          const dead = tile.key === 'trust' ? roster.error
            : tile.key === 'document_review' ? docs.error
              : counts.error
          const c = TINT[tile.tone]
          return (
            <button key={tile.key} onClick={() => navigate(tile.to)}
              aria-label={`${tile.t} — ${v == null ? 'غير متاح' : num(v)}`}
              onMouseEnter={(e) => { e.currentTarget.style.background = c.hover }}
              onMouseLeave={(e) => { e.currentTarget.style.background = c.bg }}
              style={{
                background: c.bg, border: `1px solid ${c.bd}`, borderRadius: '12px',
                padding: '16px', cursor: 'pointer', textAlign: 'right',
                fontFamily: 'inherit', display: 'flex', flexDirection: 'column',
                boxShadow: '0 1px 2px 0 rgba(0,0,0,.05)', transition: 'background .15s',
              }}>
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '8px',
              }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: c.fg }} />
                <span style={{ fontSize: '13px', opacity: .85 }}>{tile.icon}</span>
              </span>
              <span style={{
                fontSize: '24px', fontWeight: 700, lineHeight: 1.1, marginBottom: '4px',
                color: c.fg, fontVariantNumeric: 'tabular-nums',
              }}>
                {dead ? '—' : (v == null ? '·' : num(v))}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 500, color: c.tx }}>
                {tile.t}
              </span>
            </button>
          )
        })}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Inbox + aside                                                     */}
      {/* ---------------------------------------------------------------- */}
      <div className="marsad-cc-grid" style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 2.1fr) minmax(280px, 1fr)',
        gap: '18px', alignItems: 'start',
      }}>

        {/* ---------------- The queue ---------------- */}
        <section style={shell} aria-label="صندوق الإجراءات العاجلة والأولويات">
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '12px', flexWrap: 'wrap', marginBottom: '16px',
          }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: S[900], margin: 0 }}>
              🕐 صندوق الإجراءات العاجلة والأولويات
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: S[400], fontWeight: 500 }}>تصفية:</span>
              {[{ v: false, t: 'الكل' }, { v: true, t: 'عاجل فقط' }].map((f) => (
                <button key={String(f.v)} onClick={() => setOnlyUrgent(f.v)}
                  aria-pressed={onlyUrgent === f.v}
                  style={{
                    minHeight: '30px', padding: '0 14px', fontSize: '11px', fontWeight: 700,
                    borderRadius: '999px', cursor: 'pointer', fontFamily: 'inherit',
                    background: onlyUrgent === f.v ? NAVY : '#fff',
                    color: onlyUrgent === f.v ? '#fff' : S[700],
                    border: onlyUrgent === f.v ? 0 : `1px solid ${S[200]}`,
                  }}>
                  {f.t}{f.v && urgent.length > 0 ? ` (${urgent.length})` : ''}
                </button>
              ))}
            </div>
          </div>

          {items.loading ? <Bars lines={5} />
            : items.error ? <Failed what="الطوابير" message={items.error} onRetry={items.reload} />
              : shown.length === 0 ? (
                <div style={{ fontSize: '13.5px', color: '#15803D', fontWeight: 700, lineHeight: 2 }}>
                  ✓ {onlyUrgent ? 'لا توجد إجراءات عاجلة الآن.' : 'لا يوجد عمل مفتوح.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {shown.map((i) => {
                    const tone = TONE[i.priority] || TONE.normal
                    const late = ['late_response', 'late_resolution'].includes(i.sla_state)
                    const evidence = (docs.data?.by || {})[i.company_id] || []
                    return (
                      <article key={`${i.kind}-${i.item_id}`} style={{
                        border: `1px solid ${S[200]}`, borderRadius: '12px', padding: '16px',
                        background: '#fff',
                      }}>
                        {/* Who, and how loud */}
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          gap: '10px', flexWrap: 'wrap', marginBottom: '4px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                            <span style={{
                              background: BRAND[50], border: `1px solid ${BRAND[100]}`,
                              borderRadius: '8px', padding: '5px 7px',
                              fontSize: '13px', flex: 'none',
                            }}>🏢</span>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: S[900] }}>
                              {i.company_name || i.title}
                            </span>
                          </div>
                          <span style={{
                            background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}`,
                            borderRadius: '999px', padding: '3px 11px', fontSize: '11.5px',
                            fontWeight: 800, flex: 'none',
                          }}>
                            {i.priority === 'critical' ? '🔴 عاجل للغاية'
                              : i.priority === 'high' ? '🟠 عاجل' : i.status_label}
                          </span>
                        </div>

                        <div style={{ fontSize: '12.5px', color: '#64748B', marginBottom: '12px' }}>
                          {i.kind_label}
                          {' · '}{i.assignee ? `مُسنَد إلى ${i.assignee}` : 'غير مُسنَد'}
                          {' · '}{since(i.created_at)}
                        </div>

                        {/* Why it is loud. Only when there is a reason. */}
                        {(late || i.sla_state === 'due_soon') && (
                          <div style={{
                            background: late ? TONE.critical.bg : TONE.high.bg,
                            border: `1px solid ${late ? TONE.critical.bd : TONE.high.bd}`,
                            color: late ? TONE.critical.fg : TONE.high.fg,
                            borderRadius: '9px', padding: '9px 13px', marginBottom: '10px',
                            fontSize: '12.5px', fontWeight: 700,
                          }}>
                            ⚠ {i.sla_state === 'late_response' ? 'لم يُستلَم خلال المهلة'
                              : i.sla_state === 'late_resolution' ? `تجاوز مهلة الإنجاز بـ ${overdueBy(i.due_at)}`
                                : 'تقترب مهلة الإنجاز'}
                          </div>
                        )}

                        <div style={{
                          background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: '9px',
                          padding: '11px 14px', fontSize: '13px', color: '#334155', lineHeight: 1.9,
                        }}>
                          {i.status_label}
                          {i.waiting_days > 0 && ` — بانتظار قرار منذ ${i.waiting_days} يوم`}
                          {i.due_at && ` · المهلة ${new Date(i.due_at).toLocaleDateString('ar-SA')}`}
                        </div>

                        {/* Evidence, when this company has paperwork waiting. */}
                        {evidence.length > 0 && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            flexWrap: 'wrap', marginTop: '10px',
                          }}>
                            <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>
                              المستندات المرفقة:
                            </span>
                            {evidence.slice(0, 3).map((d) => (
                              <span key={d.id} style={{
                                background: '#F8FAFC', border: '1px solid #E2E8F0',
                                borderRadius: '7px', padding: '4px 10px', fontSize: '11.5px',
                                fontWeight: 700, color: '#475569',
                              }}>
                                📄 {docLabel(d.doc_type)}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* What you can do about it. */}
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          gap: '10px', flexWrap: 'wrap', marginTop: '12px', paddingTop: '10px',
                          borderTop: `1px solid ${S[100]}`,
                        }}>
                          {i.company_id ? (
                            <button onClick={() => navigate(`/admin/company/${i.company_id}`)}
                              style={{
                                minHeight: '30px', padding: 0, background: 'none', border: 0,
                                color: NAVY, fontSize: '12px', fontWeight: 700,
                                cursor: 'pointer', fontFamily: 'inherit',
                              }}>
                              عرض ملف الفحص والملكية الكامل ↗
                            </button>
                          ) : <span />}

                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {!i.assignee && i.assignable && can('work.assign_self') && (
                              <button onClick={() => takeIt(i.item_id)} disabled={busy}
                                aria-label={`استلام ${i.kind_label} — ${i.company_name || i.title}`}
                                style={{
                                  padding: '6px 14px', borderRadius: '8px', background: NAVY,
                                  color: '#fff', border: 0, fontSize: '12px', fontWeight: 600,
                                  cursor: 'pointer', fontFamily: 'inherit', opacity: busy ? .6 : 1,
                                }}>
                                ⊙ استلام
                              </button>
                            )}
                            <button onClick={() => navigate(KIND_ROUTE[i.kind] || '/admin/work')}
                              style={{
                                padding: '6px 14px', borderRadius: '8px', background: S[100],
                                color: S[700], border: `1px solid ${S[200]}`, fontSize: '12px',
                                fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                              }}>
                              مراجعة مع الملاحظات
                            </button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
        </section>

        {/* ---------------- Aside ---------------- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', minWidth: 0 }}>

          {/* Trust */}
          <section style={shell} aria-label="مؤشر الثقة الوطني للمنصة">
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '10px', borderBottom: `1px solid ${S[100]}`, paddingBottom: '12px', marginBottom: '14px',
            }}>
              <h2 style={{ fontSize: '14px', fontWeight: 700, color: S[900], margin: 0 }}>
                🏅 مؤشر الثقة الوطني للمنصة
              </h2>
              {avg != null && (
                <span style={{
                  background: OK[50], color: OK[700], border: `1px solid ${OK[200]}`,
                  borderRadius: '6px', padding: '2px 8px', fontSize: '10px', fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums', flex: 'none',
                }}>{avg.toFixed(1)}%</span>
              )}
            </div>

            {roster.loading ? <Bars lines={3} />
              : roster.error ? <Failed what="مؤشر الثقة" message={roster.error} onRetry={roster.reload} />
                : avg == null ? (
                  // لا متوسط لأن لا شركة مصنّفة — وهذا خبر، لا فراغ.
                  <div style={{ fontSize: '13px', color: S[600], lineHeight: 1.9 }}>
                    لا توجد شركة مصنّفة بعد.
                    <div style={{ fontSize: '12px', color: S[500], marginTop: '4px' }}>
                      {num(roster.data.unrated)} من {num(roster.data.total)} شركة معتمدة بلا درجة.
                      الطبقة المجتمعية نصف وزن المؤشر، ولا تُحتسب قبل ورود تقارير معتمدة.
                    </div>
                    <div style={{ ...innerCard, padding: '12px', marginTop: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#d97706' }}>
                        {roster.data.cleanPct == null ? '—' : `${roster.data.cleanPct.toFixed(1)}%`}
                      </div>
                      <div style={{ fontSize: '11px', color: S[500], marginTop: '2px' }}>
                        سجلات بلا ملاحظات جودة
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      fontSize: '12px', fontWeight: 500, color: S[600], marginBottom: '8px',
                    }}>
                      <span>متوسط الشفافية المسجلة</span>
                      <span style={{ color: avgBand.fg, fontWeight: 700 }}>{avgBand.t}</span>
                    </div>

                    {/* الشريط بحشوة داخلية وحدّ — كما في النموذج. */}
                    <div style={{
                      height: '12px', background: S[100], borderRadius: '999px',
                      border: `1px solid ${S[200]}`, padding: '2px', marginBottom: '14px',
                    }}>
                      <div style={{
                        width: `${Math.min(100, Math.max(0, avg))}%`, height: '100%',
                        background: GREEN, borderRadius: '999px',
                      }} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', textAlign: 'center' }}>
                      <div style={{ ...innerCard, padding: '12px' }}>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: NAVY }}>
                          {num(roster.data.total)}
                        </div>
                        <div style={{ fontSize: '11px', color: S[500], marginTop: '2px' }}>
                          شركة مسجَّلة ومعتمدة
                        </div>
                      </div>
                      <div style={{ ...innerCard, padding: '12px' }}>
                        <div style={{ fontSize: '20px', fontWeight: 800, color: '#d97706' }}>
                          {roster.data.cleanPct == null ? '—' : `${roster.data.cleanPct.toFixed(1)}%`}
                        </div>
                        <div style={{ fontSize: '11px', color: S[500], marginTop: '2px' }}>
                          سجلات بلا ملاحظات جودة
                        </div>
                      </div>
                    </div>
                  </>
                )}
          </section>

          {/* Monitoring */}
          <section style={shell} aria-label="تنبيهات المراقبة الفورية">
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '10px', borderBottom: `1px solid ${S[100]}`, paddingBottom: '12px', marginBottom: '14px',
            }}>
              <h2 style={{ fontSize: '14px', fontWeight: 700, color: S[900], margin: 0 }}>
                ⚠ سجلات عليها ملاحظات
              </h2>
              {roster.data?.alerts?.length > 0 && (
                <span style={{ fontSize: '11.5px', color: S[500], fontWeight: 600 }}>
                  {roster.data.alerts.length} شركة
                </span>
              )}
            </div>

            {roster.loading ? <Bars lines={3} />
              : roster.error ? <Failed what="التنبيهات" message={roster.error} onRetry={roster.reload} />
                : !roster.data.alerts.length ? (
                  <div style={{ fontSize: '13px', color: '#15803D', fontWeight: 700, lineHeight: 1.9 }}>
                    ✓ لا توجد تنبيهات مراقبة.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {roster.data.alerts.map((a) => (
                      <button key={a.company_id}
                        onClick={() => navigate(`/admin/company/${a.company_id}`)}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#d8b4fe' }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = S[200] }}
                        style={{
                          background: S[50], border: `1px solid ${S[200]}`, borderRadius: '12px',
                          padding: '12px', textAlign: 'right', cursor: 'pointer',
                          fontFamily: 'inherit', width: '100%', transition: 'border-color .15s',
                        }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: S[900], marginBottom: '4px' }}>
                          {a.name}
                        </div>
                        <div style={{ fontSize: '11px', color: S[600], lineHeight: 1.7 }}>
                          {a.official_status && a.official_status !== 'none'
                            && `حالة رسمية: ${OFFICIAL_LABEL[a.official_status] || a.official_status}`}
                          {(a.quality_issues || []).length > 0
                            && ` · ${a.quality_issues.length} ملاحظة جودة`}
                          {a.open_clarifications > 0
                            && ` · ${a.open_clarifications} استيضاح مفتوح`}
                        </div>
                        {a.trust_score != null && (
                          <div style={{
                            display: 'inline-block', marginTop: '7px', background: '#fff',
                            border: '1px solid #E2E8F0', borderRadius: '6px', padding: '2px 8px',
                            fontSize: '11px', fontWeight: 800, color: band(Number(a.trust_score)).fg,
                          }}>
                            مؤشر الثقة: {Number(a.trust_score).toFixed(0)}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}

            <button onClick={() => navigate('/admin/fraud-detection')}
              style={{
                width: '100%', marginTop: '14px', padding: '9px 16px', borderRadius: '12px',
                background: S[100], color: S[700], border: `1px solid ${S[200]}`,
                fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
              }}>
              عرض كافة قوائم المراقبة المتقدمة
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
