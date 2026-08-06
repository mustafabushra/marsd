import { useCallback, useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { notifyUser } from '../lib/notify'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { SkeletonPage, SkeletonTable } from '../components/Skeleton'

/**
 * /admin/claim-requests — someone says a company in the registry is theirs.
 *
 * Approving a claim is the moment a person becomes a customer, and every step of
 * it was broken:
 *
 *   · The notification named user_id and omitted tenant_id, which is NOT NULL,
 *     so the insert always failed — and its error was swallowed by
 *     .catch(console.warn). It also JSON.stringify'd the payload into a jsonb
 *     column, so payload.message would have been undefined even had it landed.
 *     The notifications table holds zero rows; not one claimant has ever been
 *     told anything.
 *
 *   · The check for an existing tenant was .eq('id', userId) — a Clerk text id
 *     compared against a uuid primary key, with a .catch swallowing the type
 *     error. It could never match, so every approval took the create-a-tenant
 *     branch.
 *
 *   · That branch selected companies.email, which does not exist — the column is
 *     official_email — so the select was rejected, company came back null, and
 *     the next line read company.name off it.
 *
 *   · And the user was linked with users.company_id while the whole application
 *     reads users.tenant_id. Even past the crash, the claimant would have ended
 *     up outside the tenant that had just been created for them.
 *
 * Approving a claim is now one thing: attach the claimant to the tenant that
 * owns the company, creating that tenant if the company has none, and tell them.
 */

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }

export default function AdminClaimRequests() {
  const { user } = useUser()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [processingId, setProcessingId] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 4500) }

  const load = useCallback(async () => {
    try {
      setError('')
      const { data, error: e } = await getSupabase()
        .from('claim_requests')
        .select(`
          id, company_id, user_id, status, submitted_at, rejection_reason,
          companies ( id, name, cr_number, city, sector ),
          users ( id, email, first_name, last_name )
        `)
        .eq('status', 'pending')
        .order('submitted_at', { ascending: false })
      if (e) throw e
      setRequests(data || [])
    } catch (err) {
      setError(err.message || 'فشل تحميل طلبات الملكية')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const { connected, liveAt } = useLiveData(load, { tables: ['claim_requests'] })

  /** The tenant that owns this company, created if there is none. */
  const tenantForCompany = async (companyId) => {
    const supabase = getSupabase()

    const { data: existing } = await supabase
      .from('tenants').select('id').eq('company_id', companyId).maybeSingle()
    if (existing?.id) return existing.id

    // official_email, not email. The old code asked for a column that does not
    // exist, which rejects the whole select rather than returning it null.
    const { data: company, error: cErr } = await supabase
      .from('companies')
      .select('name, cr_number, official_email, phone, sector, city')
      .eq('id', companyId)
      .single()
    if (cErr) throw cErr

    const { data: created, error: tErr } = await supabase
      .from('tenants')
      .insert([{
        name: company.name,
        cr_number: company.cr_number,
        email: company.official_email || '',   // NOT NULL, may be blank
        phone: company.phone || '',
        sector: company.sector || '',
        city: company.city || '',
        company_id: companyId,
        status: 'active',
      }])
      .select('id')
    if (tErr) throw tErr
    if (!created?.length) throw new Error('تعذّر إنشاء كيان الشركة')
    return created[0].id
  }

  const approve = async (req) => {
    if (processingId) return
    setProcessingId(req.id)
    setError('')
    try {
      const supabase = getSupabase()
      const tenantId = await tenantForCompany(req.company_id)

      // tenant_id, not company_id: users.tenant_id is what every screen and
      // every policy in the platform reads. Writing the other column linked the
      // claimant to nothing.
      const { data: linked, error: uErr } = await supabase
        .from('users')
        .update({ tenant_id: tenantId, role: 'company_admin', status: 'active' })
        .eq('id', req.user_id)
        .select('id, tenant_id')
      if (uErr) throw uErr
      if (!linked?.length) throw new Error('لم يُربط المستخدم بالشركة — تحقّق من صلاحيتك')

      const { data: claim, error: cErr } = await supabase
        .from('claim_requests')
        .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: user?.id, tenant_id: tenantId })
        .eq('id', req.id)
        .select('id, status')
      if (cErr) throw cErr
      if (!claim?.length) throw new Error('لم تُحفظ حالة الطلب')

      await notifyUser(req.user_id, tenantId, 'claim_approved', {
        title: 'تمت الموافقة على طلب الملكية',
        message: `أصبحت مسؤولاً عن «${req.companies?.name}» في مرصد.`,
        meta: { company_id: req.company_id },
      })

      await supabase.from('audit_logs').insert([{
        actor_id: user?.id, action: 'claim_approved', entity: 'claim_request', entity_id: req.id,
        meta: JSON.stringify({ company_id: req.company_id, user_id: req.user_id }),
        created_at: new Date().toISOString(),
      }])

      await load()
      showToast('✅ تمت الموافقة، ورُبط الحساب بالشركة')
    } catch (err) {
      setError(err.message || 'فشل الموافقة على الطلب')
    } finally {
      setProcessingId(null)
    }
  }

  const reject = async (req) => {
    if (!rejectionReason.trim()) { setError('يجب إدخال سبب الرفض'); return }
    if (processingId) return
    setProcessingId(req.id)
    setError('')
    try {
      const supabase = getSupabase()
      const { data, error: e } = await supabase
        .from('claim_requests')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason.trim(),
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id,
        })
        .eq('id', req.id)
        .select('id, status')
      if (e) throw e
      if (!data?.length) throw new Error('لم يُحفظ الرفض — تحقّق من صلاحيتك')

      // A rejected claimant may have no tenant at all, and tenant_id is NOT
      // NULL. Where the company already has an owner the message goes there;
      // otherwise there is nowhere to put it, and the reason is on the row.
      const { data: owner } = await supabase
        .from('tenants').select('id').eq('company_id', req.company_id).maybeSingle()
      if (owner?.id) {
        await notifyUser(req.user_id, owner.id, 'claim_rejected', {
          title: 'رُفض طلب الملكية',
          message: rejectionReason.trim(),
          meta: { company_id: req.company_id },
        })
      }

      await supabase.from('audit_logs').insert([{
        actor_id: user?.id, action: 'claim_rejected', entity: 'claim_request', entity_id: req.id,
        meta: JSON.stringify({ reason: rejectionReason.trim() }),
        created_at: new Date().toISOString(),
      }])

      setRejectionReason('')
      setSelectedId(null)
      await load()
      showToast('تم رفض الطلب')
    } catch (err) {
      setError(err.message || 'فشل رفض الطلب')
    } finally {
      setProcessingId(null)
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

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 100, boxShadow: '0 8px 24px rgba(15,23,42,.25)', maxWidth: '460px', lineHeight: 1.8 }}>{toast}</div>
      )}

      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px', textAlign: 'right' }}>طلبات ملكية الشركات</h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>الموافقة تربط مقدّم الطلب بحساب الشركة مديراً لها</p>
        </div>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#B91C1C', fontSize: '14px', fontWeight: 700, textAlign: 'right' }}>⚠️ {error}</div>
      )}

      {requests.length === 0 ? (
        <div style={{ ...card, padding: '44px', textAlign: 'center' }}>
          <div style={{ fontSize: '38px', marginBottom: '10px' }}>📭</div>
          <p style={{ fontSize: '14px', color: '#64748B', fontWeight: 600, margin: 0 }}>لا توجد طلبات ملكية معلّقة</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {requests.map((r) => {
            const busy = processingId === r.id
            const rejecting = selectedId === r.id
            const claimant = `${r.users?.first_name || ''} ${r.users?.last_name || ''}`.trim() || r.users?.email || '—'
            return (
              <div key={r.id} style={{ ...card, padding: '22px', opacity: busy ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap', flexDirection: 'row-reverse' }}>
                  <div style={{ textAlign: 'right', flex: 1, minWidth: 0 }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px' }}>{r.companies?.name || 'شركة'}</h2>
                    <p style={{ fontSize: '13px', color: '#64748B', margin: 0, lineHeight: 1.9 }}>
                      سجل {r.companies?.cr_number || '—'}{r.companies?.city ? ` · ${r.companies.city}` : ''}
                      <br />
                      مقدّم الطلب: <strong style={{ color: '#334155' }}>{claimant}</strong> — {r.users?.email}
                    </p>
                  </div>
                  <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, flexShrink: 0 }}>
                    {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString('en-GB') : '—'}
                  </span>
                </div>

                {rejecting && (
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="سبب الرفض — يصل لمقدّم الطلب"
                    style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '14px', outline: 'none', fontFamily: 'inherit', textAlign: 'right', minHeight: '80px', resize: 'vertical', marginTop: '14px' }}
                  />
                )}

                <div style={{ display: 'flex', gap: '10px', flexDirection: 'row-reverse', marginTop: '16px' }}>
                  {!rejecting ? (
                    <>
                      <button onClick={() => approve(r)} disabled={busy} style={{ flex: 1, padding: '12px 16px', background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>✓ موافقة</button>
                      <button onClick={() => { setSelectedId(r.id); setRejectionReason('') }} disabled={busy} style={{ flex: 1, padding: '12px 16px', background: '#FEE2E2', color: '#DC2626', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>✕ رفض</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => reject(r)} disabled={busy || !rejectionReason.trim()} style={{ flex: 1, padding: '12px 16px', background: rejectionReason.trim() ? '#DC2626' : '#CBD5E1', color: '#fff', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: rejectionReason.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>تأكيد الرفض</button>
                      <button onClick={() => { setSelectedId(null); setRejectionReason('') }} style={{ flex: 1, padding: '12px 16px', background: '#F1F5F9', color: '#334155', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>إلغاء</button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
