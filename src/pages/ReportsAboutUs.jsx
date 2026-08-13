import { useCallback, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { useUserRole } from '../hooks/useUserRole'
import { canPerform } from '../utils/roles'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { SkeletonPage, SkeletonTable } from '../components/Skeleton'

/**
 * /reports-about-us — what the market has published about this company.
 *
 * Every screen in the company dashboard showed what the company says about
 * others. Nothing showed what others say about it, which is the half that
 * decides its trust score and the half a customer looks at. A company could see
 * its own number fall and have no way to find out why, and no way to object.
 *
 * So this is two things at once: the mirror of /my-reports, and the entry point
 * to the objection path. The rules on who may object and to what are enforced in
 * the database — this screen only has to describe them accurately.
 */

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }

const PAYMENT_LABEL = {
  full: 'سُدِّد كاملاً', partial: 'سداد جزئي', late: 'سُدِّد متأخراً',
  default: 'لم يُسدَّد', unpaid: 'لم يُسدَّد', na: 'لا ينطبق',
}
const CATEGORY_LABEL = {
  late_payment: 'تأخير سداد', no_payment: 'عدم سداد', contract_breach: 'إخلال بالعقد',
  quality: 'جودة العمل', execution_delay: 'تأخير التنفيذ', dispute: 'نزاع',
  fraud: 'احتيال', other: 'أخرى',
}
const DISPUTE_STATUS = {
  open:      { label: '⏳ اعتراضك قيد النظر', bg: '#FFFBEB', c: '#B45309' },
  upheld:    { label: '✓ قُبل اعتراضك — سُحب التقرير', bg: '#ECFDF5', c: '#15803D' },
  rejected:  { label: '✕ لم يُقبل اعتراضك', bg: '#FEF2F2', c: '#B91C1C' },
  withdrawn: { label: '— سحبتَ اعتراضك', bg: '#F1F5F9', c: '#64748B' },
}

const MIN_REASON = 20

/**
 * نطاق المخاطر كما يخرجه النموذج نفسه، لا بعتبات تُخترع هنا.
 *
 * الانتباه واجب إلى الاتجاه: «منخفض» في risk_band يعني مخاطر منخفضة — أي
 * ثقة عالية. عرضه على أنه سيّئ يقلب معنى الرقم رأساً على عقب.
 */
const RISK_BAND = {
  low:    { t: 'مخاطر منخفضة', fg: '#15803D', bg: '#F0FDF4', bd: '#BBF7D0' },
  medium: { t: 'مخاطر متوسطة', fg: '#B45309', bg: '#FFFBEB', bd: '#FDE68A' },
  high:   { t: 'مخاطر مرتفعة', fg: '#B91C1C', bg: '#FEF2F2', bd: '#FECACA' },
}

export default function ReportsAboutUs() {
  const navigate = useNavigate()
  const { user } = useUser()
  const [score, setScore] = useState(null)
  const { role, loading: roleLoading } = useUserRole()
  const [companyId, setCompanyId] = useState(null)
  const [tenantId, setTenantId] = useState(null)
  const [reports, setReports] = useState([])
  const [disputes, setDisputes] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState('')

  const canObject = canPerform(role, 'canEditCompany')   // the same bar RLS applies
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 5000) }

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return }
    try {
      setError('')
      const supabase = getSupabase()

      const { data: me } = await supabase.from('users').select('tenant_id').eq('id', user.id).maybeSingle()
      if (!me?.tenant_id) { setLoading(false); return }
      setTenantId(me.tenant_id)

      const { data: t } = await supabase.from('tenants').select('company_id').eq('id', me.tenant_id).maybeSingle()
      if (!t?.company_id) { setLoading(false); return }
      setCompanyId(t.company_id)

      // Only published reports. One still in review is not yet a claim about
      // this company, and showing it would let the subject see a submission
      // before Marsad has decided whether it stands.
      const [{ data: rows, error: e }, { data: mine }] = await Promise.all([
        supabase
          .from('reports')
          .select('id, status, category, payment_commitment, delay_days, defaulted, deal_value, currency, dealt_at, approved_at, created_at')
          .eq('target_company_id', t.company_id)
          .eq('status', 'approved')
          .order('approved_at', { ascending: false }),
        supabase
          .from('disputes')
          .select('id, report_id, status, reason, resolution_note, resolved_at, created_at')
          .eq('raised_by_tenant_id', me.tenant_id),
      ])
      if (e) throw e

      setReports(rows || [])
      setDisputes(Object.fromEntries((mine || []).map((d) => [d.report_id, d])))

      // الدرجة نفسها. الصفحة كانت تعرض المادة الخام — البلاغات — ولا تعرض
      // ما بُني منها، فتقرأ الشركة ما قيل عنها ولا تعرف أين صار موقفها.
      // breakdown يحمل rules_applied ومعه العتبات، وهو مقروء للشركة بينما
      // system_settings ليست. فتُقرأ العتبة من الصفّ نفسه الذي حُسبت به
      // الدرجة — ولا يمكن للواجهة أن تعرض حدّاً غير الذي طُبِّق فعلاً.
      const { data: ts } = await supabase
        .from('trust_scores')
        .select('score, risk_band, tier, approved_reports, computed_at, breakdown')
        .eq('company_id', t.company_id)
        .maybeSingle()
      setScore(ts || null)
    } catch (err) {
      setError(err.message || 'تعذّر تحميل التقارير')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { load() }, [load])

  const { connected, liveAt } = useLiveData(load, {
    tables: ['reports', 'disputes', 'trust_scores'],
    enabled: !!user?.id,
  })

  const object = async (report) => {
    if (reason.trim().length < MIN_REASON) return
    try {
      setBusyId(report.id)
      const { data, error: e } = await getSupabase()
        .from('disputes')
        .insert({
          report_id: report.id,
          company_id: companyId,
          raised_by_tenant_id: tenantId,
          raised_by_user_id: user.id,
          reason: reason.trim(),
          evidence_url: evidence.trim() || null,
        })
        .select('id')

      if (e) {
        if (e.code === '23505') throw new Error('لديك اعتراض مفتوح على هذا التقرير بالفعل')
        throw e
      }
      if (!data?.length) throw new Error('لم يُسجَّل الاعتراض — تقديم الاعتراض من صلاحيات مدير الشركة')

      setOpenId(null); setReason(''); setEvidence('')
      await load()
      showToast('✅ سُجّل اعتراضك — ستراجعه إدارة مرصد وتُبلغك بالقرار')
    } catch (err) {
      showToast(`❌ ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  const withdraw = async (dispute) => {
    try {
      setBusyId(dispute.report_id)
      const { data, error: e } = await getSupabase()
        .from('disputes')
        .update({ status: 'withdrawn' })
        .eq('id', dispute.id)
        .select('id, status')
      if (e) throw e
      if (!data?.length) throw new Error('لم يُسحب الاعتراض')
      await load()
      showToast('سُحب اعتراضك')
    } catch (err) {
      showToast(`❌ ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  if (loading || roleLoading) {
    return (
      <>
        <SkeletonPage stats={0} panels={0} />
        <SkeletonTable rows={7} cols={4} />
      </>
    )
  }

  if (!companyId) {
    return (
      <div style={{ ...card, padding: '44px', textAlign: 'center' }}>
        <div style={{ fontSize: '38px', marginBottom: '12px' }}>🏢</div>
        <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px' }}>لا توجد شركة مرتبطة بحسابك</h2>
        <p style={{ fontSize: '13.5px', color: '#64748B', margin: 0, lineHeight: 1.9 }}>
          هذه الصفحة تعرض ما نُشر عن شركتك في مرصد.
        </p>
      </div>
    )
  }

  const openObjections = Object.values(disputes).filter((d) => d.status === 'open').length

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 100, boxShadow: '0 8px 24px rgba(15,23,42,.25)', maxWidth: '460px', lineHeight: 1.8 }}>{toast}</div>
      )}

      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px', textAlign: 'right' }}>تقارير عن شركتك</h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
            {reports.length} تقريراً منشوراً — هذه هي التي تُبنى عليها درجة ثقتك
            {openObjections > 0 && ` · ${openObjections} اعتراضاً قيد النظر`}
          </p>
        </div>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#B91C1C', fontSize: '14px', fontWeight: 700, textAlign: 'right' }}>⚠️ {error}</div>
      )}

      {/* الدرجة، وما تفتحه.
          البلاغات أدناه مادّة خام تدخل الطبقة المجتمعية؛ وهذه نتيجتها. عرض
          الأولى دون الثانية يترك الشركة تقرأ ما قيل عنها ولا تعرف أثره. والزرّ
          يفتح التقرير نفسه الذي يراه العميل من محرك البحث — لا نسخة مختصرة
          منه، حتى لا يكون ما تراه الشركة عن نفسها غير ما يراه السوق. */}
      {(() => {
        const rated = score && Number(score.score) > 0
        const b = rated ? (RISK_BAND[score.risk_band] || RISK_BAND.medium) : null
        // العتبات من الصفّ نفسه لا من قيمة مكتوبة هنا.
        const th = score?.breakdown?.rules_applied?.thresholds || {}
        const minPrelim = th.preliminary_min_reports
        const minFull = th.full_min_reports
        return (
          <div style={{
            ...card, padding: '20px 22px', marginBottom: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '16px', flexWrap: 'wrap', flexDirection: 'row-reverse',
          }}>
            <div style={{ textAlign: 'right', minWidth: 0 }}>
              <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700, marginBottom: '6px' }}>
                درجة ثقتك الآن
              </div>
              {rated ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '30px', fontWeight: 900, color: b.fg, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {Number(score.score).toFixed(0)}
                  </span>
                  <span style={{
                    background: b.bg, color: b.fg, border: `1px solid ${b.bd}`,
                    borderRadius: '999px', padding: '3px 11px', fontSize: '12px', fontWeight: 800,
                  }}>{b.t}</span>
                </div>
              ) : (
                // صفر يعني «لم تُصنَّف» لا «ثقتك صفر» — أرضية الـ clamp خمسة،
                // فلا حساب حقيقي ينتج صفراً.
                //
                // والسبب يُقال بعدده: الطبقة المجتمعية نصف الوزن، ولا تُحتسب
                // قبل بلوغ preliminary_min_reports. «لم تُصنَّف» وحدها تترك
                // الشركة تظنّ عطلاً؛ «تقرير من ٢» تقول لها أين هي بالضبط.
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#B45309' }}>
                  لم تُصنَّف بعد
                  <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600, marginTop: '5px', lineHeight: 1.9 }}>
                    {minPrelim
                      ? <>وصلك <strong>{score?.approved_reports || 0}</strong> من <strong>{minPrelim}</strong> تقارير معتمدة يحتاجها التصنيف المبدئي.</>
                      : 'مؤشر ثقتك قيد الاحتساب، وسيظهر هنا فور اكتماله.'}
                  </div>
                </div>
              )}
              {/* «مبدئي» ليس تفصيلاً داخلياً: درجة مبنيّة على تقريرين ليست
                  كدرجة مبنيّة على خمسة، والشركة تستحقّ أن تعرف أيّهما تقرأ
                  وما الذي يرفعها إلى التصنيف الكامل. */}
              {rated && score.tier === 'preliminary' && minFull && (
                <div style={{ fontSize: '12px', color: '#B45309', fontWeight: 700, marginTop: '8px', lineHeight: 1.8 }}>
                  تصنيف مبدئي — يكتمل عند {minFull} تقارير معتمدة
                  {score.approved_reports != null && ` (لديك ${score.approved_reports})`}
                </div>
              )}
              {rated && score.computed_at && (
                <div style={{ fontSize: '11.5px', color: '#94A3B8', fontWeight: 600, marginTop: '7px' }}>
                  آخر احتساب {new Date(score.computed_at).toLocaleDateString('en-GB')}
                  {score.tier === 'full' && score.approved_reports != null && ` · ${score.approved_reports} تقريراً معتمداً`}
                </div>
              )}
            </div>

            <button
              onClick={() => navigate(`/trust-report/${companyId}`)}
              style={{
                flex: 'none', padding: '12px 20px', background: '#1E2A52', color: '#fff',
                border: 0, borderRadius: '11px', fontSize: '13.5px', fontWeight: 800,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
              اعرض تقريرك كما يراه العميل ↗
            </button>
          </div>
        )
      })()}

      {!canObject && reports.length > 0 && (
        <div style={{ ...card, padding: '13px 16px', marginBottom: '16px', background: '#F8FAFC', fontSize: '13.5px', color: '#475569', fontWeight: 600, lineHeight: 1.8, textAlign: 'right' }}>
          🔒 الاعتراض على تقرير من صلاحيات مدير الشركة.
        </div>
      )}

      {reports.length === 0 ? (
        <div style={{ ...card, padding: '44px', textAlign: 'center' }}>
          <div style={{ fontSize: '38px', marginBottom: '12px' }}>✓</div>
          <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px' }}>لا توجد تقارير منشورة عن شركتك</h2>
          <p style={{ fontSize: '13.5px', color: '#64748B', margin: 0, lineHeight: 1.9 }}>
            سيظهر هنا أي تقرير تعتمده إدارة مرصد عن تعاملات شركتك، مع إمكانية الاعتراض عليه.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {reports.map((r) => {
            const d = disputes[r.id]
            const ds = d && DISPUTE_STATUS[d.status]
            const composing = openId === r.id
            const canRaise = canObject && (!d || d.status === 'withdrawn' || d.status === 'rejected')
            return (
              <div key={r.id} style={{ ...card, padding: '22px', opacity: busyId === r.id ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap', flexDirection: 'row-reverse' }}>
                  <div style={{ textAlign: 'right', flex: 1, minWidth: 0 }}>
                    <h2 style={{ fontSize: '15.5px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }}>
                      {CATEGORY_LABEL[r.category] || 'تقرير تعامل'}
                    </h2>
                    <p style={{ fontSize: '12.5px', color: '#64748B', margin: 0, fontWeight: 600 }}>
                      نُشر {r.approved_at ? new Date(r.approved_at).toLocaleDateString('en-GB') : '—'}
                      {r.dealt_at && ` · تاريخ التعامل ${new Date(r.dealt_at).toLocaleDateString('en-GB')}`}
                    </p>
                  </div>
                  {/* Who filed it is deliberately not shown. A company that can
                      identify its accuser can retaliate against them, and the
                      contributions Marsad runs on would stop. */}
                  <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 700, flexShrink: 0 }}>الجهة المُبلِّغة محجوبة</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '13px', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #F1F5F9', textAlign: 'right' }}>
                  {[
                    ['السداد', PAYMENT_LABEL[r.payment_commitment] || r.payment_commitment],
                    ['التأخير', r.delay_days != null ? `${r.delay_days} يوم` : null],
                    ['تعثّر', r.defaulted ? 'نعم' : 'لا'],
                    ['قيمة التعامل', r.deal_value ? `${Number(r.deal_value).toLocaleString('en-US')} ${r.currency || 'ر.س'}` : null],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 700 }}>{k}</div>
                      <div style={{ fontSize: '13.5px', fontWeight: 800, color: v ? '#334155' : '#CBD5E1' }}>{v || '—'}</div>
                    </div>
                  ))}
                </div>

                {d && ds && (
                  <div style={{ background: ds.bg, borderRadius: '11px', padding: '13px 16px', marginTop: '14px', textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', color: ds.c, fontWeight: 800 }}>{ds.label}</div>
                    {d.resolution_note && (
                      <p style={{ fontSize: '13px', color: '#334155', margin: '6px 0 0', lineHeight: 1.9 }}>{d.resolution_note}</p>
                    )}
                    {d.status === 'open' && canObject && (
                      <button onClick={() => withdraw(d)} disabled={busyId === r.id} style={{ background: 'transparent', color: '#B45309', border: 0, padding: '7px 0 0', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
                        سحب الاعتراض
                      </button>
                    )}
                  </div>
                )}

                {composing && (
                  <div style={{ marginTop: '14px' }}>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="بيّن سبب اعتراضك — ما الذي في هذا التقرير غير صحيح، وما الدليل"
                      style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '14px', outline: 'none', fontFamily: 'inherit', textAlign: 'right', minHeight: '96px', resize: 'vertical' }}
                    />
                    <div style={{ fontSize: '12px', color: reason.trim().length < MIN_REASON ? '#B45309' : '#94A3B8', fontWeight: 700, margin: '5px 2px 10px', textAlign: 'right' }}>
                      {reason.trim().length < MIN_REASON ? `${MIN_REASON - reason.trim().length} حرفاً على الأقل` : `${reason.trim().length} حرفاً`}
                    </div>
                    <input
                      value={evidence}
                      onChange={(e) => setEvidence(e.target.value)}
                      placeholder="رابط مستند يدعم اعتراضك (اختياري) — سند قبض، عقد، مراسلة"
                      style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 14px', fontSize: '13.5px', outline: 'none', fontFamily: 'inherit', textAlign: 'right' }}
                    />
                  </div>
                )}

                {canRaise && (
                  <div style={{ display: 'flex', gap: '10px', flexDirection: 'row-reverse', marginTop: '14px' }}>
                    {!composing ? (
                      <button onClick={() => { setOpenId(r.id); setReason(''); setEvidence('') }} style={{ padding: '11px 22px', background: '#F1F5F9', color: '#334155', border: 0, borderRadius: '10px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                        الاعتراض على هذا التقرير
                      </button>
                    ) : (
                      <>
                        <button onClick={() => object(r)} disabled={busyId === r.id || reason.trim().length < MIN_REASON} style={{ flex: 1, padding: '12px 16px', background: reason.trim().length >= MIN_REASON ? '#1E2A52' : '#CBD5E1', color: '#fff', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: reason.trim().length >= MIN_REASON ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                          إرسال الاعتراض
                        </button>
                        <button onClick={() => { setOpenId(null); setReason(''); setEvidence('') }} style={{ padding: '12px 20px', background: '#F1F5F9', color: '#334155', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                          إلغاء
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
