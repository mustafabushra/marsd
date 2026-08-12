import { useCallback, useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { notifyTenant } from '../lib/notify'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { StatTile, STATUS_COLOR } from '../components/Charts'
import { SkeletonPage, SkeletonTable, SkeletonList } from '../components/Skeleton'
import { Card } from '../ui'

/**
 * /admin/fraud-detection — who contributes to Marsad, and what their
 * contributions turned out to be worth.
 *
 * The screen listed invented alerts about collusion. It was then locked, on the
 * grounds that no detection existed. Both were answers to the wrong question.
 * What Marsad needs is not a machine that decides who is acting in bad faith,
 * but the record that lets a person decide — and a way to act once they have.
 *
 * Until now the only action was suspending a company outright, which stops them
 * searching and watching and using everything they may have paid for: a blunt
 * instrument for a narrow problem. There are two levers instead, separate
 * because a company damaging a competitor with reports is usually not the one
 * flooding the registry to farm credits.
 *
 * None of the signals decides anything. A company legitimately deals with its
 * competitors, and one bad quarter produces a burst of honest reports. They are
 * ordered by how hard each is to explain innocently and the last word is a
 * person's — a platform that automatically silenced whoever tripped a threshold
 * would be a worse instrument than the one it replaced.
 */

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }
const COLS = '1.7fr 1.2fr 1.2fr 1fr 1.6fr'

export default function AdminFraudDetection() {
  const { user } = useUser()
  const [rows, setRows] = useState([])
  const [detail, setDetail] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [reason, setReason] = useState('')
  const [toast, setToast] = useState('')
  const [onlyFlagged, setOnlyFlagged] = useState(false)

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 5500) }

  const load = useCallback(async () => {
    try {
      setError('')
      const { data, error: e } = await getSupabase().rpc('contributors_overview')
      if (e) throw e
      setRows(data || [])
    } catch (err) {
      setError(err.message || 'تعذّر تحميل سجل المساهمين')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const { connected, liveAt } = useLiveData(load, { tables: ['reports', 'disputes', 'tenants'] })

  // The per-company signals cost two calls, so they are fetched when a row is
  // opened rather than for every company on the list.
  const openDetail = async (tenantId) => {
    if (openId === tenantId) { setOpenId(null); setDetail(null); return }
    setOpenId(tenantId)
    setDetail(null)
    setReason('')
    try {
      const supabase = getSupabase()
      const [{ data: risk }, { data: registrar }] = await Promise.all([
        supabase.rpc('contributor_risk', { p_tenant_id: tenantId }),
        supabase.rpc('registrar_risk', { p_tenant_id: tenantId }),
      ])
      setDetail({ risk, registrar })
    } catch (err) {
      showToast(`❌ ${err.message}`)
    }
  }

  const setLever = async (row, column, on) => {
    if (on && !reason.trim()) { showToast('❌ اكتب سبب الإيقاف — يصل الشركة'); return }
    try {
      setBusyId(row.tenant_id)
      const supabase = getSupabase()
      const stamp = new Date().toISOString()

      const patch = on
        ? { [column]: true, [`${column}_reason`]: reason.trim(), [`${column}_at`]: stamp, [`${column}_by`]: user?.id }
        : { [column]: false, [`${column}_reason`]: null, [`${column}_at`]: null, [`${column}_by`]: null }

      const { data, error: e } = await supabase
        .from('tenants').update(patch).eq('id', row.tenant_id).select('id')
      if (e) throw e
      if (!data?.length) throw new Error('لم يُحفظ التغيير — تحقّق من صلاحيتك')

      // A suspension the company only discovers by being refused is a support
      // ticket. It is told, with the reason, at the moment it happens.
      const isReporting = column === 'reporting_suspended'
      await notifyTenant(row.tenant_id, on ? 'report_rejected' : 'report_approved', {
        title: on
          ? (isReporting ? 'أُوقف تقديم التقارير من حسابك' : 'أُوقفت إضافة الشركات من حسابك')
          : (isReporting ? 'أُعيد تفعيل تقديم التقارير' : 'أُعيد تفعيل إضافة الشركات'),
        message: on ? reason.trim() : 'يمكنك المتابعة كالمعتاد.',
        meta: { lever: column, suspended: on },
      })

      await supabase.from('audit_logs').insert([{
        actor_id: user?.id,
        action: on ? `${column}_on` : `${column}_off`,
        entity: 'tenant',
        entity_id: row.tenant_id,
        tenant_id: row.tenant_id,
        meta: JSON.stringify({ reason: on ? reason.trim() : null }),
        created_at: stamp,
      }])

      setReason('')
      setOpenId(null)
      setDetail(null)
      await load()
      showToast(on ? '✅ أُوقف — وأُبلغت الشركة بالسبب' : '✅ أُعيد التفعيل')
    } catch (err) {
      showToast(`❌ ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <>
        <SkeletonPage stats={0} panels={0} />
        <SkeletonTable rows={7} cols={4} />
      </>
    )
  }

  // What surfaces without asking for the detailed signals. The per-company
  // record is richer; this only decides which rows are worth opening.
  const worthLooking = (r) =>
    r.reports_overturned > 0 ||
    (r.reports_total >= 3 && r.reject_rate >= 40) ||
    (r.companies_added >= 3 && r.companies_not_approved / Math.max(1, r.companies_added) >= 0.5)

  const flagged = rows.filter(worthLooking)
  const suspended = rows.filter((r) => r.reporting_suspended || r.company_add_suspended)
  const visible = onlyFlagged ? flagged : rows

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 100, boxShadow: '0 8px 24px rgba(15,23,42,.25)', maxWidth: '460px', lineHeight: 1.8 }}>{toast}</div>
      )}

      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px', textAlign: 'right' }}>سجل المساهمين ومعالجة البلاغات الكيدية</h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right', lineHeight: 1.9 }}>
            من يُبلّغ ومن يسجّل شركات، وما آل إليه ما قدّموه — والإيقاف هنا يمنع المساهمة وحدها ولا يعطّل الحساب
          </p>
        </div>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#B91C1C', fontSize: '14px', fontWeight: 700, textAlign: 'right' }}>⚠️ {error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '14px', marginBottom: '18px' }}>
        <StatTile label="شركات تُساهم" value={rows.filter((r) => r.reports_total > 0 || r.companies_added > 0).length} sub={`من ${rows.length} مسجّلة`} />
        <StatTile label="تستحق نظرة" value={flagged.length} sub="مؤشرات تحتاج مراجعة" tone={flagged.length ? STATUS_COLOR.warning : undefined} />
        <StatTile label="تقارير سُحبت بعد اعتراض" value={rows.reduce((s, r) => s + r.reports_overturned, 0)} sub="ادّعاء ثبت خطؤه" tone={rows.some((r) => r.reports_overturned) ? STATUS_COLOR.critical : undefined} />
        <StatTile label="مساهمات موقوفة" value={suspended.length} sub="بقرار من مرصد" tone={suspended.length ? STATUS_COLOR.serious : undefined} />
      </div>

      <div style={{ display: 'flex', gap: '9px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <button onClick={() => setOnlyFlagged(false)} style={{ padding: '10px 20px', background: !onlyFlagged ? '#1E2A52' : '#fff', color: !onlyFlagged ? '#fff' : '#334155', border: !onlyFlagged ? 0 : '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          كل المساهمين ({rows.length})
        </button>
        <button onClick={() => setOnlyFlagged(true)} style={{ padding: '10px 20px', background: onlyFlagged ? '#1E2A52' : '#fff', color: onlyFlagged ? '#fff' : '#334155', border: onlyFlagged ? 0 : '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          تستحق نظرة ({flagged.length})
        </button>
      </div>

      <Card style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '14px 20px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '12.5px', fontWeight: 800, color: '#64748B', textAlign: 'right' }}>
          <span>الشركة</span><span>تقاريرها</span><span>شركات أضافتها</span><span>الحالة</span><span>الإجراء</span>
        </div>

        {visible.length === 0 ? (
          <div style={{ padding: '44px', textAlign: 'center' }}>
            <div style={{ fontSize: '38px', marginBottom: '10px' }}>✓</div>
            <p style={{ fontSize: '14px', color: '#64748B', fontWeight: 600, margin: 0 }}>
              {onlyFlagged ? 'لا توجد شركة تستحق نظرة الآن' : 'لا يوجد مساهمون بعد'}
            </p>
          </div>
        ) : visible.map((r) => {
          const flag = worthLooking(r)
          const open = openId === r.tenant_id
          const anySuspended = r.reporting_suspended || r.company_add_suspended
          const allFlags = [...(detail?.risk?.flags || []), ...(detail?.registrar?.flags || [])]
          return (
            <div key={r.tenant_id} style={{ borderBottom: '1px solid #F1F5F9', opacity: busyId === r.tenant_id ? 0.55 : 1, background: anySuspended ? '#FFFBEB' : flag ? '#FEFCE8' : '#fff' }}>
              <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '14px 20px', alignItems: 'center', textAlign: 'right' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{r.tenant_name}</div>
                  <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 600 }}>
                    {r.cr_number || '—'}{r.sector ? ` · ${r.sector}` : ''}
                  </div>
                </div>

                <div style={{ fontSize: '13px', color: '#334155', fontWeight: 700 }}>
                  {r.reports_total}
                  {r.reports_total > 0 && <span style={{ color: '#64748B', fontWeight: 600 }}> · {r.reject_rate}% مرفوض</span>}
                  {r.reports_overturned > 0 && (
                    <div style={{ fontSize: '11.5px', color: STATUS_COLOR.critical, fontWeight: 800 }}>
                      {r.reports_overturned} سُحب بعد اعتراض
                    </div>
                  )}
                </div>

                <div style={{ fontSize: '13px', color: '#334155', fontWeight: 700 }}>
                  {r.companies_added}
                  {r.companies_not_approved > 0 && (
                    <span style={{ color: '#64748B', fontWeight: 600 }}> · {r.companies_not_approved} لم تُعتمد</span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {r.reporting_suspended && <span style={{ background: '#FEE2E2', color: '#B91C1C', borderRadius: '6px', padding: '3px 9px', fontSize: '11px', fontWeight: 800 }}>التقارير موقوفة</span>}
                  {r.company_add_suspended && <span style={{ background: '#FEE2E2', color: '#B91C1C', borderRadius: '6px', padding: '3px 9px', fontSize: '11px', fontWeight: 800 }}>الإضافة موقوفة</span>}
                  {!anySuspended && <span style={{ fontSize: '12px', color: flag ? '#B45309' : '#94A3B8', fontWeight: 700 }}>{flag ? '⚠ تستحق نظرة' : 'طبيعية'}</span>}
                </div>

                <button onClick={() => openDetail(r.tenant_id)} style={{ background: '#F1F5F9', color: '#334155', border: 0, borderRadius: '8px', padding: '8px 15px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', justifySelf: 'start' }}>
                  {open ? 'إخفاء' : 'السجل والإجراءات'}
                </button>
              </div>

              {open && (
                <div style={{ padding: '4px 20px 20px', background: '#FAFCFF' }}>
                  {!detail ? (
                    <SkeletonList rows={3} />
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '13px', marginBottom: '16px', textAlign: 'right' }}>
                        {[
                          ['أكثر تقارير في أسبوع', detail.risk?.patterns?.max_reports_in_a_week],
                          ['تقارير على نفس القطاع', detail.risk?.patterns?.same_sector],
                          ['أكثر شركة استُهدفت', detail.risk?.patterns?.most_reported_target
                            ? `${detail.risk.patterns.most_reported_target} (${detail.risk.patterns.most_reported_count})`
                            : null],
                          ['شركات ناقصة البيانات', detail.registrar?.thin_records],
                          ['أكثر شركات في أسبوع', detail.registrar?.max_in_a_week],
                          ['نقاط كسبتها', detail.risk?.credits_earned],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 700 }}>{k}</div>
                            <div style={{ fontSize: '14px', fontWeight: 800, color: v != null && v !== '' ? '#334155' : '#CBD5E1' }}>{v ?? '—'}</div>
                          </div>
                        ))}
                      </div>

                      {allFlags.length > 0 ? (
                        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '11px', padding: '13px 16px', marginBottom: '16px', textAlign: 'right' }}>
                          <div style={{ fontSize: '12.5px', fontWeight: 900, color: '#92400E', marginBottom: '7px' }}>مؤشرات تستحق النظر — لا شيء منها دليل بذاته</div>
                          <ul style={{ margin: 0, paddingRight: '20px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            {allFlags.map((f) => (
                              <li key={f} style={{ fontSize: '13px', color: '#78350F', fontWeight: 700, lineHeight: 1.9 }}>{f}</li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '11px', padding: '13px 16px', marginBottom: '16px', fontSize: '13px', color: '#15803D', fontWeight: 700, textAlign: 'right' }}>
                          ✓ لا مؤشرات — سلوك مساهمة طبيعي
                        </div>
                      )}

                      {anySuspended && detail.risk?.tenant?.reporting_suspended_reason && (
                        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '11px', padding: '13px 16px', marginBottom: '16px', textAlign: 'right' }}>
                          <div style={{ fontSize: '12.5px', fontWeight: 900, color: '#B91C1C', marginBottom: '4px' }}>سبب الإيقاف المُبلَّغ للشركة</div>
                          <p style={{ fontSize: '13px', color: '#7F1D1D', margin: 0, fontWeight: 600, lineHeight: 1.9 }}>
                            {detail.risk.tenant.reporting_suspended_reason}
                          </p>
                        </div>
                      )}

                      {(!r.reporting_suspended || !r.company_add_suspended) && (
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="سبب الإيقاف — يصل الشركة، وتراه عند كل محاولة"
                          style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '14px', outline: 'none', fontFamily: 'inherit', textAlign: 'right', minHeight: '68px', resize: 'vertical', marginBottom: '13px' }}
                        />
                      )}

                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flexDirection: 'row-reverse' }}>
                        <button
                          onClick={() => setLever(r, 'reporting_suspended', !r.reporting_suspended)}
                          disabled={busyId === r.tenant_id}
                          style={{ padding: '11px 18px', background: r.reporting_suspended ? '#16A34A' : '#FEE2E2', color: r.reporting_suspended ? '#fff' : '#B91C1C', border: 0, borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          {r.reporting_suspended ? 'إعادة تفعيل التقارير' : 'إيقاف تقديم التقارير'}
                        </button>
                        <button
                          onClick={() => setLever(r, 'company_add_suspended', !r.company_add_suspended)}
                          disabled={busyId === r.tenant_id}
                          style={{ padding: '11px 18px', background: r.company_add_suspended ? '#16A34A' : '#FEE2E2', color: r.company_add_suspended ? '#fff' : '#B91C1C', border: 0, borderRadius: '10px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          {r.company_add_suspended ? 'إعادة تفعيل إضافة الشركات' : 'إيقاف إضافة الشركات'}
                        </button>
                        <span style={{ alignSelf: 'center', fontSize: '12px', color: '#64748B', fontWeight: 600, lineHeight: 1.8 }}>
                          الحساب يبقى نشطاً: البحث والمراقبة والاشتراك لا تتأثر
                        </span>
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
