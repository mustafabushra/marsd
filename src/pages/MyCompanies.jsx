import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { useEntitlements } from '../hooks/useEntitlements'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { SkeletonPage, SkeletonTable } from '../components/Skeleton'

/**
 * /my-companies — the registry entries this company contributed.
 *
 * Adding a company was a one-way action: the form thanked you and that was the
 * last you saw of it. Whether it was approved, what it earned, or why it was
 * rejected lived only in the admin queue. On a plan where contributions buy
 * entitlements, a contributor cannot see what they are owed — so this is the
 * other half of Give-to-Get, not a listing screen.
 *
 * companies carries no submitter column, so the entries are found through the
 * audit rows written when they were filed. That is also what makes the ledger
 * legible: each approved entry is matched to the credit it produced.
 */

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }

const STATUS = {
  approved: { label: 'معتمدة', bg: '#ECFDF5', fg: '#15803D' },
  active: { label: 'معتمدة', bg: '#ECFDF5', fg: '#15803D' },
  pending: { label: 'قيد المراجعة', bg: '#FEF3C7', fg: '#92400E' },
  rejected: { label: 'مرفوضة', bg: '#FEE2E2', fg: '#B91C1C' },
  suspended: { label: 'موقوفة', bg: '#F1F5F9', fg: '#475569' },
}

export default function MyCompanies() {
  const navigate = useNavigate()
  const { isLoaded, user } = useUser()
  const { entitlements, giveToGetEnabled } = useEntitlements()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return }
    try {
      setError('')
      const supabase = getSupabase()

      const { data: me } = await supabase.from('users').select('tenant_id').eq('id', user.id).maybeSingle()
      if (!me?.tenant_id) { setRows([]); setLoading(false); return }

      // Which companies this tenant filed, and when.
      const { data: filed, error: auditErr } = await supabase
        .from('audit_logs')
        .select('entity_id, created_at, actor_id')
        .eq('tenant_id', me.tenant_id)
        .eq('action', 'company_add_requested')
        .order('created_at', { ascending: false })
      if (auditErr) throw auditErr

      const ids = [...new Set((filed || []).map((r) => r.entity_id).filter(Boolean))]
      if (ids.length === 0) { setRows([]); setLoading(false); return }

      const [{ data: companies }, { data: credits }] = await Promise.all([
        supabase.from('companies').select('id, name, cr_number, sector, city, status, approved, created_at').in('id', ids),
        // Only the entries that were paid for, so an approved company with no
        // credit shows as approved rather than silently implying one.
        supabase.from('credits_ledger').select('amount, created_at, reason')
          .eq('tenant_id', me.tenant_id).eq('reason', 'company_added'),
      ])

      const byId = new Map((companies || []).map((c) => [c.id, c]))
      const earnedTotal = (credits || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)

      setRows({
        earnedTotal,
        items: ids.map((cid) => {
          const c = byId.get(cid)
          const filedAt = (filed || []).find((f) => f.entity_id === cid)?.created_at
          return {
            id: cid,
            name: c?.name || 'شركة محذوفة',
            crNumber: c?.cr_number || '—',
            sector: c?.sector || '—',
            city: c?.city || '—',
            // approved is the flag the review sets; status carries the wider
            // lifecycle. A row missing from companies was removed after filing.
            status: !c ? 'rejected' : (c.approved ? (c.status || 'approved') : 'pending'),
            filedAt: filedAt ? new Date(filedAt).toLocaleDateString('en-GB') : '—',
            exists: !!c,
          }
        }),
      })
    } catch (err) {
      setError(err.message || 'تعذّر تحميل الشركات')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { if (isLoaded) load() }, [isLoaded, load])

  // A company sits here as "قيد المراجعة" until Marsad approves it, and the
  // credit for adding it lands at the same moment.
  const { connected, liveAt } = useLiveData(load, {
    tables: ['companies', 'audit_logs', 'credits_ledger'],
    enabled: !!user?.id,
  })

  if (loading) {
    return (
      <>
        <SkeletonPage stats={0} panels={0} />
        <SkeletonTable rows={7} cols={4} />
      </>
    )
  }

  const items = rows.items || []
  const approved = items.filter((r) => r.status === 'approved' || r.status === 'active').length
  const pending = items.filter((r) => r.status === 'pending').length
  const pointsPer = Number(entitlements?.giveToGetRules?.earn?.company_added?.points) || 0

  return (
    <div>
      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '13px 16px', marginBottom: '16px', color: '#B91C1C', fontSize: '14px', fontWeight: 700 }}>⚠️ {error}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: 0 }}>الشركات المُرسلة ({items.length})</h2>
            <LiveBadge connected={connected} liveAt={liveAt} />
          </div>
          <p style={{ fontSize: '13px', color: '#64748B', margin: '3px 0 0', fontWeight: 600 }}>
            الشركات التي أضافها فريقك لسجل مرصد وحالة مراجعتها
          </p>
        </div>
        <button onClick={() => navigate('/add-company')} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '10px 20px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          + إضافة شركة
        </button>
      </div>

      {/* Counts, and what they earned. Numbers come from the ledger rather than
          from multiplying approvals by the rate: the monthly cap and the rate
          itself both change, and a computed figure would disagree with the
          balance the member can see on /subscription. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '12px', marginBottom: '18px' }}>
        {[
          { label: 'معتمدة', value: approved, color: '#15803D', bg: '#ECFDF5' },
          { label: 'قيد المراجعة', value: pending, color: '#92400E', bg: '#FFFBEB' },
          ...(giveToGetEnabled ? [{ label: 'نقاط من إضافة الشركات', value: rows.earnedTotal || 0, color: '#1E2A52', bg: '#EEF2FF' }] : []),
        ].map((s) => (
          <div key={s.label} style={{ ...card, background: s.bg, border: 'none', padding: '16px 18px' }}>
            <div style={{ fontSize: '26px', fontWeight: 900, color: s.color, lineHeight: 1.2 }}>{s.value}</div>
            <div style={{ fontSize: '13px', color: s.color, fontWeight: 700, marginTop: '3px', opacity: 0.85 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {giveToGetEnabled && pending > 0 && pointsPer > 0 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', padding: '13px 16px', marginBottom: '18px', fontSize: '13.5px', color: '#92400E', fontWeight: 700, lineHeight: 1.8 }}>
          لديك {pending} {pending === 1 ? 'شركة' : 'شركات'} قيد المراجعة — تُضاف {pointsPer * pending} نقطة لرصيدك عند اعتمادها.
        </div>
      )}

      {items.length === 0 ? (
        <div style={{ ...card, padding: '44px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏢</div>
          <h4 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 8px' }}>لم تُضِف شركات بعد</h4>
          <p style={{ fontSize: '13.5px', color: '#64748B', lineHeight: 1.9, margin: '0 auto 18px', maxWidth: '420px' }}>
            {giveToGetEnabled
              ? 'كل شركة تضيفها لسجل مرصد تُراجَع، وعند اعتمادها تُضاف نقاط لرصيد شركتك توسّع حدودك.'
              : 'أضِف الشركات التي تتعامل معها ولم تجدها في السجل.'}
          </p>
          <button onClick={() => navigate('/add-company')} style={{ background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', padding: '11px 26px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            أضِف أول شركة
          </button>
        </div>
      ) : (
        <div className="marsad-table" style={{ ...card, overflowX: 'auto' }}>
          {/* Six columns on a desktop, a card per company on a phone: the
              stylesheet reads marsad-table with the data-attributes below. Six
              columns across 320px is fifty pixels each. */}
          <div style={{ minWidth: '720px' }}>
            <div data-table-head style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr 1fr 0.9fr', padding: '14px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '12.5px', fontWeight: 800, color: '#64748B' }}>
              <span>الشركة</span><span>السجل التجاري</span><span>القطاع</span><span>المدينة</span><span>تاريخ الإرسال</span><span>الحالة</span>
            </div>
            {items.map((r) => {
              const s = STATUS[r.status] || STATUS.pending
              return (
                <div
                  key={r.id}
                  data-table-row
                  onClick={() => r.exists && navigate(`/trust-report/${r.id}`)}
                  style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr 1fr 0.9fr', padding: '14px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center', cursor: r.exists ? 'pointer' : 'default', gap: '8px' }}
                >
                  <span data-label="الشركة" style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>{r.name}</span>
                  <span data-label="السجل التجاري" style={{ fontSize: '13px', color: '#64748B', direction: 'ltr', textAlign: 'right' }}>{r.crNumber}</span>
                  <span data-label="القطاع" style={{ fontSize: '13px', color: '#64748B' }}>{r.sector}</span>
                  <span data-label="المدينة" style={{ fontSize: '13px', color: '#64748B' }}>{r.city}</span>
                  <span data-label="تاريخ الإرسال" style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>{r.filedAt}</span>
                  <span data-label="الحالة">
                    <span style={{ background: s.bg, color: s.fg, borderRadius: '7px', padding: '4px 12px', fontSize: '12.5px', fontWeight: 800, whiteSpace: 'nowrap' }}>{s.label}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
