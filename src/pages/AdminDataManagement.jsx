import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '../lib/api'
import { SkeletonPanel } from '../components/Skeleton'
import { Card, PageTitle, SectionTitle, ErrorState } from '../ui'

/**
 * /admin/data-management — the commercial register, generation by generation.
 *
 * ============================================================================
 * Why this screen exists
 * ============================================================================
 * The import pipeline was already complete in the database and had no way in
 * from the panel. import_job_start → validate → load → verify → publish, the
 * verification checks, the row-level rejections, the generation diff: all of it
 * ran, and the only caller was a command-line script. Meanwhile the panel's own
 * import screen upserted straight into government_company_registry — no job, no
 * expected/loaded/rejected, no verification, and no publish gate. An operator
 * could replace the register the whole product reads without ever seeing what
 * the file contained.
 *
 * So nothing here is new work in the database. Every number on this screen
 * comes from an RPC that already existed:
 *
 *   registry_import_history   the generations, and what became of each
 *   admin_import_job_detail   one generation in full — the equation, the
 *                             integrity counts, the rejections, the diff
 *   published_registry_dataset  which dataset the product is reading now
 *   import_job_publish        the swap, gated in the database
 *
 * ============================================================================
 * What must not be got wrong
 * ============================================================================
 * A row with no commercial-registration number is not automatically a bad row.
 * The Ministry issues records that carry a unified number and no CR, and the
 * loader keeps them. The count that means something is «neither identifier»,
 * and it is shown separately from «no CR» for exactly that reason — reading the
 * two as one condemns hundreds of perfectly good records.
 *
 * Publish is not offered unless the generation is `ready`, and `ready` is a
 * state only import_job_verify can set. The button follows the database rather
 * than deciding for itself; the database refuses the same call independently,
 * which is what makes the button a convenience rather than the control.
 */

const lbl = { fontSize: '11.5px', color: '#64748B', fontWeight: 700 }
const val = { fontSize: '14px', color: '#0F172A', fontWeight: 700, marginTop: '3px' }
const num = { ...val, fontVariantNumeric: 'tabular-nums' }

// The five states an import can be in, and what each one permits. `published`
// and `cancelled` are terminal; `ready` is the only one that offers a publish.
const STATE = {
  loading: { t: 'جارٍ التحميل', bg: '#EFF6FF', fg: '#1D4ED8', publish: false },
  validating: { t: 'جارٍ التحقّق', bg: '#EFF6FF', fg: '#1D4ED8', publish: false },
  verifying: { t: 'جارٍ الفحص', bg: '#FEF3C7', fg: '#B45309', publish: false },
  ready: { t: 'جاهز للنشر', bg: '#ECFDF5', fg: '#15803D', publish: true },
  published: { t: 'منشور', bg: '#1E2A52', fg: '#fff', publish: false },
  failed: { t: 'فشل', bg: '#FEF2F2', fg: '#B91C1C', publish: false },
  cancelled: { t: 'أُلغي', bg: '#F1F5F9', fg: '#475569', publish: false },
}
const state = (s) => STATE[s] || { t: s || '—', bg: '#F1F5F9', fg: '#475569', publish: false }

const n = (v) => (v == null ? '—' : Number(v).toLocaleString('ar-SA'))
const dt = (d) => (d ? new Date(d).toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

function Field ({ k, v, mono }) {
  return (
    <div>
      <div style={lbl}>{k}</div>
      <div style={{ ...(mono ? num : val), wordBreak: 'break-word' }}>{v}</div>
    </div>
  )
}

function Grid ({ children, min = '170px' }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))`, gap: '14px' }}>
      {children}
    </div>
  )
}

export default function AdminDataManagement () {
  const [gens, setGens] = useState({ data: null, loading: true, error: '' })
  const [openJob, setOpenJob] = useState(null)
  const [detail, setDetail] = useState({ data: null, loading: false, error: '' })
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  const say = (m) => { setToast(m); setTimeout(() => setToast(''), 5000) }

  // The generations list and the live dataset id load together; the detail of
  // one generation loads on demand, and a failure in either must not blank the
  // other.
  const loadGens = useCallback(async () => {
    setGens((x) => ({ ...x, loading: true, error: '' }))
    try {
      // The history already marks which generation is live (`is_published`),
      // so the dataset id is not fetched a second time to be told the same
      // thing. Where the id itself is needed — the review panel, to name the
      // generation being replaced — it comes back inside the job detail.
      const { data, error } = await getSupabase().rpc('registry_import_history', { p_limit: 25 })
      if (error) throw error
      setGens({ data: Array.isArray(data) ? data : [], loading: false, error: '' })
    } catch (e) {
      setGens({ data: null, loading: false, error: e.message || 'تعذّر التحميل' })
    }
  }, [])

  useEffect(() => { loadGens() }, [loadGens])

  const loadDetail = useCallback(async (jobId, withDiff) => {
    setDetail({ data: null, loading: true, error: '' })
    try {
      const { data, error } = await getSupabase().rpc('admin_import_job_detail',
        { p_job_id: jobId, p_with_diff: !!withDiff })
      if (error) throw error
      setDetail({ data, loading: false, error: '' })
    } catch (e) {
      setDetail({ data: null, loading: false, error: e.message || 'تعذّر التحميل' })
    }
  }, [])

  const open = (row) => {
    setOpenJob(row)
    // The diff is three full comparisons across two generations. It is asked
    // for only when a publish is actually on the table.
    loadDetail(row.job_id, row.status === 'ready')
  }

  const publish = async (confirmShrink) => {
    try {
      setBusy(true)
      const { data, error } = await getSupabase().rpc('import_job_publish',
        { p_job_id: openJob.job_id, p_confirm_shrink: !!confirmShrink })
      if (error) throw error
      say(`✅ نُشر الجيل — ${n(data?.rows)} صفّاً`)
      setConfirm(false)
      setOpenJob(null)
      loadGens()
    } catch (e) {
      // The database refuses on its own terms — shrink beyond tolerance, a
      // status that is not ready, a missing permission. Its wording is the
      // wording shown, because it is the one that is true.
      say('❌ ' + (e.message || 'تعذّر النشر'))
    } finally { setBusy(false) }
  }

  const j = detail.data?.job
  const q = detail.data?.quality
  const checks = detail.data?.checks || []
  const diff = detail.data?.diff
  const rejections = detail.data?.rejections || []
  // The equation, read from the database's own answer rather than recomputed
  // here. Two places calculating the same thing is two places to disagree.
  const accounted = j?.accounted === true
  const blocking = checks.filter((c) => !c.ok && c.blocking !== false)
  const canPublish = j?.status === 'ready' && accounted && blocking.length === 0

  const published = (gens.data || []).find((g) => g.is_published)
  const incoming = (gens.data || []).filter((g) => !g.is_published
    && ['loading', 'validating', 'verifying', 'ready', 'failed'].includes(g.status))

  return (
    <div>
      <PageTitle note="السجل التجاري كما نشرته وزارة التجارة، جيلاً بعد جيل. لا يُنشر جيل إلا بعد اجتياز الفحص.">
        إدارة البيانات
      </PageTitle>

      {toast && (
        <div role="status" style={{
          background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 16px',
          fontSize: '13px', fontWeight: 700, marginBottom: '16px',
        }}>{toast}</div>
      )}

      {/* ===== The generation the product is reading right now ===== */}
      <Card style={{ marginBottom: '16px' }}>
        <SectionTitle>الجيل المنشور حالياً</SectionTitle>
        {gens.loading ? <SkeletonPanel rows={3} title={false} />
          : gens.error ? <ErrorState what="الأجيال" message={gens.error} onRetry={loadGens} />
            : !published ? (
              <div style={{ fontSize: '14px', color: '#64748B', lineHeight: 2 }}>
                <b style={{ color: '#0F172A' }}>لا يوجد جيل منشور</b>
                <div>لم يُنشر أي جيل من السجل التجاري بعد.</div>
              </div>
            ) : (
              <>
                <Grid>
                  <Field k="الفترة" v={published.snapshot_period || '—'} />
                  <Field k="معرّف المجموعة" v={<code style={{ fontSize: '11.5px' }}>{published.dataset_id}</code>} />
                  <Field k="الملف" v={published.file_name || '—'} />
                  <Field k="الصفوف المحمّلة" v={n(published.rows_loaded)} mono />
                  <Field k="الصفوف المتوقّعة" v={n(published.expected_rows)} mono />
                  <Field k="المرفوضة" v={n(published.rows_rejected)} mono />
                  <Field k="الاكتمال" v={published.completeness != null ? `${published.completeness}%` : '—'} mono />
                  <Field k="تاريخ الاستيراد" v={dt(published.started_at)} />
                  <Field k="بواسطة" v={published.started_by || 'النظام'} />
                </Grid>
                {/* An honest label. The live generation carries 503 of 1.9M
                    rows, and a screen that reports only «منشور» hides that. */}
                {Number(published.completeness) < 99 && (
                  <div style={{
                    marginTop: '14px', background: '#FFFBEB', border: '1px solid #FDE68A',
                    borderRadius: '10px', padding: '12px', fontSize: '12.5px', color: '#92400E', lineHeight: 1.9,
                  }}>
                    <b>هذا الجيل جزئي.</b> حُمّل {n(published.rows_loaded)} صفّاً من أصل {n(published.expected_rows)} متوقّع
                    ({published.completeness}%). ما لم يُحمّل غير موجود في السجل الذي تقرأه المنصة.
                  </div>
                )}
                <button onClick={() => open(published)} style={{
                  marginTop: '14px', padding: '8px 16px', borderRadius: '9px',
                  border: '1.5px solid #E2E8F0', background: '#fff', color: '#1E2A52',
                  fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                }}>عرض التفاصيل الكاملة</button>
              </>
            )}
      </Card>

      {/* ===== Anything on its way in ===== */}
      <Card style={{ marginBottom: '16px' }}>
        <SectionTitle>جيل قادم</SectionTitle>
        {gens.loading ? <SkeletonPanel rows={2} title={false} />
          : gens.error ? <ErrorState what="الأجيال" message={gens.error} onRetry={loadGens} />
            : incoming.length === 0 ? (
              <div style={{ fontSize: '14px', color: '#64748B', lineHeight: 2 }}>
                <b style={{ color: '#0F172A' }}>لا جيل قيد الاستيراد</b>
                <div>ستظهر هنا أي مجموعة يجري تحميلها أو فحصها.</div>
              </div>
            ) : incoming.map((g) => {
              const st = state(g.status)
              // Real progress, from the loader's own count against what the
              // file declared — not a number this screen invented.
              const pct = g.expected_rows > 0
                ? Math.min(100, Math.round((Number(g.rows_loaded) / Number(g.expected_rows)) * 100)) : null
              return (
                // The job id is on the element. Two generations in the same
                // state differ only by their numbers, and a locator built from
                // visible text picks whichever the filter reached first — which
                // is how a test for the open-equation case ended up driving the
                // closed one and reporting that it passed.
                <div key={g.job_id} data-job-id={g.job_id}
                  style={{ borderTop: '1px solid #F1F5F9', padding: '14px 0' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
                    <span style={{ background: st.bg, color: st.fg, borderRadius: '999px', padding: '5px 13px', fontSize: '12.5px', fontWeight: 800 }}>{st.t}</span>
                    <b style={{ fontSize: '14px', color: '#0F172A' }}>{g.snapshot_period || g.file_name || '—'}</b>
                  </div>
                  <Grid>
                    <Field k="المتوقّع" v={n(g.expected_rows)} mono />
                    <Field k="المحمّل" v={n(g.rows_loaded)} mono />
                    <Field k="المرفوض" v={n(g.rows_rejected)} mono />
                    <Field k="بدأ" v={dt(g.started_at)} />
                  </Grid>
                  {pct != null && (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: st.fg === '#fff' ? '#1E2A52' : st.fg }} />
                      </div>
                      <div style={{ ...lbl, marginTop: '5px' }}>{pct}% من المتوقّع</div>
                    </div>
                  )}
                  {g.failure_reason && (
                    <div style={{ fontSize: '12.5px', color: '#B91C1C', marginTop: '10px', lineHeight: 1.9 }}>{g.failure_reason}</div>
                  )}
                  <button onClick={() => open(g)} style={{
                    marginTop: '12px', padding: '8px 16px', borderRadius: '9px', border: 0,
                    background: '#1E2A52', color: '#fff', fontSize: '12.5px', fontWeight: 800,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>مراجعة الاستيراد</button>
                </div>
              )
            })}
      </Card>

      {/* ===== Every generation, kept ===== */}
      <Card>
        <SectionTitle>الأجيال السابقة</SectionTitle>
        <p style={{ fontSize: '12.5px', color: '#94A3B8', margin: '0 0 12px' }}>
          لا يُحذف جيل عند نشر ما بعده. كل مجموعة تبقى قابلة للمراجعة والرجوع إليها.
        </p>
        {gens.loading ? <SkeletonPanel rows={4} title={false} />
          : gens.error ? <ErrorState what="الأجيال" message={gens.error} onRetry={loadGens} />
            : !gens.data?.length ? (
              <div style={{ fontSize: '14px', color: '#64748B' }}>لا توجد عمليات استيراد مسجّلة.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                  <thead>
                    <tr>
                      {['الفترة', 'الحالة', 'المتوقّع', 'المحمّل', 'المرفوض', 'الاكتمال', 'بدأ', ''].map((t) => (
                        <th key={t} style={{ ...lbl, textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gens.data.map((g) => {
                      const st = state(g.status)
                      return (
                        <tr key={g.job_id}>
                          <td style={{ padding: '10px', borderBottom: '1px solid #F1F5F9', fontSize: '13px', fontWeight: 700 }}>
                            {g.snapshot_period || '—'}
                            {g.is_published && <span style={{ background: '#ECFDF5', color: '#15803D', borderRadius: '999px', padding: '2px 8px', fontSize: '11px', fontWeight: 800, marginInlineStart: '7px' }}>حيّ</span>}
                          </td>
                          <td style={{ padding: '10px', borderBottom: '1px solid #F1F5F9' }}>
                            <span style={{ background: st.bg, color: st.fg, borderRadius: '999px', padding: '3px 10px', fontSize: '11.5px', fontWeight: 800, whiteSpace: 'nowrap' }}>{st.t}</span>
                          </td>
                          {[g.expected_rows, g.rows_loaded, g.rows_rejected].map((v, i) => (
                            <td key={i} style={{ padding: '10px', borderBottom: '1px solid #F1F5F9', fontSize: '13px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{n(v)}</td>
                          ))}
                          <td style={{ padding: '10px', borderBottom: '1px solid #F1F5F9', fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>
                            {g.completeness != null ? `${g.completeness}%` : '—'}
                          </td>
                          <td style={{ padding: '10px', borderBottom: '1px solid #F1F5F9', fontSize: '12.5px', color: '#64748B', whiteSpace: 'nowrap' }}>{dt(g.started_at)}</td>
                          <td style={{ padding: '10px', borderBottom: '1px solid #F1F5F9' }}>
                            <button onClick={() => open(g)} style={{
                              padding: '5px 12px', borderRadius: '8px', border: '1.5px solid #E2E8F0',
                              background: '#fff', color: '#1E2A52', fontSize: '12px', fontWeight: 800,
                              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                            }}>مراجعة</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
      </Card>

      {/* ===== Import review ===== */}
      {openJob && (
        <div role="dialog" aria-modal="true" aria-label="مراجعة الاستيراد"
          onClick={(e) => { if (e.target === e.currentTarget) { setOpenJob(null); setConfirm(false) } }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 60,
            display: 'flex', justifyContent: 'flex-start', padding: '0',
          }}>
          <div style={{
            background: '#F8FAFC', width: 'min(720px, 100%)', height: '100%', overflowY: 'auto',
            padding: '24px', boxShadow: '0 0 40px rgba(0,0,0,.2)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }}>مراجعة الاستيراد</h2>
                <div style={{ fontSize: '12.5px', color: '#64748B' }}>{openJob.snapshot_period || openJob.file_name}</div>
              </div>
              <button onClick={() => { setOpenJob(null); setConfirm(false) }} style={{
                background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: '8px',
                padding: '7px 14px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer',
                fontFamily: 'inherit', color: '#1E2A52',
              }}>إغلاق</button>
            </div>

            {detail.loading ? <Card><SkeletonPanel rows={5} title={false} /></Card>
              : detail.error ? <Card><ErrorState what="تفاصيل الاستيراد" message={detail.error} onRetry={() => loadDetail(openJob.job_id, openJob.status === 'ready')} /></Card>
                : !j ? null : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* --- المجموعة --- */}
                    <Card>
                      <SectionTitle>المجموعة</SectionTitle>
                      <Grid>
                        <Field k="الحالة" v={<span style={{ background: state(j.status).bg, color: state(j.status).fg, borderRadius: '999px', padding: '3px 11px', fontSize: '12px', fontWeight: 800 }}>{state(j.status).t}</span>} />
                        <Field k="الفترة" v={j.snapshot_period || '—'} />
                        <Field k="الملف" v={j.file_name || '—'} />
                        <Field k="المجموعة القادمة" v={<code style={{ fontSize: '11px' }}>{j.dataset_id}</code>} />
                        <Field k="المجموعة الحالية" v={<code style={{ fontSize: '11px' }}>{detail.data.published_now || '—'}</code>} />
                        <Field k="بدأ" v={dt(j.started_at)} />
                      </Grid>
                    </Card>

                    {/* --- المعادلة --- */}
                    <Card>
                      <SectionTitle>المعادلة</SectionTitle>
                      <Grid min="130px">
                        <Field k="المتوقّع" v={n(j.expected_rows)} mono />
                        <Field k="المحمّل" v={n(j.rows_loaded)} mono />
                        <Field k="المرفوض" v={n(j.rows_rejected)} mono />
                        <Field k="الاكتمال" v={j.completeness != null ? `${j.completeness}%` : '—'} mono />
                      </Grid>
                      <div style={{
                        marginTop: '14px', borderRadius: '10px', padding: '13px',
                        background: accounted ? '#ECFDF5' : '#FEF2F2',
                        border: `1px solid ${accounted ? '#A7F3D0' : '#FECACA'}`,
                        color: accounted ? '#15803D' : '#B91C1C',
                        fontSize: '13px', fontWeight: 800, lineHeight: 1.9,
                      }}>
                        {accounted ? '✔' : '✖'} {n(j.rows_loaded)} محمّل + {n(j.rows_rejected)} مرفوض = {n(j.expected_rows)} متوقّع
                        {!accounted && (
                          <div style={{ fontWeight: 700, fontSize: '12.5px' }}>
                            فرق {n(Number(j.expected_rows) - Number(j.rows_loaded) - Number(j.rows_rejected))} صفّاً غير محسوب — لا يُنشر جيل ومعادلته مفتوحة.
                          </div>
                        )}
                      </div>
                    </Card>

                    {/* --- السلامة --- */}
                    <Card>
                      <SectionTitle>سلامة المعرّفات</SectionTitle>
                      {!q ? <div style={{ fontSize: '13px', color: '#94A3B8' }}>لا توجد صفوف في هذه المجموعة.</div> : (
                        <>
                          <Grid min="150px">
                            <Field k="الصفوف" v={n(q.rows)} mono />
                            <Field k="رقم سجل مكرّر" v={n(q.duplicate_cr)} mono />
                            <Field k="رقم موحّد مكرّر" v={n(q.duplicate_unified)} mono />
                            <Field k="بلا أي معرّف" v={n(q.no_identifier)} mono />
                          </Grid>
                          {/* The distinction that matters. */}
                          <div style={{
                            marginTop: '14px', background: '#F8FAFC', border: '1px solid #E2E8F0',
                            borderRadius: '10px', padding: '13px', fontSize: '12.5px', color: '#334155', lineHeight: 1.9,
                          }}>
                            <b style={{ color: '#0F172A' }}>{n(q.no_cr_with_unified)} صفّاً بالرقم الموحّد وحده.</b>
                            {' '}هذه سجلات صالحة — الوزارة تُصدر قيوداً برقم موحّد بلا رقم سجل تجاري، ولا تُرفض لهذا السبب.
                            {' '}الحالة التي تمنع النشر هي <b style={{ color: '#B91C1C' }}>بلا أي معرّف</b>، وعددها {n(q.no_identifier)}.
                          </div>
                        </>
                      )}
                    </Card>

                    {/* --- الفحوص --- */}
                    <Card>
                      <SectionTitle>الفحص</SectionTitle>
                      {!checks.length ? (
                        <div style={{ fontSize: '13px', color: '#94A3B8', lineHeight: 1.9 }}>
                          لم يُسجَّل فحص لهذه المجموعة — استُوردت قبل أن يصبح الفحص جزءاً من المسار.
                        </div>
                      ) : checks.map((c, i) => (
                        <div key={i} style={{
                          display: 'flex', gap: '10px', padding: '9px 0',
                          borderTop: i ? '1px solid #F1F5F9' : 0,
                        }}>
                          <span style={{ flex: 'none', fontSize: '14px' }}>
                            {c.ok ? '✅' : c.blocking === false ? 'ℹ️' : '❌'}
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>{c.label}</div>
                            {c.detail && <div style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.9 }}>{c.detail}</div>}
                          </span>
                        </div>
                      ))}
                    </Card>

                    {/* --- المقارنة --- */}
                    {diff && (
                      <Card>
                        <SectionTitle>المقارنة بالجيل الحالي</SectionTitle>
                        <Grid min="130px">
                          <Field k="جديد" v={n(diff.new)} mono />
                          <Field k="متغيّر" v={n(diff.changed)} mono />
                          <Field k="محذوف" v={n(diff.removed)} mono />
                          <Field k="دون تغيير" v={n(diff.unchanged)} mono />
                        </Grid>
                      </Card>
                    )}

                    {/* --- المرفوض --- */}
                    {Number(j.rows_rejected) > 0 && (
                      <Card>
                        <SectionTitle>الصفوف المرفوضة</SectionTitle>
                        <p style={{ fontSize: '12.5px', color: '#94A3B8', margin: '0 0 12px' }}>
                          {n(j.rows_rejected)} صفّاً مرفوضاً. أوّل {Math.min(20, rejections.length)} منها بسببها.
                        </p>
                        {!rejections.length ? (
                          <div style={{ fontSize: '13px', color: '#94A3B8' }}>لم تُسجَّل تفاصيل الرفض لهذه المهمّة.</div>
                        ) : rejections.map((r, i) => (
                          <div key={i} style={{ padding: '9px 0', borderTop: i ? '1px solid #F1F5F9' : 0, fontSize: '12.5px' }}>
                            <span style={{ color: '#94A3B8', fontVariantNumeric: 'tabular-nums' }}>سطر {n(r.line)}</span>
                            {r.cr_number && <code style={{ color: '#334155', marginInlineStart: '8px' }}>{r.cr_number}</code>}
                            <div style={{ color: '#B91C1C', marginTop: '2px' }}>{r.reason}</div>
                          </div>
                        ))}
                      </Card>
                    )}

                    {/* --- النشر --- */}
                    <Card>
                      <SectionTitle>النشر</SectionTitle>
                      {j.is_published ? (
                        <div style={{ fontSize: '13.5px', color: '#15803D', fontWeight: 700 }}>
                          هذا هو الجيل المنشور حالياً.
                        </div>
                      ) : j.status !== 'ready' ? (
                        <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.9 }}>
                          لا يُنشر إلا جيل في حالة <b>«جاهز للنشر»</b>، وهي حالة لا يمنحها إلا الفحص.
                          {' '}هذا الجيل في حالة <b>«{state(j.status).t}»</b>.
                          {' '}القاعدة ترفض النشر من هذه الحالة أيضاً، لا الواجهة وحدها.
                        </div>
                      ) : (
                        <>
                          {!canPublish && (
                            <div style={{ fontSize: '12.5px', color: '#B91C1C', marginBottom: '10px', lineHeight: 1.9 }}>
                              {!accounted ? 'المعادلة غير مغلقة.' : `${blocking.length} فحصاً لم يُجتَز.`}
                            </div>
                          )}
                          <button
                            onClick={() => setConfirm(true)}
                            disabled={!canPublish || busy}
                            style={{
                              padding: '10px 20px', borderRadius: '9px', border: 0,
                              background: canPublish ? '#15803D' : '#CBD5E1', color: '#fff',
                              fontSize: '13px', fontWeight: 800,
                              cursor: canPublish && !busy ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                            }}>نشر هذا الجيل</button>
                        </>
                      )}
                    </Card>
                  </div>
                )}
          </div>
        </div>
      )}

      {/* ===== Publish confirmation ===== */}
      {confirm && j && (
        <div role="dialog" aria-modal="true" aria-label="تأكيد النشر"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.6)', zIndex: 70,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
          }}>
          <Card style={{ width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px' }}>تأكيد النشر</h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px', lineHeight: 1.9 }}>
              النشر يستبدل السجل الذي تقرأه المنصة بأكملها. هذه أرقام الجيل الذي على وشك أن يصبح حيّاً.
            </p>

            <Grid min="130px">
              <Field k="المتوقّع" v={n(j.expected_rows)} mono />
              <Field k="المحمّل" v={n(j.rows_loaded)} mono />
              <Field k="المرفوض" v={n(j.rows_rejected)} mono />
              <Field k="محسوب" v={accounted ? 'نعم' : 'لا'} />
              {q && <Field k="بلا أي معرّف" v={n(q.no_identifier)} mono />}
              {q && <Field k="رقم موحّد وحده" v={n(q.no_cr_with_unified)} mono />}
              {q && <Field k="سجل مكرّر" v={n(q.duplicate_cr)} mono />}
              {q && <Field k="موحّد مكرّر" v={n(q.duplicate_unified)} mono />}
              {diff && <Field k="جديد" v={n(diff.new)} mono />}
              {diff && <Field k="متغيّر" v={n(diff.changed)} mono />}
              {diff && <Field k="محذوف" v={n(diff.removed)} mono />}
              {diff && <Field k="دون تغيير" v={n(diff.unchanged)} mono />}
            </Grid>

            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #F1F5F9' }}>
              <Grid min="150px">
                <Field k="المجموعة القادمة" v={<code style={{ fontSize: '11px' }}>{j.dataset_id}</code>} />
                <Field k="المجموعة الحالية" v={<code style={{ fontSize: '11px' }}>{detail.data?.published_now || '—'}</code>} />
                <Field k="تاريخ الاستيراد" v={dt(j.started_at)} />
              </Grid>
            </div>

            {!accounted && (
              <div style={{
                marginTop: '14px', background: '#FEF2F2', border: '1px solid #FECACA',
                borderRadius: '10px', padding: '12px', fontSize: '12.5px', color: '#B91C1C', lineHeight: 1.9,
              }}>
                المعادلة غير مغلقة: {n(j.rows_loaded)} + {n(j.rows_rejected)} ≠ {n(j.expected_rows)}. التأكيد معطّل.
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '18px', flexWrap: 'wrap' }}>
              <button onClick={() => publish(false)} disabled={!canPublish || busy}
                style={{
                  padding: '10px 20px', borderRadius: '9px', border: 0,
                  background: canPublish && !busy ? '#15803D' : '#CBD5E1', color: '#fff',
                  fontSize: '13px', fontWeight: 800,
                  cursor: canPublish && !busy ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                }}>{busy ? 'جارٍ النشر…' : 'تأكيد النشر'}</button>
              <button onClick={() => setConfirm(false)} disabled={busy}
                style={{
                  padding: '10px 20px', borderRadius: '9px', border: '1.5px solid #E2E8F0',
                  background: '#fff', color: '#1E2A52', fontSize: '13px', fontWeight: 800,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>تراجع</button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
