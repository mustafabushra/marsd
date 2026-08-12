import { useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { creditsGrantedFor } from '../lib/entitlements'
import { notifyTenant } from '../lib/notify'
import { SkeletonPage, SkeletonTable } from '../components/Skeleton'
import ReportEvidence from '../components/ReportEvidence'

const CATEGORY_LABELS = { late_payment: 'تأخير سداد', no_payment: 'عدم سداد', contract_breach: 'إخلال بالعقد', quality: 'جودة العمل', execution_delay: 'تأخير التنفيذ', dispute: 'نزاع', fraud: 'احتيال', other: 'أخرى' }
const PAYMENT_LABELS = { full: 'تم السداد', partial: 'سداد جزئي', late: 'متأخر', default: 'لم يُسدَّد', unpaid: 'لم يُسدَّد', na: 'لا ينطبق' }

// A review queue is worked down, not browsed, so it does not need paging — it
// needs a ceiling that is stated rather than inherited. PostgREST caps a request
// at 1000 rows and reports success, which is the failure mode this avoids.
const QUEUE_LIMIT = 500

// الطابور صار يحمل حالتين، فلا بدّ أن تقول الشاشة أيّهما هذا. «قيد المراجعة»
// كانت مكتوبة ثابتة فوق كل تقرير، وهي كذبة على تقرير طُلبت معلوماته.
const REPORT_STATE = {
  pending_review: { t: 'بانتظار المراجعة', fg: '#B45309', bg: '#FFFBEB' },
  request_info:   { t: 'بانتظار معلومات',  fg: '#1E2A52', bg: '#EEF2F8' },
}

export default function AdminReports() {
  const { user } = useUser()
  const [reports, setReports] = useState([])
  const [reporterHistory, setReporterHistory] = useState({})
  const [sel, setSel] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [toast, setToast] = useState('')

  useEffect(() => { fetchReports() }, [])

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const fetchReports = async () => {
    try {
      setLoading(true)
      const supabase = getSupabase()
      const { data } = await supabase
        .from('reports')
        .select(`id, target_company_id, reporter_tenant_id, status, submitted_at, dealt_at, deal_end_date,
                 deal_value, currency, deal_amount_range, payment_commitment, delay_days, defaulted,
                 title, category, description, notes, would_recommend,
                 companies:target_company_id ( name, cr_number ),
                 reporter:reporter_tenant_id ( id, name, cr_number )`)
        // كلا الحالتين، لا pending_review وحدها.
        //
        // مركز العمل يعدّ ('pending_review','request_info') بوصفهما تقريراً
        // مفتوحاً — راجع rep في migration 148 — بينما هذه الشاشة كانت تُصفّي
        // على الأولى فقط. فتقرير طُلبت معلوماته يختفي من الشاشة الوحيدة التي
        // تُراجَع فيها التقارير، ويبقى محسوباً في كل عدّاد: البلاطة تقول «١»
        // وتُفتح الشاشة فارغة. هذا عطل صامت — يبني وينجح ولا يُرجع شيئاً.
        .in('status', ['pending_review', 'request_info'])
        .order('submitted_at', { ascending: false })
        // An explicit ceiling. Without one PostgREST applies its own at 1000 rows
        // and returns 200 without saying it truncated, so a queue past that point
        // looks complete and is not. Stated here, the number is visible and can
        // be raised; left to the server, nobody knows it exists.
        .limit(QUEUE_LIMIT)

      const rows = data || []

      // The record of the company that filed each report. A reviewer approving a
      // claim about a named business without knowing who made it cannot weigh it
      // at all — and a company whose reports keep being rejected is the single
      // clearest signal Marsad has that something is wrong with its submissions.
      //
      // Counted by the database. This used to fetch every report those tenants
      // had ever filed and tally them here, which PostgREST silently truncates at
      // 1000 rows — so the reject rate shown beside a reviewer's approve button
      // would quietly become a rate over the most recent thousand, and this
      // number is what a decision to suspend a contributor rests on. A wrong one
      // suspends the wrong company.
      const tenantIds = [...new Set(rows.map((r) => r.reporter_tenant_id).filter(Boolean))]
      if (tenantIds.length) {
        const { data: overview } = await supabase.rpc('contributors_overview')
        const tally = {}
        ;(overview || []).forEach((t) => {
          if (!tenantIds.includes(t.tenant_id)) return
          tally[t.tenant_id] = {
            total: Number(t.reports_total) || 0,
            approved: Number(t.reports_approved) || 0,
            rejected: Number(t.reports_rejected) || 0,
            isPartner: !!t.is_partner,
          }
        })
        setReporterHistory(tally)

        // Priority in review, which /partners has promised all along. It is an
        // ordering and nothing more: a partner's report is reached sooner and
        // judged by exactly the same rules. Within each group the queue stays in
        // its original order, so nothing else about the list changes.
        rows.sort((a, b) =>
          (tally[b.reporter_tenant_id]?.isPartner ? 1 : 0)
          - (tally[a.reporter_tenant_id]?.isPartner ? 1 : 0))
      }
      setReports(rows)
      setSel(0)
    } catch (err) {
      console.error('Error fetching reports:', err)
    } finally {
      setLoading(false)
    }
  }

  // Declared after fetchReports: passing it above would read the binding before
  // it is initialised, which is what broke the build the first time.
  //
  // Same reason as the requests queue — a report decided by one reviewer must
  // leave every other reviewer's list without either of them reloading.
  const { connected, liveAt } = useLiveData(fetchReports, { tables: ['reports'] })

  const current = reports[sel] || null

  const removeCurrent = () => {
    const next = reports.filter((_, i) => i !== sel)
    setReports(next)
    setSel(0)
  }

  const handleApprove = async () => {
    if (!current) return
    try {
      setActionLoading('approve')
      const supabase = getSupabase()
      const { data: approved, error } = await supabase.from('reports')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', current.id)
        .select('id, status')
      if (error) throw error
      // Credits are granted on the strength of this line. An UPDATE filtered out
      // by RLS raises nothing, so without the row count the platform would pay
      // for an approval that never happened.
      if (!approved?.length) throw new Error('لم يُحفظ الاعتماد — تحقّق من صلاحيتك')
      // The reporting company has already been credited: a trigger on
      // reports.status grants the points in the same transaction as the UPDATE
      // above, at the rate give_to_get_rules holds and only if their plan earns
      // that way. This screen used to ask an endpoint to grant them, and that
      // endpoint granted from the action name alone without checking anything
      // had happened — so the request was the event. Now the transition is.
      const awarded = await creditsGrantedFor('reports', current.id, 'report_approved')
      // Recompute trust score (best effort)
      await supabase.rpc('compute_trust_score', { p_company_id: current.target_company_id })
      // Audit + notify
      await supabase.from('audit_logs').insert([{ actor_id: user?.id || null, action: 'report_approved', entity: 'report', entity_id: current.id, created_at: new Date().toISOString() }])
      await notifyTenant(current.reporter_tenant_id, 'report_approved', { title: 'تم اعتماد تقريرك', message: 'تم اعتماد تقريرك وإضافته لمؤشر الثقة.', meta: { reportId: current.id } })
      showToast(awarded > 0 ? `✅ تم اعتماد التقرير ومنح ${awarded} نقطة للشركة المُبلِّغة` : '✅ تم اعتماد التقرير')
      removeCurrent()
    } catch (err) {
      showToast('❌ فشل الاعتماد: ' + (err?.message || 'خطأ غير معروف'))
      console.error(err)
    } finally { setActionLoading(null) }
  }

  const handleReject = async () => {
    if (!current) return
    const reason = window.prompt('سبب الرفض (سيظهر للمُبلِّغ):', '')
    if (reason === null) return
    try {
      setActionLoading('reject')
      const supabase = getSupabase()
      const { data: rejected, error } = await supabase.from('reports')
        .update({ status: 'rejected', rejected_at: new Date().toISOString(), rejection_reason: reason || 'تم الرفض من قبل الإدارة' })
        .eq('id', current.id)
        .select('id, status')
      if (error) throw error
      if (!rejected?.length) throw new Error('لم يُحفظ الرفض — تحقّق من صلاحيتك')
      // No refund is written. This inserted one credit with reason
      // 'report_rejected_refund' — a value the CHECK constraint has never
      // allowed, so the write always failed, and its error was never read. It
      // was refunding a deduction that no longer happens either: submitting a
      // report costs nothing, and approval is what pays. Rejecting therefore
      // has nothing to reverse.
      await supabase.from('audit_logs').insert([{ actor_id: user?.id || null, action: 'report_rejected', entity: 'report', entity_id: current.id, meta: JSON.stringify({ reason }), created_at: new Date().toISOString() }])
      await notifyTenant(current.reporter_tenant_id, 'report_rejected', { title: 'تم رفض تقريرك', message: reason || 'راجع ملاحظات الإدارة.', meta: { reportId: current.id } })
      showToast('تم رفض التقرير')
      removeCurrent()
    } catch (err) {
      showToast('❌ فشل الرفض: ' + (err?.message || 'خطأ غير معروف'))
      console.error(err)
    } finally { setActionLoading(null) }
  }

  const handleRequestInfo = async () => {
    if (!current) return
    try {
      setActionLoading('info')
      const supabase = getSupabase()
      const { data: asked, error: askErr } = await supabase.from('reports')
        .update({ status: 'request_info' })
        .eq('id', current.id)
        .select('id, status')
      if (askErr) throw askErr
      if (!asked?.length) throw new Error('لم يُحفظ الطلب — تحقّق من صلاحيتك')
      await notifyTenant(current.reporter_tenant_id, 'report_request_info', { title: 'مطلوب توضيح على تقريرك', message: 'يرجى إضافة تفاصيل أو مستندات إضافية.', meta: { reportId: current.id } })
      showToast('تم طلب توضيح')
      removeCurrent()
    } catch (err) {
      showToast('❌ ' + (err.message || 'تعذّر الإجراء'))
    } finally { setActionLoading(null) }
  }

  const dealValue = (r) => r?.deal_value != null ? `${Number(r.deal_value).toLocaleString('en-US')} ${r.currency || ''}`.trim() : (r?.deal_amount_range || '—')
  const period = (r) => {
    const f = r?.dealt_at ? new Date(r.dealt_at).toLocaleDateString('en-GB') : null
    const t = r?.deal_end_date ? new Date(r.deal_end_date).toLocaleDateString('en-GB') : null
    return f ? (t ? `${f} — ${t}` : f) : '—'
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
        <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 100, boxShadow: '0 8px 24px rgba(15,23,42,.25)' }}>{toast}</div>
      )}

      {reports.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '44px', marginBottom: '12px' }}>✅</div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A' }}>لا توجد تقارير قيد المراجعة</div>
          <div style={{ fontSize: '14px', color: '#64748B', marginTop: '6px' }}>كل التقارير تمت مراجعتها.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '18px', alignItems: 'start' }}>
          {/* List */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', margin: 0 }}>تقارير قيد المراجعة</h3>
              <span style={{ background: '#FFFBEB', color: '#B45309', borderRadius: '999px', padding: '3px 11px', fontSize: '12.5px', fontWeight: 800 }}>{reports.length}</span>
            </div>
            {reports.map((r, i) => (
              <div key={r.id} onClick={() => setSel(i)} style={{ padding: '16px 18px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', background: sel === i ? '#F0FDF4' : '#fff', borderRight: sel === i ? '3px solid #16A34A' : '3px solid transparent' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', marginBottom: '5px', lineHeight: 1.4 }}>{r.companies?.name || 'شركة'}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-GB') : '—'}</span>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#334155' }}>{dealValue(r)}</span>
                </div>
                {REPORT_STATE[r.status] && (
                  <span style={{
                    display: 'inline-block', marginTop: '7px', borderRadius: '999px',
                    padding: '2px 9px', fontSize: '11px', fontWeight: 800,
                    background: REPORT_STATE[r.status].bg, color: REPORT_STATE[r.status].fg,
                  }}>{REPORT_STATE[r.status].t}</span>
                )}
              </div>
            ))}
          </div>

          {/* Detail */}
          {current && (
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '26px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', paddingBottom: '18px', borderBottom: '1px solid #F1F5F9' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, marginBottom: '4px' }}>الشركة المُبلَّغ عنها</div>
                  <h2 style={{ fontSize: '21px', fontWeight: 900, color: '#0F172A', margin: 0 }}>{current.companies?.name || 'شركة'}</h2>
                  {current.title && <div style={{ fontSize: '13.5px', color: '#64748B', marginTop: '5px' }}>{current.title}{current.category ? ` · ${CATEGORY_LABELS[current.category] || current.category}` : ''}</div>}
                </div>
                <span style={{
                  background: (REPORT_STATE[current.status] || REPORT_STATE.pending_review).bg,
                  color: (REPORT_STATE[current.status] || REPORT_STATE.pending_review).fg,
                  borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: 800,
                }}>{(REPORT_STATE[current.status] || REPORT_STATE.pending_review).t}</span>
              </div>

              {/* Who is making the claim, and what their submissions have been
                  worth so far. A reviewer weighing an accusation against a named
                  business needs both: the identity, and whether this source has a
                  history of claims that did not hold up. */}
              {(() => {
                const h = reporterHistory[current.reporter_tenant_id] || { total: 0, approved: 0, rejected: 0 }
                const rejectRate = h.total ? Math.round((h.rejected / h.total) * 100) : 0
                const suspect = h.total >= 3 && rejectRate >= 40
                return (
                  <div style={{ background: suspect ? '#FFFBEB' : '#F8FAFC', border: `1px solid ${suspect ? '#FDE68A' : '#E2E8F0'}`, borderRadius: '12px', padding: '15px 17px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, marginBottom: '4px' }}>الشركة المُبلِّغة</div>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          {current.reporter?.name || '—'}
                          {h.isPartner && (
                            <span title="تُراجَع تقاريرها أولاً — بنفس القواعد"
                                  style={{ background: '#ECFDF5', color: '#15803D', borderRadius: '7px', padding: '3px 9px', fontSize: '11.5px', fontWeight: 800 }}>
                              ★ شريك · أولوية مراجعة
                            </span>
                          )}
                        </div>
                        {current.reporter?.cr_number && (
                          <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>سجل {current.reporter.cr_number}</div>
                        )}
                      </div>
                      <div style={{ textAlign: 'left', fontSize: '12.5px', fontWeight: 700, color: '#52514e', lineHeight: 1.9 }}>
                        <div>{h.total} تقريراً مُقدَّماً · {h.approved} معتمد · {h.rejected} مرفوض</div>
                        {suspect && (
                          <div style={{ color: '#B45309', fontWeight: 800 }}>
                            ⚠ {rejectRate}% من تقاريرها مرفوضة — راجع بتدقيق
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', marginBottom: '20px' }}>
                {[
                  ['قيمة التعامل', dealValue(current)],
                  ['حالة السداد', PAYMENT_LABELS[current.payment_commitment] || '—'],
                  ['متوسط التأخير', `${current.delay_days ?? 0} يوم`],
                  ['مبالغ مستحقة', current.defaulted ? 'نعم' : 'لا'],
                  ['التوصية', current.would_recommend === 'yes' ? 'ينصح به' : current.would_recommend === 'maybe' ? 'ربما' : current.would_recommend === 'no' ? 'لا ينصح' : '—'],
                  ['فترة التعامل', period(current)],
                ].map(([l, v]) => (
                  <div key={l} style={{ background: '#F8FAFC', borderRadius: '11px', padding: '15px' }}>
                    <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, marginBottom: '5px' }}>{l}</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>{v}</div>
                  </div>
                ))}
              </div>

              {(current.description || current.notes) && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '8px' }}>ملاحظات المُبلِّغ</div>
                  <p style={{ fontSize: '14.5px', color: '#475569', lineHeight: 1.7, margin: 0, background: '#F8FAFC', borderRadius: '11px', padding: '16px' }}>{current.description || current.notes}</p>
                </div>
              )}

              {/* Above the decision, because it is what the decision rests on.
                  A reviewer was approving or rejecting an accusation with the
                  accuser's proof unreachable. */}
              <ReportEvidence reportId={current.id} />

              <div style={{ background: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: '11px', padding: '13px 16px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '17px' }}>ℹ</span>
                <span style={{ fontSize: '13px', color: '#3730A3', fontWeight: 700, lineHeight: 1.6 }}>اعتماد التقرير سيؤثر تدريجياً على مؤشر ثقة الشركة حين يبدأ الإجماع، لا بشكل فوري.</span>
              </div>

              <div style={{ display: 'flex', gap: '11px', paddingTop: '18px', borderTop: '1px solid #F1F5F9' }}>
                <button onClick={handleApprove} disabled={!!actionLoading} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '13px 28px', fontSize: '14.5px', fontWeight: 800, cursor: actionLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{actionLoading === 'approve' ? '...' : '✓ اعتماد التقرير'}</button>
                <button onClick={handleReject} disabled={!!actionLoading} style={{ background: '#fff', color: '#B91C1C', border: '1.5px solid #FECACA', borderRadius: '10px', padding: '13px 28px', fontSize: '14.5px', fontWeight: 800, cursor: actionLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>✕ رفض</button>
                <button onClick={handleRequestInfo} disabled={!!actionLoading} style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '13px 28px', fontSize: '14.5px', fontWeight: 800, cursor: actionLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>طلب توضيح</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
