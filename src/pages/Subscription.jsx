import { useCallback, useEffect, useState } from 'react'
import { useUser } from '@clerk/react'
import { useUserRole } from '../hooks/useUserRole'
import { canPerform } from '../utils/roles'
import { getSupabase } from '../lib/api'
import { useEntitlements } from '../hooks/useEntitlements'
import { formatLimit, limitOf, UNLIMITED } from '../lib/entitlements'
import { UsageMeter } from '../components/LimitGate'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { SkeletonPage } from '../components/Skeleton'
import { LIMITS } from '../lib/validate.js'

/**
 * /subscription — the plan a company is on, what it allows, and what it has left.
 *
 * The plan, its ceilings and its features are read, never written here: they
 * come from plans.limits and plans.features, which the admin panel owns. That
 * is what lets a limit change without a deploy, and it is why this page renders
 * whatever rows the database holds rather than a list written in JSX.
 *
 * The previous version selected `plans(id, name, price, features)`. There is no
 * price column — it is price_monthly — so PostgREST rejected the whole select,
 * subData came back null, and the page showed "غير محدد" and an empty price for
 * every tenant regardless of what they were subscribed to.
 */

// searches_per_month counts how many times this tenant opened a company's
// report in the current month — count(*) over audit_logs.company_report_viewed,
// in my_entitlements. Typing in the search box costs nothing; opening the same
// company a second time costs a second lookup (migration 109 — it used to be
// free, and the owner decided each opening is a lookup).
//
// The label has to say "مرات فتح" rather than "التقارير المفتوحة", because the
// latter reads as a count of companies and is what the meter used to be.
const LIMIT_LABELS = {
  searches_per_month: 'مرات فتح تقارير الشركات شهرياً',
  reports_per_month: 'التقارير شهرياً',
  companies_per_month: 'إضافة الشركات شهرياً',
  users: 'المستخدمون',
  watchlist_items: 'الشركات في قوائم المراقبة',
  compare_items: 'الشركات في المقارنة الواحدة',
}

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }

export default function Subscription() {
  const { user } = useUser()
  const { role } = useUserRole()
  const [tenantId, setTenantId] = useState(null)
  const [pendingRequest, setPendingRequest] = useState(null)
  const [billing, setBilling] = useState({ vat_percent: 15 })
  const [upgradeTo, setUpgradeTo] = useState(null)
  const [upgradeNote, setUpgradeNote] = useState('')
  const [upgrading, setUpgrading] = useState(false)
  const [msg, setMsg] = useState('')

  // The same bar RLS applies: only a company administrator commits the company
  // to paying for something.
  const canUpgrade = canPerform(role, 'canChangeSubscription')
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 6000) }
  const { entitlements, loading: entLoading, credits, giveToGetEnabled, degraded } = useEntitlements()
  const [invoices, setInvoices] = useState([])
  const [allPlans, setAllPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
      if (!user?.id) { setLoading(false); return }
      try {
        const supabase = getSupabase()

        const { data: userData } = await supabase
          .from('users').select('tenant_id').eq('id', user.id).maybeSingle()
        setTenantId(userData?.tenant_id || null)

        const { data: billingSettings } = await supabase
          .from('system_settings').select('value').eq('key', 'billing_settings').maybeSingle()
        setBilling(billingSettings?.value || { vat_percent: 15 })

        if (userData?.tenant_id) {
          const { data: req } = await supabase
            .from('plan_change_requests')
            .select('id, status, created_at, admin_note, requested:requested_plan_id ( name, price_monthly )')
            .eq('tenant_id', userData.tenant_id)
            .eq('status', 'pending')
            .maybeSingle()
          setPendingRequest(req || null)
        }

        // Only the plans an operator has switched on are offered. Seeded but
        // inactive plans stay invisible until that flag flips in the panel.
        const { data: plansData } = await supabase
          .from('plans')
          .select('id, code, name, description, price_monthly, limits, features, active, give_to_get_enabled, sort_order')
          .eq('active', true)
          .order('sort_order', { ascending: true })
        setAllPlans(plansData || [])

        // invoices is keyed on subscription_id and has no tenant_id column at
        // all, so the previous .eq('tenant_id', …) filtered on something that
        // does not exist — PostgREST rejected it and no company has ever seen an
        // invoice here. tenant_invoices joins through the subscription and
        // returns only rows the caller is entitled to.
        const { data: invoicesData } = await supabase.rpc('tenant_invoices')
        setInvoices((invoicesData || []).slice(0, 10).map((inv, idx) => ({
          id: inv.id,
          no: `INV-${new Date(inv.issued_at || Date.now()).getFullYear()}-${String(idx + 1).padStart(3, '0')}`,
          date: inv.issued_at ? new Date(inv.issued_at).toLocaleDateString('en-GB') : '—',
          amount: `${Number(inv.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ر.س`,
          status: inv.status === 'paid' ? 'مدفوعة' : 'معلقة',
        })))

        setError(null)
      } catch (err) {
        console.error('Error loading subscription:', err)
        setError('تعذّر تحميل بيانات الاشتراك')
      } finally {
        setLoading(false)
      }
  }, [user?.id])

  useEffect(() => { load() }, [load])

  // Requesting a plan is not paying for it. The request is recorded, Marsad
  // confirms the transfer, and the plan changes then — so this button promises
  // exactly what happens and nothing more.
  const requestUpgrade = async (targetPlan) => {
    if (!tenantId || !canUpgrade) return
    try {
      setUpgrading(true)
      const { data, error } = await getSupabase()
        .from('plan_change_requests')
        .insert({
          tenant_id: tenantId,
          requested_by: user.id,
          requested_plan_id: targetPlan.id,
          note: upgradeNote.trim() || null,
        })
        .select('id')
      if (error) {
        if (error.code === '23505') throw new Error('لديك طلب قيد المعالجة بالفعل')
        throw error
      }
      if (!data?.length) throw new Error('لم يُسجَّل الطلب — تغيير الباقة من صلاحيات مدير الشركة')
      setUpgradeTo(null); setUpgradeNote('')
      await load()
      flash('✅ سُجّل طلبك — ستتواصل معك إدارة مرصد لتأكيد السداد')
    } catch (err) {
      flash(`❌ ${err.message}`)
    } finally {
      setUpgrading(false)
    }
  }

  const cancelRequest = async () => {
    if (!pendingRequest) return
    try {
      setUpgrading(true)
      const { data, error } = await getSupabase()
        .from('plan_change_requests')
        .update({ status: 'cancelled' })
        .eq('id', pendingRequest.id)
        .select('id')
      if (error) throw error
      if (!data?.length) throw new Error('لم يُلغَ الطلب')
      await load()
      flash('أُلغي الطلب')
    } catch (err) {
      flash(`❌ ${err.message}`)
    } finally {
      setUpgrading(false)
    }
  }

  // The plans themselves are live: an operator raising a limit or switching a
  // plan on in the admin panel changes what this screen offers, without anyone
  // being asked to reload.
  const { connected, liveAt } = useLiveData(load, {
    tables: ['plans', 'subscriptions', 'credits_ledger'],
    enabled: !!user?.id,
  })

  if (loading || entLoading) {
    return <SkeletonPage stats={0} panels={3} />
  }

  const plan = entitlements?.plan
  const limits = entitlements?.limits || {}
  const usage = entitlements?.usage || {}
  const rules = entitlements?.giveToGetRules
  const catalog = entitlements?.featureCatalog || {}

  const vatPct = Number(billing?.vat_percent ?? 15)
  const withVat = (n) => Number(n || 0) * (1 + vatPct / 100)
  const money = (n) => `${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} ر.س`

  return (
    <div>
      {msg && (
        <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 100, boxShadow: '0 8px 24px rgba(15,23,42,.25)', maxWidth: '440px', lineHeight: 1.8 }}>{msg}</div>
      )}

      {/* A request already in flight. Without this the plan cards would keep
          offering a button that the unique index refuses, and the company would
          have no idea it had already asked. */}
      {pendingRequest && (
        <div style={{ ...card, padding: '18px 22px', marginBottom: '18px', background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap', textAlign: 'right' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 900, color: '#92400E' }}>
                ⏳ طلبك لباقة «{pendingRequest.requested?.name}» قيد المعالجة
              </div>
              <p style={{ fontSize: '13px', color: '#78350F', margin: '5px 0 0', fontWeight: 600, lineHeight: 1.9 }}>
                قُدّم في {new Date(pendingRequest.created_at).toLocaleDateString('en-GB')} — ستُفعَّل الباقة بعد تأكيد إدارة مرصد للسداد.
              </p>
            </div>
            {canUpgrade && (
              <button onClick={cancelRequest} disabled={upgrading} style={{ background: '#fff', color: '#92400E', border: '1.5px solid #FDE68A', borderRadius: '9px', padding: '9px 18px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                إلغاء الطلب
              </button>
            )}
          </div>
        </div>
      )}

      {/* The price, the VAT and the payment instructions are shown before the
          company commits, not after. */}
      {upgradeTo && (
        <div style={{ ...card, padding: '24px', marginBottom: '18px', border: '1.5px solid #1E2A52' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px', textAlign: 'right' }}>
            طلب باقة «{upgradeTo.name}»
          </h2>
          <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 18px', fontWeight: 600, textAlign: 'right', lineHeight: 1.9 }}>
            تسجيل الطلب لا يخصم شيئاً. تتواصل معك إدارة مرصد لتأكيد السداد، وتُفعَّل الباقة عندها.
          </p>

          <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '16px 18px', marginBottom: '16px', textAlign: 'right' }}>
            <div style={{ fontSize: '13.5px', color: '#334155', fontWeight: 700, lineHeight: 2 }}>
              {money(upgradeTo.price_monthly)} شهرياً + ضريبة {vatPct}%
              <div style={{ fontSize: '19px', fontWeight: 900, color: '#0F172A', marginTop: '4px' }}>
                {money(withVat(upgradeTo.price_monthly))} شهرياً شاملة الضريبة
              </div>
            </div>
          </div>

          {(billing?.iban || billing?.bank_name) && (
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '15px 18px', marginBottom: '16px', textAlign: 'right' }}>
              <div style={{ fontSize: '13px', fontWeight: 900, color: '#15803D', marginBottom: '7px' }}>بيانات التحويل</div>
              <div style={{ fontSize: '13.5px', color: '#14532D', fontWeight: 600, lineHeight: 2 }}>
                {billing.bank_name && <div>{billing.bank_name}</div>}
                {billing.account_name && <div>{billing.account_name}</div>}
                {billing.iban && <div style={{ direction: 'ltr', textAlign: 'right', fontFamily: 'monospace' }}>{billing.iban}</div>}
              </div>
            </div>
          )}
          {billing?.instructions && (
            <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 16px', fontWeight: 600, textAlign: 'right', lineHeight: 1.9 }}>{billing.instructions}</p>
          )}

          <textarea maxLength={LIMITS.reason}
            value={upgradeNote}
            onChange={(e) => setUpgradeNote(e.target.value)}
            placeholder="ملاحظة لإدارة مرصد (اختياري) — مرجع التحويل، أو المدة التي تريدها"
            style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', fontSize: '14px', outline: 'none', fontFamily: 'inherit', textAlign: 'right', minHeight: '76px', resize: 'vertical', marginBottom: '16px' }}
          />

          <div style={{ display: 'flex', gap: '10px', flexDirection: 'row-reverse' }}>
            <button onClick={() => requestUpgrade(upgradeTo)} disabled={upgrading} style={{ flex: 1, padding: '13px', background: upgrading ? '#94A3B8' : '#16A34A', color: '#fff', border: 0, borderRadius: '10px', fontSize: '14.5px', fontWeight: 800, cursor: upgrading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {upgrading ? 'جاري الإرسال...' : 'إرسال الطلب'}
            </button>
            <button onClick={() => { setUpgradeTo(null); setUpgradeNote('') }} style={{ padding: '13px 26px', background: '#F1F5F9', color: '#334155', border: 0, borderRadius: '10px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginBottom: '18px', padding: '13px 16px', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: '12px', color: '#991B1B', fontSize: '14px', fontWeight: 700 }}>
          {error}
        </div>
      )}

      {degraded && (
        <div style={{ marginBottom: '18px', padding: '13px 16px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px', color: '#92400E', fontSize: '13.5px', fontWeight: 700 }}>
          ⚠️ تعذّر التحقق من باقتك حالياً، فلن تُطبَّق أي حدود مؤقتاً. {entitlements?.reason}
        </div>
      )}

      {/* Current plan */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: '18px', marginBottom: '18px' }}>
        <div style={{ background: 'linear-gradient(135deg,#1E2A52,#2A3B6E)', borderRadius: '16px', padding: '26px', color: '#fff' }}>
          <div style={{ fontSize: '13px', opacity: 0.75, fontWeight: 700, marginBottom: '6px' }}>باقتك الحالية</div>
          <div style={{ fontSize: '30px', fontWeight: 900, marginBottom: '6px' }}>{plan?.name || 'غير محدد'}</div>
          {plan?.description && (
            <div style={{ fontSize: '13.5px', opacity: 0.85, lineHeight: 1.8, marginBottom: '14px' }}>{plan.description}</div>
          )}
          <div style={{ fontSize: '14px', fontWeight: 700 }}>
            {Number(plan?.price_monthly) > 0
              ? `${Number(plan.price_monthly).toLocaleString('en-US')} ر.س / شهرياً`
              : 'مجانية'}
          </div>
          {entitlements?.periodEnd && Number(plan?.price_monthly) > 0 && (
            <div style={{ fontSize: '12.5px', opacity: 0.75, marginTop: '8px' }}>
              تتجدد في {new Date(entitlements.periodEnd).toLocaleDateString('en-GB')}
            </div>
          )}
        </div>

        {giveToGetEnabled ? (
          <div style={{ ...card, padding: '22px' }}>
            <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 700, marginBottom: '4px' }}>رصيد الشركة من المساهمات</div>
            <div style={{ fontSize: '38px', fontWeight: 900, color: '#16A34A', lineHeight: 1.2 }}>{credits}</div>
            <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.8, marginTop: '8px' }}>
              نقطة تُضاف إلى حدود باقتك. تُكتسب بمساهمات موثقة ويكسبها الفريق للشركة.
            </div>
          </div>
        ) : (
          <div style={{ ...card, padding: '22px' }}>
            <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 700, marginBottom: '10px' }}>حالة الاشتراك</div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A' }}>
              {entitlements?.subscriptionStatus === 'active' ? 'نشط' : entitlements?.subscriptionStatus || '—'}
            </div>
            <div style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.8, marginTop: '8px' }}>
              صلاحيات باقتك ممنوحة بالكامل ولا تعتمد على المساهمة.
            </div>
          </div>
        )}
      </div>

      {/* Limits and consumption */}
      <div style={{ ...card, padding: '22px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '11px', flexWrap: 'wrap', margin: '0 0 16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: 0 }}>حدود باقتك واستهلاكها</h2>
          <LiveBadge connected={connected} liveAt={liveAt} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: '12px' }}>
          {Object.keys(LIMIT_LABELS).map((key) => {
            const ceiling = limitOf(entitlements, key)
            if (ceiling === UNLIMITED) {
              return (
                <div key={key} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '13px 16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '4px' }}>{LIMIT_LABELS[key]}</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#16A34A' }}>بلا حد</div>
                </div>
              )
            }
            // Only searches are metered today; the rest show their ceiling until
            // their counters exist, rather than implying a usage of zero.
            const measured = key === 'searches_per_month'
            return measured ? (
              <UsageMeter
                key={key}
                label={LIMIT_LABELS[key]}
                used={usage[key] || 0}
                ceiling={ceiling}
                credits={credits}
                giveToGet={giveToGetEnabled}
              />
            ) : (
              <div key={key} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '13px 16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginBottom: '4px' }}>{LIMIT_LABELS[key]}</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748B' }}>حتى {formatLimit(ceiling)}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* How to earn — only where it applies */}
      {giveToGetEnabled && rules?.earn && (
        <div style={{ ...card, border: '1px solid #BBF7D0', padding: '22px', marginBottom: '18px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#15803D', margin: '0 0 6px' }}>فلسفة Give to Get</h2>
          <p style={{ fontSize: '13.5px', color: '#334155', lineHeight: 1.9, margin: '0 0 16px' }}>
            مرصد يقوم على بيانات يساهم بها أعضاؤه. كل مساهمة موثقة من فريقك تضيف رصيداً لشركتك، وتوسّع حدودك دون أي تكلفة.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: '10px' }}>
            {Object.entries(rules.earn).map(([key, rule]) => (
              <div key={key} style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '11px', padding: '13px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '13.5px', color: '#166534', fontWeight: 700 }}>{rule.label || key}</span>
                <span style={{ fontSize: '15px', fontWeight: 900, color: '#15803D', whiteSpace: 'nowrap' }}>+{rule.points}</span>
              </div>
            ))}
          </div>
          {rules.monthly_earn_cap > 0 && (
            <p style={{ fontSize: '12.5px', color: '#64748B', margin: '14px 0 0' }}>
              الحد الأقصى للكسب شهرياً: {rules.monthly_earn_cap} نقطة.
            </p>
          )}
        </div>
      )}

      {/* Available plans — rendered from the database, not written here */}
      {allPlans.length > 1 && (
        <div style={{ ...card, padding: '22px', marginBottom: '18px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px' }}>الباقات المتاحة</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '12px' }}>
            {allPlans.map((p) => {
              const current = p.code === plan?.code
              return (
                <div key={p.id} style={{ border: `1.5px solid ${current ? '#16A34A' : '#E2E8F0'}`, background: current ? '#F0FDF4' : '#fff', borderRadius: '13px', padding: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A' }}>{p.name}</span>
                    {current && <span style={{ background: '#16A34A', color: '#fff', borderRadius: '999px', padding: '3px 11px', fontSize: '11.5px', fontWeight: 800 }}>باقتك</span>}
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: '#16A34A', marginBottom: '10px' }}>
                    {Number(p.price_monthly) > 0 ? `${Number(p.price_monthly).toLocaleString('en-US')} ر.س` : 'مجانية'}
                  </div>
                  {p.description && <p style={{ fontSize: '12.5px', color: '#64748B', lineHeight: 1.8, margin: '0 0 10px' }}>{p.description}</p>}
                  {(p.features || []).length > 0 && (
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {p.features.map((f) => (
                        <li key={f} style={{ fontSize: '12.5px', color: '#334155', fontWeight: 600 }}>✓ {catalog[f] || f}</li>
                      ))}
                    </ul>
                  )}

                  {!current && !pendingRequest && canUpgrade && Number(p.price_monthly) > 0 && (
                    <button
                      onClick={() => { setUpgradeTo(p); setUpgradeNote('') }}
                      style={{ width: '100%', marginTop: '14px', padding: '11px', background: '#1E2A52', color: '#fff', border: 0, borderRadius: '9px', fontSize: '13.5px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      اطلب هذه الباقة
                    </button>
                  )}
                  {!current && !canUpgrade && Number(p.price_monthly) > 0 && (
                    <div style={{ marginTop: '14px', fontSize: '12px', color: '#64748B', fontWeight: 700, textAlign: 'center' }}>
                      🔒 تغيير الباقة من صلاحيات مدير الشركة
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <div style={{ ...card, overflowX: 'auto' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid #E2E8F0', fontSize: '15px', fontWeight: 900, color: '#0F172A' }}>الفواتير</div>
          <div style={{ minWidth: '520px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', padding: '12px 22px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '12.5px', fontWeight: 800, color: '#64748B' }}>
              <span>رقم الفاتورة</span><span>التاريخ</span><span>المبلغ</span><span>الحالة</span>
            </div>
            {invoices.map((inv) => (
              <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', padding: '13px 22px', borderBottom: '1px solid #F1F5F9', alignItems: 'center', fontSize: '13.5px', color: '#334155' }}>
                <span style={{ fontWeight: 700 }}>{inv.no}</span>
                <span>{inv.date}</span>
                <span style={{ fontWeight: 700 }}>{inv.amount}</span>
                <span>
                  <span style={{ background: inv.status === 'مدفوعة' ? '#ECFDF5' : '#FEF3C7', color: inv.status === 'مدفوعة' ? '#15803D' : '#92400E', borderRadius: '7px', padding: '4px 12px', fontSize: '12.5px', fontWeight: 800 }}>{inv.status}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
