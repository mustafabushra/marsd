import { useCallback, useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { notifyTenant } from '../lib/notify'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { StatTile, STATUS_COLOR } from '../components/Charts'

/**
 * /admin/disputes — a company has objected to something published about it.
 *
 * The screen held invented objections in useState and was not reachable from the
 * navigation at all, so a company that believed a report about it was false had
 * no route inside the product. Marsad publishes an adverse claim about a named
 * business; the subject of that claim must be able to answer it, and someone at
 * Marsad must decide.
 *
 * Upholding is a single call — resolve_dispute — because it has to withdraw the
 * report and recompute the score together. Doing it as three requests from here
 * would leave a window in which the objection is upheld and the report still
 * counts against the company, which is the exact harm being complained about.
 */

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }

const TABS = [
  { id: 'open', label: 'مفتوحة' },
  { id: 'upheld', label: 'مقبولة' },
  { id: 'rejected', label: 'مرفوضة' },
  { id: 'withdrawn', label: 'مسحوبة' },
]

const STATUS = {
  open:      { label: 'قيد النظر', color: STATUS_COLOR.warning, bg: '#FFFBEB', icon: '⏳' },
  upheld:    { label: 'قُبل الاعتراض', color: STATUS_COLOR.good, bg: '#ECFDF5', icon: '✓' },
  rejected:  { label: 'رُفض الاعتراض', color: STATUS_COLOR.critical, bg: '#FEF2F2', icon: '✕' },
  withdrawn: { label: 'سحبته الشركة', color: STATUS_COLOR.neutral, bg: '#F1F5F9', icon: '—' },
}

const PAYMENT_LABEL = {
  full: 'سُدِّد كاملاً', partial: 'سداد جزئي', late: 'سُدِّد متأخراً',
  default: 'لم يُسدَّد', unpaid: 'لم يُسدَّد', na: 'لا ينطبق',
}

export default function AdminDisputes() {
  const { user } = useUser()
  const [tab, setTab] = useState('open')
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [note, setNote] = useState('')
  const [toast, setToast] = useState('')

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 5000) }

  const load = useCallback(async () => {
    try {
      setError('')
      const supabase = getSupabase()

      const [{ data, error: e }, { data: all }] = await Promise.all([
        supabase
          .from('disputes')
          .select(`
            id, report_id, company_id, raised_by_tenant_id, reason, evidence_url,
            status, resolution_note, resolved_at, created_at,
            companies ( id, name, cr_number ),
            tenants!disputes_raised_by_tenant_id_fkey ( id, name ),
            reports ( id, status, category, payment_commitment, delay_days, defaulted, deal_value, currency, dealt_at, created_at, reporter_tenant_id )
          `)
          .eq('status', tab)
          .order('created_at', { ascending: false }),
        supabase.from('disputes').select('status'),
      ])
      if (e) throw e

      setRows(data || [])
      const tally = {}
      ;(all || []).forEach((d) => { tally[d.status] = (tally[d.status] || 0) + 1 })
      setCounts(tally)
    } catch (err) {
      setError(err.message || 'تعذّر تحميل الاعتراضات')
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { load() }, [load])

  const { connected, liveAt } = useLiveData(load, { tables: ['disputes', 'reports'] })

  const resolve = async (d, upheld) => {
    if (!note.trim()) { showToast('❌ اكتب سبب القرار — يصل للطرفين'); return }
    try {
      setBusyId(d.id)
      const supabase = getSupabase()

      const { data, error: e } = await supabase.rpc('resolve_dispute', {
        p_dispute_id: d.id,
        p_upheld: upheld,
        p_note: note.trim(),
      })
      if (e) throw e

      // Both sides are told. A process that resolves without telling the party
      // that loses is not a process.
      await notifyTenant(d.raised_by_tenant_id, upheld ? 'report_approved' : 'report_rejected', {
        title: upheld ? 'قُبل اعتراضك' : 'لم يُقبل اعتراضك',
        message: upheld
          ? `سُحب التقرير المُعترَض عليه عن «${d.companies?.name}». ${note.trim()}`
          : note.trim(),
        meta: { dispute_id: d.id, report_id: d.report_id },
      })

      if (d.reports?.reporter_tenant_id) {
        await notifyTenant(d.reports.reporter_tenant_id, upheld ? 'report_rejected' : 'report_approved', {
          title: upheld ? 'سُحب تقريرك بعد اعتراض' : 'صمد تقريرك أمام اعتراض',
          message: upheld
            ? `اعترضت «${d.companies?.name}» على تقريرك وقُبل الاعتراض. ${note.trim()}`
            : `اعترضت «${d.companies?.name}» على تقريرك ولم يُقبل الاعتراض.`,
          meta: { dispute_id: d.id, report_id: d.report_id },
        })
      }

      await supabase.from('audit_logs').insert([{
        actor_id: user?.id,
        action: upheld ? 'dispute_upheld' : 'dispute_rejected',
        entity: 'dispute',
        entity_id: d.id,
        meta: JSON.stringify({ report_id: d.report_id, company_id: d.company_id, note: note.trim() }),
        created_at: new Date().toISOString(),
      }])

      setNote('')
      setOpenId(null)
      await load()
      showToast(upheld ? '✅ قُبل الاعتراض وسُحب التقرير' : 'رُفض الاعتراض — التقرير باقٍ')
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
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px', textAlign: 'right' }}>الاعتراضات</h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
            شركة تعترض على تقرير منشور عنها — قبول الاعتراض يسحب التقرير ويُعيد احتساب درجتها فوراً
          </p>
        </div>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#B91C1C', fontSize: '14px', fontWeight: 700, textAlign: 'right' }}>⚠️ {error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '14px', marginBottom: '18px' }}>
        <StatTile label="مفتوحة" value={counts.open || 0} sub="تنتظر قراراً" tone={counts.open ? STATUS_COLOR.warning : undefined} />
        <StatTile label="قُبلت" value={counts.upheld || 0} sub="سُحبت تقاريرها" />
        <StatTile label="رُفضت" value={counts.rejected || 0} sub="التقرير باقٍ" />
        <StatTile label="سحبتها الشركات" value={counts.withdrawn || 0} sub="تراجعت عن الاعتراض" />
      </div>

      <div style={{ display: 'flex', gap: '9px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setOpenId(null) }} style={{ padding: '10px 20px', background: tab === t.id ? '#1E2A52' : '#fff', color: tab === t.id ? '#fff' : '#334155', border: tab === t.id ? 0 : '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            {t.label} ({counts[t.id] || 0})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div style={{ ...card, padding: '44px', textAlign: 'center' }}>
          <div style={{ fontSize: '38px', marginBottom: '10px' }}>{tab === 'open' ? '✓' : '📭'}</div>
          <p style={{ fontSize: '14px', color: '#64748B', fontWeight: 600, margin: 0 }}>
            {tab === 'open' ? 'لا توجد اعتراضات تنتظر قراراً' : 'لا شيء في هذه الفئة'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {rows.map((d) => {
            const s = STATUS[d.status] || STATUS.open
            const open = openId === d.id
            const r = d.reports
            return (
              <div key={d.id} style={{ ...card, padding: '22px', opacity: busyId === d.id ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap', flexDirection: 'row-reverse' }}>
                  <div style={{ textAlign: 'right', flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }}>
                      {d.companies?.name || 'شركة'}
                    </h3>
                    <p style={{ fontSize: '12.5px', color: '#94A3B8', margin: 0, fontWeight: 600 }}>
                      سجل {d.companies?.cr_number || '—'} · اعترضت عبر «{d.tenants?.name || '—'}»
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ background: s.bg, color: s.color, borderRadius: '8px', padding: '5px 12px', fontSize: '12.5px', fontWeight: 800 }}>
                      {s.icon} {s.label}
                    </span>
                    <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 600 }}>{new Date(d.created_at).toLocaleDateString('en-GB')}</span>
                  </div>
                </div>

                <div style={{ background: '#F8FAFC', borderRadius: '11px', padding: '14px 16px', margin: '15px 0 0', textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 800, marginBottom: '5px' }}>نص الاعتراض</div>
                  <p style={{ fontSize: '14px', color: '#334155', margin: 0, lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>{d.reason}</p>
                  {d.evidence_url && (
                    <a href={d.evidence_url} target="_blank" rel="noreferrer" style={{ fontSize: '13px', color: '#2a78d6', fontWeight: 800, display: 'inline-block', marginTop: '9px' }}>
                      📎 المستند المرفق
                    </a>
                  )}
                </div>

                {/* What is actually being objected to. Deciding without it in
                    front of you is deciding on the objection alone. */}
                {r && (
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '11px', padding: '14px 16px', marginTop: '12px', textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 800, marginBottom: '9px' }}>التقرير المُعترَض عليه</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '12px' }}>
                      {[
                        ['السداد', PAYMENT_LABEL[r.payment_commitment] || r.payment_commitment],
                        ['التأخير', r.delay_days != null ? `${r.delay_days} يوم` : null],
                        ['تعثّر', r.defaulted ? 'نعم' : 'لا'],
                        ['قيمة التعامل', r.deal_value ? `${Number(r.deal_value).toLocaleString('en-US')} ${r.currency || ''}` : null],
                        ['تاريخ التعامل', r.dealt_at ? new Date(r.dealt_at).toLocaleDateString('en-GB') : null],
                        ['حالة التقرير', r.status === 'approved' ? 'منشور' : r.status === 'rejected' ? 'مسحوب' : r.status],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <div style={{ fontSize: '11.5px', color: '#94A3B8', fontWeight: 700 }}>{k}</div>
                          <div style={{ fontSize: '13.5px', fontWeight: 700, color: v ? '#334155' : '#CBD5E1' }}>{v || '—'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {d.status !== 'open' && d.resolution_note && (
                  <div style={{ background: s.bg, borderRadius: '11px', padding: '13px 16px', marginTop: '12px', textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', color: s.color, fontWeight: 800, marginBottom: '4px' }}>قرار مرصد · {d.resolved_at ? new Date(d.resolved_at).toLocaleDateString('en-GB') : ''}</div>
                    <p style={{ fontSize: '13.5px', color: '#334155', margin: 0, lineHeight: 1.9 }}>{d.resolution_note}</p>
                  </div>
                )}

                {d.status === 'open' && (
                  <>
                    {open && (
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="سبب القرار — يصل للشركة المعترِضة وللشركة صاحبة التقرير"
                        style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '14px', outline: 'none', fontFamily: 'inherit', textAlign: 'right', minHeight: '86px', resize: 'vertical', marginTop: '14px' }}
                      />
                    )}
                    <div style={{ display: 'flex', gap: '10px', flexDirection: 'row-reverse', marginTop: '14px' }}>
                      {!open ? (
                        <button onClick={() => { setOpenId(d.id); setNote('') }} style={{ padding: '12px 24px', background: '#1E2A52', color: '#fff', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                          الفصل في الاعتراض
                        </button>
                      ) : (
                        <>
                          <button onClick={() => resolve(d, true)} disabled={busyId === d.id || !note.trim()} style={{ flex: 1, padding: '12px 16px', background: note.trim() ? '#16A34A' : '#CBD5E1', color: '#fff', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: note.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                            ✓ قبول الاعتراض وسحب التقرير
                          </button>
                          <button onClick={() => resolve(d, false)} disabled={busyId === d.id || !note.trim()} style={{ flex: 1, padding: '12px 16px', background: '#FEE2E2', color: '#B91C1C', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: note.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                            ✕ رفض الاعتراض
                          </button>
                          <button onClick={() => { setOpenId(null); setNote('') }} style={{ padding: '12px 20px', background: '#F1F5F9', color: '#334155', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                            إلغاء
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
