import { useCallback, useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { notifyTenant } from '../lib/notify'

/**
 * /admin/company-verification — deciding which companies carry the badge.
 *
 * The screen held five invented companies in useState, with invented reviewers
 * attached to them, and two buttons that edited the array. Verification is the
 * one signal on Marsad that is supposed to mean a person checked, and nothing
 * here had ever set it: companies.verified was written by no code path in the
 * product, so the ✔ shown beside a company name anywhere came from seed data
 * rather than from a decision.
 *
 * Migration 026 closed the other end — a company cannot mark itself verified,
 * and editing a verified profile drops it back to pending re-verification. That
 * left the queue with no way to be cleared. This is that way.
 */

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }
const COLS = '1.9fr 1.1fr 0.9fr 1fr 1.6fr'

const TABS = [
  { id: 'pending', label: 'بانتظار التوثيق' },
  { id: 'reverify', label: 'أُعيدت للمراجعة' },
  { id: 'verified', label: 'موثّقة' },
]

// What a verified record is expected to carry. A company missing half of these
// is not ready to be vouched for, and naming which half is more use to a
// reviewer than a percentage.
const REQUIRED = [
  { key: 'cr_number', label: 'السجل التجاري' },
  { key: 'unified_number', label: 'الرقم الموحّد' },
  { key: 'entity_type', label: 'نوع الكيان' },
  { key: 'sector', label: 'القطاع' },
  { key: 'main_activity', label: 'النشاط الرئيسي' },
  { key: 'city', label: 'المدينة' },
  { key: 'official_email', label: 'البريد الرسمي' },
  { key: 'phone', label: 'الهاتف' },
]

const COLUMNS = 'id, name, name_en, cr_number, unified_number, entity_type, sector, main_activity, city, region, official_email, phone, website, source, verified, verified_at, verification_source, created_at'

export default function AdminCompanyVerification() {
  const { user } = useUser()
  const [tab, setTab] = useState('pending')
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({ pending: 0, reverify: 0, verified: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState('')

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 4500) }

  const load = useCallback(async () => {
    try {
      setError('')
      const supabase = getSupabase()
      const approved = () => supabase.from('companies').select(COLUMNS).eq('approved', true)
      const notReverify = 'verification_source.is.null,verification_source.neq.pending_reverification'

      const q =
        tab === 'verified'
          ? approved().eq('verified', true).order('verified_at', { ascending: false })
          : tab === 'reverify'
            ? approved().eq('verified', false).eq('verification_source', 'pending_reverification').order('created_at', { ascending: false })
            : approved().eq('verified', false).or(notReverify).order('created_at', { ascending: false })

      const head = () => supabase.from('companies').select('id', { count: 'exact', head: true }).eq('approved', true)

      const [{ data, error: e }, pendingC, reverifyC, verifiedC] = await Promise.all([
        q.limit(100),
        head().eq('verified', false).or(notReverify),
        head().eq('verified', false).eq('verification_source', 'pending_reverification'),
        head().eq('verified', true),
      ])
      if (e) throw e

      setRows(data || [])
      setCounts({ pending: pendingC.count || 0, reverify: reverifyC.count || 0, verified: verifiedC.count || 0 })
    } catch (err) {
      setError(err.message || 'تعذّر تحميل الشركات')
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { load() }, [load])

  const { connected, liveAt } = useLiveData(load, { tables: ['companies'] })

  const missingOf = (c) => REQUIRED.filter((f) => !c[f.key])

  const decide = async (c, verified) => {
    const missing = missingOf(c)
    if (verified && missing.length) {
      showToast(`❌ ناقص: ${missing.map((m) => m.label).join('، ')}`)
      return
    }
    try {
      setBusyId(c.id)
      const supabase = getSupabase()

      const { data, error: e } = await supabase
        .from('companies')
        .update({
          verified,
          verified_at: verified ? new Date().toISOString() : null,
          verification_source: verified ? 'marsad_review' : 'rejected',
        })
        .eq('id', c.id)
        .select('id, verified')

      if (e) throw e
      if (!data?.length) throw new Error('لم يُحفظ القرار — تحقّق من صلاحيتك')

      // audit_logs records who decided; the company row carries only the outcome.
      // Without this a badge has no author.
      await supabase.from('audit_logs').insert([{
        actor_id: user?.id,
        action: verified ? 'company_verified' : 'company_verification_withdrawn',
        entity: 'company',
        entity_id: c.id,
        meta: JSON.stringify({ company_name: c.name, cr_number: c.cr_number }),
        created_at: new Date().toISOString(),
      }])

      // A community-added company nobody has claimed has no one to tell, and
      // that is not an error.
      const { data: owner } = await supabase.from('tenants').select('id').eq('company_id', c.id).maybeSingle()
      if (owner?.id) {
        await notifyTenant(owner.id, 'company_approved', {
          title: verified ? 'تم توثيق شركتك' : 'سُحب توثيق شركتك',
          message: verified
            ? `أصبحت «${c.name}» موثّقة في سجل مرصد.`
            : `راجع بيانات «${c.name}» ثم تواصل مع إدارة مرصد.`,
          meta: { company_id: c.id, verified },
        })
      }

      await load()
      showToast(verified ? '✅ وُثّقت الشركة' : 'سُحب التوثيق')
    } catch (err) {
      showToast(`❌ ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: '#64748B', fontWeight: 600 }}>جاري التحميل...</div>
  }

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 100, boxShadow: '0 8px 24px rgba(15,23,42,.25)', maxWidth: '460px', lineHeight: 1.8 }}>{toast}</div>
      )}

      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px', textAlign: 'right' }}>توثيق الشركات</h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>الشارة تعني أن أحداً من مرصد راجع البيانات — ولا تُمنح إلا من هنا</p>
        </div>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#B91C1C', fontSize: '14px', fontWeight: 700 }}>⚠️ {error}</div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setOpenId(null) }} style={{ padding: '10px 20px', background: tab === t.id ? '#1E2A52' : '#fff', color: tab === t.id ? '#fff' : '#334155', border: tab === t.id ? 0 : '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            {t.label} ({counts[t.id]})
          </button>
        ))}
      </div>

      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '14px 18px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B', textAlign: 'right' }}>
          <span>الشركة</span><span>السجل التجاري</span><span>المصدر</span><span>اكتمال البيانات</span><span>الإجراء</span>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '44px', textAlign: 'center' }}>
            <div style={{ fontSize: '38px', marginBottom: '10px' }}>{tab === 'verified' ? '✔' : '📭'}</div>
            <p style={{ fontSize: '14px', color: '#64748B', fontWeight: 600, margin: 0 }}>
              {tab === 'pending' ? 'لا توجد شركات تنتظر التوثيق' : tab === 'reverify' ? 'لا توجد شركات أُعيدت للمراجعة' : 'لا توجد شركات موثّقة بعد'}
            </p>
          </div>
        ) : rows.map((c) => {
          const missing = missingOf(c)
          const done = REQUIRED.length - missing.length
          const pct = Math.round((done / REQUIRED.length) * 100)
          const open = openId === c.id
          return (
            <div key={c.id} style={{ borderBottom: '1px solid #F1F5F9', opacity: busyId === c.id ? 0.55 : 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '14px 18px', alignItems: 'center', textAlign: 'right' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{c.name}{c.verified ? ' ✔' : ''}</div>
                  <div style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>{c.city || '—'}{c.sector ? ` · ${c.sector}` : ''}</div>
                </div>
                <span style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>{c.cr_number || '—'}</span>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: c.source === 'official' ? '#0369A1' : '#64748B' }}>{c.source === 'official' ? 'رسمي' : 'مجتمعي'}</span>
                <div>
                  <div style={{ height: '6px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden', marginBottom: '4px' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#16A34A' : pct >= 60 ? '#F59E0B' : '#DC2626' }} />
                  </div>
                  <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>{done}/{REQUIRED.length}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => setOpenId(open ? null : c.id)} style={{ background: '#F1F5F9', color: '#334155', border: 0, borderRadius: '8px', padding: '7px 13px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {open ? 'إخفاء' : 'تفاصيل'}
                  </button>
                  {!c.verified ? (
                    <button
                      onClick={() => decide(c, true)}
                      disabled={busyId === c.id || missing.length > 0}
                      title={missing.length ? `ناقص: ${missing.map((m) => m.label).join('، ')}` : ''}
                      style={{ background: missing.length ? '#CBD5E1' : '#16A34A', color: '#fff', border: 0, borderRadius: '8px', padding: '7px 13px', fontSize: '12.5px', fontWeight: 800, cursor: missing.length ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                    >
                      توثيق
                    </button>
                  ) : (
                    <button onClick={() => decide(c, false)} disabled={busyId === c.id} style={{ background: '#FEE2E2', color: '#B91C1C', border: 0, borderRadius: '8px', padding: '7px 13px', fontSize: '12.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                      سحب التوثيق
                    </button>
                  )}
                </div>
              </div>

              {open && (
                <div style={{ padding: '4px 18px 18px', background: '#FAFCFF' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '13px', textAlign: 'right' }}>
                    {[
                      ['الاسم الإنجليزي', c.name_en],
                      ['الرقم الموحّد', c.unified_number],
                      ['نوع الكيان', c.entity_type],
                      ['النشاط الرئيسي', c.main_activity],
                      ['المنطقة', c.region],
                      ['البريد الرسمي', c.official_email],
                      ['الهاتف', c.phone],
                      ['الموقع', c.website],
                      ['مصدر التوثيق', c.verification_source === 'pending_reverification' ? 'عُدِّل الملف — يحتاج إعادة مراجعة' : c.verification_source],
                      ['وُثّقت في', c.verified_at ? new Date(c.verified_at).toLocaleString('en-GB') : null],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>{k}</div>
                        <div style={{ fontSize: '13.5px', fontWeight: 700, color: v ? '#334155' : '#CBD5E1' }}>{v || '—'}</div>
                      </div>
                    ))}
                  </div>
                  {missing.length > 0 && (
                    <div style={{ marginTop: '14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', color: '#92400E', fontWeight: 700, textAlign: 'right', lineHeight: 1.8 }}>
                      لا يمكن التوثيق قبل استكمال: {missing.map((m) => m.label).join('، ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
