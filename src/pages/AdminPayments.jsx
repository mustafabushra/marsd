import { useCallback, useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { notifyTenant } from '../lib/notify'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { StatTile, STATUS_COLOR } from '../components/Charts'
import { SkeletonPage, SkeletonTable } from '../components/Skeleton'

/**
 * /admin/payments — activating a plan a company has paid for.
 *
 * The screen listed transactions with card references and amounts, all written
 * into the file. Marsad has taken no money at all: there is no gateway, every
 * company is on the free plan, and a row saying "بطاقة ائتمان · 5,000 ر.س ·
 * مكتملة" describes a payment that never happened.
 *
 * What is real is the path Marsad can actually run today. A company requests a
 * plan on /subscription, transfers the amount, and Marsad activates it here.
 * Activation is one call — approve_plan_change — because the subscription and
 * its invoice are one act: two client requests can leave a company on a plan it
 * has no invoice for, or holding an invoice for a plan it was never moved to,
 * and the second is the one that produces an argument about money.
 *
 * When a gateway is added it replaces the transfer step. This screen stays.
 */

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }

const TABS = [
  { id: 'pending', label: 'طلبات بانتظار التفعيل' },
  { id: 'invoices', label: 'الفواتير' },
  { id: 'history', label: 'طلبات سابقة' },
]

const MONTH_OPTIONS = [
  { months: 1, label: 'شهر' },
  { months: 3, label: '٣ أشهر' },
  { months: 6, label: '٦ أشهر' },
  { months: 12, label: 'سنة' },
]

const REQ_STATUS = {
  pending:   { label: 'بانتظار التفعيل', bg: '#FFFBEB', c: '#B45309' },
  approved:  { label: 'فُعِّلت', bg: '#ECFDF5', c: '#15803D' },
  rejected:  { label: 'رُفضت', bg: '#FEF2F2', c: '#B91C1C' },
  cancelled: { label: 'ألغتها الشركة', bg: '#F1F5F9', c: '#64748B' },
}

const money = (n) => `${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ر.س`

export default function AdminPayments() {
  const { user } = useUser()
  const [tab, setTab] = useState('pending')
  const [requests, setRequests] = useState([])
  const [invoices, setInvoices] = useState([])
  const [vat, setVat] = useState(15)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)
  const [months, setMonths] = useState(1)
  const [note, setNote] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState('')

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 6000) }

  const load = useCallback(async () => {
    try {
      setError('')
      const supabase = getSupabase()
      const [{ data: reqs, error: e }, { data: invs }, { data: billing }] = await Promise.all([
        supabase
          .from('plan_change_requests')
          .select(`
            id, tenant_id, status, note, admin_note, created_at, resolved_at,
            tenants ( id, name, cr_number, email ),
            current:current_plan_id ( id, code, name, price_monthly ),
            requested:requested_plan_id ( id, code, name, price_monthly )
          `)
          .order('created_at', { ascending: false }),
        supabase.rpc('tenant_invoices'),
        supabase.from('system_settings').select('value').eq('key', 'billing_settings').maybeSingle(),
      ])
      if (e) throw e
      setRequests(reqs || [])
      setInvoices(invs || [])
      setVat(Number(billing?.value?.vat_percent ?? 15))
    } catch (err) {
      setError(err.message || 'تعذّر تحميل المدفوعات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const { connected, liveAt } = useLiveData(load, {
    tables: ['plan_change_requests', 'invoices', 'subscriptions'],
  })

  const total = (price, m) => {
    const net = Number(price || 0) * m
    return { net, vatAmount: net * vat / 100, gross: net * (1 + vat / 100) }
  }

  const activate = async (r) => {
    try {
      setBusyId(r.id)
      const supabase = getSupabase()

      const { data, error: e } = await supabase.rpc('approve_plan_change', {
        p_request_id: r.id,
        p_months: months,
        p_note: note.trim() || null,
      })
      if (e) throw e

      await notifyTenant(r.tenant_id, 'subscription_changed', {
        title: `فُعِّلت باقة ${data.plan_name}`,
        message: `اشتراكك سارٍ حتى ${new Date(data.period_end).toLocaleDateString('en-GB')}. حدود باقتك الجديدة فعّالة الآن.`,
        meta: { plan_id: data.plan_id, invoice_id: data.invoice_id },
      })

      await supabase.from('audit_logs').insert([{
        actor_id: user?.id,
        action: 'plan_activated',
        entity: 'subscription',
        entity_id: r.tenant_id,
        tenant_id: r.tenant_id,
        meta: JSON.stringify({ plan: data.plan_name, months, total: data.total, invoice_id: data.invoice_id }),
        created_at: new Date().toISOString(),
      }])

      setOpenId(null); setNote(''); setMonths(1)
      await load()
      showToast(`✅ فُعِّلت ${data.plan_name} لمدة ${data.months} — فاتورة بـ ${money(data.total)}`)
    } catch (err) {
      showToast(`❌ ${err.message}`)
    } finally {
      setBusyId(null)
    }
  }

  const reject = async (r) => {
    if (!note.trim()) { showToast('❌ اكتب سبب الرفض — يصل الشركة'); return }
    try {
      setBusyId(r.id)
      const supabase = getSupabase()
      const { data, error: e } = await supabase
        .from('plan_change_requests')
        .update({ status: 'rejected', admin_note: note.trim(), resolved_by: user?.id, resolved_at: new Date().toISOString() })
        .eq('id', r.id)
        .select('id, status')
      if (e) throw e
      if (!data?.length) throw new Error('لم يُحفظ الرفض — تحقّق من صلاحيتك')

      await notifyTenant(r.tenant_id, 'subscription_changed', {
        title: 'لم يُفعَّل طلب الترقية',
        message: note.trim(),
        meta: { request_id: r.id },
      })

      setOpenId(null); setNote('')
      await load()
      showToast('رُفض الطلب وأُبلغت الشركة')
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

  const pending = requests.filter((r) => r.status === 'pending')
  const history = requests.filter((r) => r.status !== 'pending')
  const collected = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.total || 0), 0)
  const rows = tab === 'pending' ? pending : tab === 'history' ? history : []

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 100, boxShadow: '0 8px 24px rgba(15,23,42,.25)', maxWidth: '460px', lineHeight: 1.8 }}>{toast}</div>
      )}

      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px', textAlign: 'right' }}>المدفوعات والاشتراكات</h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>
            الشركة تطلب الباقة وتحوّل المبلغ، وتُفعَّل من هنا — لا توجد بوابة دفع بعد
          </p>
        </div>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#B91C1C', fontSize: '14px', fontWeight: 700, textAlign: 'right' }}>⚠️ {error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '14px', marginBottom: '18px' }}>
        <StatTile label="بانتظار التفعيل" value={pending.length} sub="طلبات ترقية" tone={pending.length ? STATUS_COLOR.warning : undefined} />
        <StatTile label="فواتير صادرة" value={invoices.length} sub="منذ البداية" />
        <StatTile label="محصّل" value={money(collected)} sub={`شامل ضريبة ${vat}%`} tone={collected ? STATUS_COLOR.good : undefined} />
        <StatTile label="اشتراكات مدفوعة" value={requests.filter((r) => r.status === 'approved').length} sub="فُعِّلت من هنا" />
      </div>

      <div style={{ display: 'flex', gap: '9px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setOpenId(null) }} style={{ padding: '10px 20px', background: tab === t.id ? '#1E2A52' : '#fff', color: tab === t.id ? '#fff' : '#334155', border: tab === t.id ? 0 : '1.5px solid #E2E8F0', borderRadius: '10px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            {t.label} ({t.id === 'pending' ? pending.length : t.id === 'history' ? history.length : invoices.length})
          </button>
        ))}
      </div>

      {tab === 'invoices' ? (
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.1fr 1fr 1fr 1fr 1fr', padding: '14px 18px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '13px', fontWeight: 800, color: '#64748B', textAlign: 'right' }}>
            <span>الشركة</span><span>الباقة</span><span>المبلغ</span><span>الضريبة</span><span>الإجمالي</span><span>التاريخ</span>
          </div>
          {invoices.length === 0 ? (
            <div style={{ padding: '44px', textAlign: 'center', color: '#64748B', fontSize: '14px', fontWeight: 600 }}>
              لم تُصدر فواتير بعد — لم يشترك أحد في باقة مدفوعة
            </div>
          ) : invoices.map((i) => (
            <div key={i.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.1fr 1fr 1fr 1fr 1fr', padding: '13px 18px', borderBottom: '1px solid #F1F5F9', alignItems: 'center', textAlign: 'right' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>{i.tenant_name}</span>
              <span style={{ fontSize: '13px', color: '#334155', fontWeight: 700 }}>{i.plan_name || '—'}</span>
              <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 700 }}>{money(i.amount)}</span>
              <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 700 }}>{money(i.vat)}</span>
              <span style={{ fontSize: '13.5px', color: '#0F172A', fontWeight: 800 }}>{money(i.total)}</span>
              <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: 600 }}>{i.issued_at ? new Date(i.issued_at).toLocaleDateString('en-GB') : '—'}</span>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div style={{ ...card, padding: '44px', textAlign: 'center' }}>
          <div style={{ fontSize: '38px', marginBottom: '10px' }}>{tab === 'pending' ? '✓' : '📭'}</div>
          <p style={{ fontSize: '14px', color: '#64748B', fontWeight: 600, margin: 0 }}>
            {tab === 'pending' ? 'لا توجد طلبات ترقية تنتظر التفعيل' : 'لا توجد طلبات سابقة'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {rows.map((r) => {
            const s = REQ_STATUS[r.status] || REQ_STATUS.pending
            const open = openId === r.id
            const t = total(r.requested?.price_monthly, months)
            return (
              <div key={r.id} style={{ ...card, padding: '22px', opacity: busyId === r.id ? 0.6 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap', flexDirection: 'row-reverse' }}>
                  <div style={{ textAlign: 'right', flex: 1, minWidth: 0 }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 4px' }}>{r.tenants?.name || 'شركة'}</h2>
                    <p style={{ fontSize: '12.5px', color: '#64748B', margin: 0, fontWeight: 600 }}>
                      سجل {r.tenants?.cr_number || '—'}{r.tenants?.email ? ` · ${r.tenants.email}` : ''}
                    </p>
                    <p style={{ fontSize: '14px', color: '#334155', margin: '9px 0 0', fontWeight: 700 }}>
                      {r.current?.name || 'مجاني'} ← <strong style={{ color: '#0F172A' }}>{r.requested?.name}</strong>
                      <span style={{ color: '#64748B', fontWeight: 700 }}> · {money(r.requested?.price_monthly)}/شهر</span>
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ background: s.bg, color: s.c, borderRadius: '8px', padding: '5px 12px', fontSize: '12.5px', fontWeight: 800 }}>{s.label}</span>
                    <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>{new Date(r.created_at).toLocaleDateString('en-GB')}</span>
                  </div>
                </div>

                {r.note && (
                  <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px 15px', marginTop: '13px', textAlign: 'right' }}>
                    <div style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 800, marginBottom: '3px' }}>ملاحظة الشركة</div>
                    <p style={{ fontSize: '13.5px', color: '#334155', margin: 0, lineHeight: 1.9 }}>{r.note}</p>
                  </div>
                )}

                {r.admin_note && (
                  <div style={{ background: s.bg, borderRadius: '10px', padding: '12px 15px', marginTop: '13px', textAlign: 'right' }}>
                    <div style={{ fontSize: '11.5px', color: s.c, fontWeight: 800, marginBottom: '3px' }}>قرار مرصد</div>
                    <p style={{ fontSize: '13.5px', color: '#334155', margin: 0, lineHeight: 1.9 }}>{r.admin_note}</p>
                  </div>
                )}

                {r.status === 'pending' && (
                  <>
                    {open && (
                      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#334155', marginBottom: '9px', textAlign: 'right' }}>المدة المدفوعة</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                          {MONTH_OPTIONS.map((m) => (
                            <button key={m.months} onClick={() => setMonths(m.months)} style={{ padding: '9px 17px', background: months === m.months ? '#1E2A52' : '#fff', color: months === m.months ? '#fff' : '#334155', border: months === m.months ? 0 : '1.5px solid #E2E8F0', borderRadius: '9px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                              {m.label}
                            </button>
                          ))}
                        </div>

                        {/* The amount is shown before activating, not after. An
                            invoice is issued by this action and its figure must
                            be the one the operator agreed to. */}
                        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '11px', padding: '14px 16px', marginBottom: '14px', textAlign: 'right' }}>
                          <div style={{ fontSize: '13px', color: '#166534', fontWeight: 700, lineHeight: 2 }}>
                            {money(t.net)} + ضريبة {vat}% ({money(t.vatAmount)})
                            <div style={{ fontSize: '17px', fontWeight: 900, color: '#14532D' }}>الإجمالي {money(t.gross)}</div>
                          </div>
                        </div>

                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="مرجع التحويل أو ملاحظة — يصل الشركة"
                          style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '14px', outline: 'none', fontFamily: 'inherit', textAlign: 'right', minHeight: '72px', resize: 'vertical' }}
                        />
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px', flexDirection: 'row-reverse', marginTop: '15px' }}>
                      {!open ? (
                        <button onClick={() => { setOpenId(r.id); setNote(''); setMonths(1) }} style={{ padding: '12px 24px', background: '#1E2A52', color: '#fff', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                          تأكيد السداد وتفعيل الباقة
                        </button>
                      ) : (
                        <>
                          <button onClick={() => activate(r)} disabled={busyId === r.id} style={{ flex: 1, padding: '12px 16px', background: '#16A34A', color: '#fff', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                            ✓ تفعيل وإصدار الفاتورة
                          </button>
                          <button onClick={() => reject(r)} disabled={busyId === r.id || !note.trim()} style={{ flex: 1, padding: '12px 16px', background: '#FEE2E2', color: '#B91C1C', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: note.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                            ✕ رفض الطلب
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
