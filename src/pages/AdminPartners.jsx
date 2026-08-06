import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '../lib/api'
import { notifyTenant } from '../lib/notify'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { SkeletonPage, SkeletonTable } from '../components/Skeleton'

/**
 * /admin/partners — the partner programme, which the public site has been
 * advertising and the platform has never had.
 *
 * /partners lists four partner companies with sectors, report counts and join
 * dates. All four are a hardcoded array of invented names. It states entry
 * requirements and six benefits, and its application form calls setSubmitted and
 * writes nothing. A company could read the terms, apply, be thanked, and leave
 * no trace.
 *
 * A partner here is a company on a granted plan: an active subscription on a
 * zero-price plan with a real end date. So the limits, the features and the
 * expiry all run through the same machinery every other plan uses, and none of
 * it needed a special case.
 *
 * The list answers three questions at once — who is waiting, who is running, and
 * who already meets the terms without having asked. The third is the one that
 * grows the programme, and it is the one nobody could see.
 */

const STATE = {
  partner:  { t: 'شريك حالي', bg: '#ECFDF5', c: '#15803D' },
  pending:  { t: 'طلب قيد الدراسة', bg: '#EEF2FF', c: '#1E40AF' },
  eligible: { t: 'مستوفٍ للشروط', bg: '#FFFBEB', c: '#B45309' },
  below:    { t: 'دون الشروط', bg: '#F1F5F9', c: '#64748B' },
}

const fmt = (d) => (d ? new Date(d).toLocaleDateString('ar-SA') : '—')
const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '20px' }

export default function AdminPartners() {
  const [rows, setRows] = useState([])
  const [terms, setTerms] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [decide, setDecide] = useState(null)   // { row, approve }
  const [revoke, setRevoke] = useState(null)
  // Marsad appoints partners; the application form is the second way in, not the
  // first. The eligible rows used to say "يستحق الدعوة" beside no button at all.
  const [appoint, setAppoint] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 4000) }

  const load = useCallback(async () => {
    try {
      setError('')
      const sb = getSupabase()
      const [a, b] = await Promise.all([
        sb.rpc('partner_overview'),
        sb.from('system_settings').select('value').eq('key', 'partner_program').maybeSingle(),
      ])
      if (a.error) throw a.error
      setRows(a.data || [])
      setTerms(b.data?.value || null)
    } catch (err) {
      setError(err?.message || 'تعذّر تحميل الشركاء')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  const { connected, liveAt } = useLiveData(load, {
    tables: ['subscriptions', 'reports', 'tenants'],
  })

  const counts = useMemo(() => ({
    all: rows.length,
    partner: rows.filter((r) => r.state === 'partner').length,
    pending: rows.filter((r) => r.state === 'pending').length,
    eligible: rows.filter((r) => r.state === 'eligible').length,
    // A partnership ending inside a month is a renewal decision nobody is being
    // reminded of anywhere else.
    expiring: rows.filter((r) => r.state === 'partner' && r.days_left != null && r.days_left <= 30).length,
  }), [rows])

  const shown = useMemo(
    () => (filter === 'all' ? rows
      : filter === 'expiring'
        ? rows.filter((r) => r.state === 'partner' && r.days_left != null && r.days_left <= 30)
        : rows.filter((r) => r.state === filter)),
    [rows, filter])

  const submitDecision = async () => {
    try {
      setBusy(true)
      const { row, approve } = decide
      const { data, error: e } = await getSupabase().rpc('decide_partnership', {
        p_application_id: row.application_id,
        p_approve: approve,
        p_reason: decide.reason.trim(),
        p_months: approve ? Number(decide.months) || null : null,
      })
      if (e) throw e
      if (!data?.ok) { showToast('❌ ' + (data?.reason || 'تعذّر الحفظ')); return }

      await notifyTenant(row.tenant_id, 'subscription_changed', {
        title: approve ? 'قُبلت شراكتكم مع مرصد' : 'قرار بشأن طلب الشراكة',
        message: approve
          ? `أصبحتم شركاء حتى ${fmt(data.until)} — باقة الشريك مفعّلة على حسابكم. ${decide.reason.trim()}`
          : decide.reason.trim(),
        meta: { application_id: row.application_id, approved: approve },
      })

      showToast(approve ? `✅ اعتُمدت الشراكة حتى ${fmt(data.until)}` : 'سُجّل الرفض وأُبلغت الشركة')
      setDecide(null)
      await load()
    } catch (err) { showToast('❌ ' + (err?.message || 'خطأ')) } finally { setBusy(false) }
  }

  const submitAppoint = async () => {
    try {
      setBusy(true)
      const { data, error: e } = await getSupabase().rpc('grant_partnership', {
        p_tenant_id: appoint.tenant_id,
        p_reason: appoint.reason.trim(),
        p_months: Number(appoint.months) || null,
      })
      if (e) throw e
      if (!data?.ok) { showToast('❌ ' + (data?.reason || 'تعذّر التعيين')); return }

      await notifyTenant(appoint.tenant_id, 'subscription_changed', {
        title: 'اختارتكم مرصد شريكاً',
        message: `شراكتكم فعّالة حتى ${fmt(data.until)} — باقة الشريك مفعّلة على حسابكم. ${appoint.reason.trim()}`,
        meta: { appointed: true },
      })
      showToast(`✅ عُيّنت الشركة شريكاً حتى ${fmt(data.until)}`)
      setAppoint(null)
      await load()
    } catch (err) { showToast('❌ ' + (err?.message || 'خطأ')) } finally { setBusy(false) }
  }

  const submitRevoke = async () => {
    try {
      setBusy(true)
      const { data, error: e } = await getSupabase().rpc('revoke_partnership', {
        p_tenant_id: revoke.tenant_id, p_reason: revoke.reason.trim(),
      })
      if (e) throw e
      if (!data?.ok) { showToast('❌ ' + (data?.reason || 'تعذّر السحب')); return }

      await notifyTenant(revoke.tenant_id, 'subscription_changed', {
        title: 'أُنهيت شراكتكم مع مرصد',
        message: `${revoke.reason.trim()} — عاد الحساب إلى الباقة الافتراضية.`,
        meta: { revoked: true },
      })
      showToast('سُحبت الشراكة وأُبلغت الشركة')
      setRevoke(null)
      await load()
    } catch (err) { showToast('❌ ' + (err?.message || 'خطأ')) } finally { setBusy(false) }
  }

  if (loading) {
    return (
      <>
        <SkeletonPage stats={0} panels={0} />
        <SkeletonTable rows={7} cols={4} />
      </>
    )
  }

  const CHIPS = [
    { key: 'all', label: 'الكل', value: counts.all, color: '#1E2A52' },
    { key: 'pending', label: 'طلبات قيد الدراسة', value: counts.pending, color: '#1E40AF' },
    { key: 'eligible', label: 'مستوفون لم يتقدّموا', value: counts.eligible, color: '#B45309' },
    { key: 'partner', label: 'شركاء حاليون', value: counts.partner, color: '#15803D' },
    { key: 'expiring', label: 'تنتهي خلال شهر', value: counts.expiring, color: '#DC2626' },
  ]

  const COLS = '2fr 1fr 1fr 0.8fr 1.2fr 1.4fr'

  return (
    <div>
      {toast && <div style={{ position: 'fixed', bottom: '24px', insetInlineStart: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 300 }}>{toast}</div>}

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: '12px', padding: '14px 18px', marginBottom: '16px', fontSize: '13.5px', fontWeight: 700 }}>{error}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <LiveBadge connected={connected} liveAt={liveAt} />
        {terms && (
          <span style={{ marginInlineStart: 'auto', fontSize: '12.5px', color: '#64748B', fontWeight: 700 }}>
            الشروط: {terms.min_companies_added} شركة {terms.requires_both ? 'و' : 'أو'} {terms.min_reports_approved} تقرير معتمد ·
            نسبة رفض ≤ {terms.max_reject_rate}% · تُمنح {terms.grant_months} شهراً
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '12px', marginBottom: '18px' }}>
        {CHIPS.map((s) => (
          <div key={s.key} onClick={() => setFilter(s.key)}
               style={{ background: '#fff', border: `1px solid ${filter === s.key ? s.color : '#E2E8F0'}`, borderRadius: '14px', padding: '16px 18px', cursor: 'pointer' }}>
            <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 700, marginBottom: '7px' }}>{s.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value.toLocaleString('en-US')}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '14px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '12.5px', fontWeight: 800, color: '#64748B' }}>
          <span>الشركة</span><span>تقارير معتمدة</span><span>شركات مضافة</span>
          <span>نسبة الرفض</span><span>الحالة</span><span></span>
        </div>

        {shown.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontSize: '14px' }}>لا توجد شركات في هذه الحالة</div>
        ) : shown.map((r) => {
          const st = STATE[r.state] || STATE.below
          return (
            <div key={r.tenant_id} style={{ display: 'grid', gridTemplateColumns: COLS, padding: '13px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.tenant_name}</div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  {r.sector || '—'} · <span style={{ direction: 'ltr', display: 'inline-block' }}>{r.cr_number || '—'}</span>
                  {r.reporting_suspended && <span style={{ color: '#B91C1C', fontWeight: 800 }}> · موقوفة عن الإبلاغ</span>}
                </div>
              </div>

              <span style={{ fontSize: '15px', fontWeight: 900, color: '#1E2A52' }}>{r.reports_approved}</span>
              <span style={{ fontSize: '15px', fontWeight: 900, color: '#1E2A52' }}>{r.companies_added}</span>
              <span style={{ fontSize: '13.5px', fontWeight: 800, color: r.reject_rate > (terms?.max_reject_rate ?? 20) ? '#B91C1C' : '#64748B' }}>
                {r.reject_rate}%
              </span>

              <span>
                <span style={{ background: st.bg, color: st.c, borderRadius: '7px', padding: '4px 11px', fontSize: '12.5px', fontWeight: 800 }}>{st.t}</span>
                {r.state === 'partner' && r.days_left != null && (
                  <div style={{ fontSize: '11.5px', color: r.days_left <= 30 ? '#B91C1C' : '#64748B', fontWeight: 700, marginTop: '4px' }}>
                    {r.days_left === 0 ? 'تنتهي اليوم' : `${r.days_left} يوماً · حتى ${fmt(r.partner_until)}`}
                    {r.origin && <span style={{ color: '#94A3B8' }}> · {r.origin === 'appointed' ? 'بتعيين من مرصد' : 'بطلب من الشركة'}</span>}
                  </div>
                )}
                {r.state === 'pending' && (
                  <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 700, marginTop: '4px' }}>قُدّم {fmt(r.applied_at)}</div>
                )}
              </span>

              <span style={{ display: 'flex', gap: '7px', justifyContent: 'flex-end' }}>
                {r.state === 'pending' && (
                  <>
                    <button onClick={() => setDecide({ row: r, approve: true, reason: '', months: terms?.grant_months || 12 })}
                            style={{ padding: '7px 14px', borderRadius: '8px', border: 0, background: '#16A34A', color: '#fff', fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>اعتماد</button>
                    <button onClick={() => setDecide({ row: r, approve: false, reason: '', months: null })}
                            style={{ padding: '7px 14px', borderRadius: '8px', border: '1.5px solid #FECACA', background: '#fff', color: '#B91C1C', fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>رفض</button>
                  </>
                )}
                {r.state === 'partner' && (
                  <button onClick={() => setRevoke({ tenant_id: r.tenant_id, name: r.tenant_name, reason: '' })}
                          style={{ padding: '7px 14px', borderRadius: '8px', border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إنهاء الشراكة</button>
                )}
                {r.state !== 'partner' && r.state !== 'pending' && (
                  <button onClick={() => setAppoint({
                            tenant_id: r.tenant_id, name: r.tenant_name, row: r,
                            reason: '', months: terms?.grant_months || 12,
                          })}
                          style={{ padding: '7px 14px', borderRadius: '8px', border: 0,
                                   background: r.qualifies ? '#1E2A52' : '#fff',
                                   color: r.qualifies ? '#fff' : '#475569',
                                   boxShadow: r.qualifies ? 'none' : 'inset 0 0 0 1.5px #E2E8F0',
                                   fontSize: '12px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                    تعيين شريك
                  </button>
                )}
              </span>
            </div>
          )
        })}
      </div>

      {shown.length > 0 && filter === 'eligible' && (
        <div style={{ ...card, marginTop: '16px', background: '#FFFBEB', borderColor: '#FDE68A' }}>
          <div style={{ fontSize: '13.5px', color: '#92400E', fontWeight: 700, lineHeight: 1.8 }}>
            هذه شركات تستوفي الشروط المعلنة ولم تتقدّم. عيّنها مباشرة — لا تحتاج طلباً منها.
          </div>
        </div>
      )}

      {/* Decision */}
      {decide && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 200, padding: '20px' }}
             onClick={(e) => { if (e.target === e.currentTarget && !busy) setDecide(null) }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 900, color: decide.approve ? '#15803D' : '#B91C1C', margin: '0 0 4px' }}>
              {decide.approve ? 'اعتماد الشراكة' : 'رفض طلب الشراكة'}
            </h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px' }}>{decide.row.tenant_name}</p>

            <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '14px', marginBottom: '16px', fontSize: '13px', color: '#334155', fontWeight: 700, lineHeight: 2 }}>
              <div>تقارير معتمدة: {decide.row.reports_approved} · شركات مضافة: {decide.row.companies_added}</div>
              <div>نسبة الرفض: {decide.row.reject_rate}%</div>
              <div style={{ color: decide.row.qualifies ? '#15803D' : '#B45309' }}>
                {decide.row.qualifies ? '✔ يستوفي الشروط المعلنة' : '⚠ لا يستوفي الشروط المعلنة — الاعتماد استثناء'}
              </div>
            </div>

            {decide.row.application_note && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#334155', marginBottom: '5px' }}>ما كتبته الشركة</div>
                <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.7 }}>{decide.row.application_note}</div>
              </div>
            )}

            {decide.approve && (
              <label style={{ display: 'block', marginBottom: '12px' }}>
                <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>مدة الشراكة (شهر)</span>
                <input type="number" min="1" max="60" value={decide.months || ''}
                       onChange={(e) => setDecide((d) => ({ ...d, months: e.target.value }))}
                       style={{ width: '120px', padding: '10px 13px', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit' }} />
              </label>
            )}

            <label>
              <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                السبب <span style={{ color: '#B91C1C' }}>*</span> — يُعرض للشركة
              </span>
              <textarea value={decide.reason} rows={3}
                        onChange={(e) => setDecide((d) => ({ ...d, reason: e.target.value }))}
                        placeholder={decide.approve ? 'مثال: إسهام موثّق في بناء السجل خلال العام' : 'مثال: لم تُستوفَ شروط الإسهام المعلنة بعد'}
                        style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit', resize: 'vertical' }} />
            </label>

            <div style={{ display: 'flex', gap: '9px', marginTop: '18px' }}>
              <button onClick={submitDecision} disabled={busy || !decide.reason.trim()}
                      style={{ padding: '11px 22px', background: decide.reason.trim() ? (decide.approve ? '#16A34A' : '#B91C1C') : '#CBD5E1', color: '#fff', border: 0, borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: decide.reason.trim() && !busy ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                {busy ? 'جارٍ الحفظ…' : (decide.approve ? 'اعتماد وتفعيل الباقة' : 'تسجيل الرفض')}
              </button>
              <button onClick={() => setDecide(null)} disabled={busy}
                      style={{ padding: '11px 20px', background: '#fff', color: '#475569', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {appoint && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 200, padding: '20px' }}
             onClick={(e) => { if (e.target === e.currentTarget && !busy) setAppoint(null) }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#1E2A52', margin: '0 0 4px' }}>تعيين شريك</h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px' }}>{appoint.name}</p>

            <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '14px', marginBottom: '16px', fontSize: '13px', color: '#334155', fontWeight: 700, lineHeight: 2 }}>
              <div>تقارير معتمدة: {appoint.row.reports_approved} · شركات مضافة: {appoint.row.companies_added}</div>
              <div>نسبة الرفض: {appoint.row.reject_rate}%</div>
              <div style={{ color: appoint.row.qualifies ? '#15803D' : '#B45309' }}>
                {appoint.row.qualifies
                  ? '✔ تستوفي الشروط المعلنة'
                  : '⚠ دون الشروط المعلنة — التعيين قرار استثنائي يُسجَّل بسببه'}
              </div>
            </div>

            <label style={{ display: 'block', marginBottom: '12px' }}>
              <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>مدة الشراكة (شهر)</span>
              <input type="number" min="1" max="60" value={appoint.months || ''}
                     onChange={(e) => setAppoint((a) => ({ ...a, months: e.target.value }))}
                     style={{ width: '120px', padding: '10px 13px', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit' }} />
            </label>

            <label>
              <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                سبب التعيين <span style={{ color: '#B91C1C' }}>*</span> — يُعرض للشركة
              </span>
              <textarea value={appoint.reason} rows={3}
                        onChange={(e) => setAppoint((a) => ({ ...a, reason: e.target.value }))}
                        placeholder="مثال: إسهام مبكر وموثوق في بناء سجل القطاع"
                        style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit', resize: 'vertical' }} />
            </label>

            <div style={{ display: 'flex', gap: '9px', marginTop: '18px' }}>
              <button onClick={submitAppoint} disabled={busy || !appoint.reason.trim()}
                      style={{ padding: '11px 22px', background: appoint.reason.trim() ? '#1E2A52' : '#CBD5E1', color: '#fff', border: 0, borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: appoint.reason.trim() && !busy ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                {busy ? 'جارٍ التعيين…' : 'تعيين وتفعيل الباقة'}
              </button>
              <button onClick={() => setAppoint(null)} disabled={busy}
                      style={{ padding: '11px 20px', background: '#fff', color: '#475569', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* Ending a partnership early */}
      {revoke && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 200, padding: '20px' }}
             onClick={(e) => { if (e.target === e.currentTarget && !busy) setRevoke(null) }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '460px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#B91C1C', margin: '0 0 4px' }}>إنهاء الشراكة</h2>
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px', lineHeight: 1.8 }}>
              يعود «{revoke.name}» إلى الباقة الافتراضية فوراً، وتنتهي حدود الشريك ومزاياه.
            </p>
            <label>
              <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                السبب <span style={{ color: '#B91C1C' }}>*</span> — يُعرض للشركة
              </span>
              <textarea value={revoke.reason} rows={3}
                        onChange={(e) => setRevoke((v) => ({ ...v, reason: e.target.value }))}
                        style={{ width: '100%', padding: '10px 13px', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontFamily: 'inherit', resize: 'vertical' }} />
            </label>
            <div style={{ display: 'flex', gap: '9px', marginTop: '18px' }}>
              <button onClick={submitRevoke} disabled={busy || !revoke.reason.trim()}
                      style={{ padding: '11px 22px', background: revoke.reason.trim() ? '#B91C1C' : '#FCA5A5', color: '#fff', border: 0, borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: revoke.reason.trim() && !busy ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                {busy ? 'جارٍ الإنهاء…' : 'تأكيد الإنهاء'}
              </button>
              <button onClick={() => setRevoke(null)} disabled={busy}
                      style={{ padding: '11px 20px', background: '#fff', color: '#475569', border: '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
