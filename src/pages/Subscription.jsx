import { useEffect, useState } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { useEntitlements } from '../hooks/useEntitlements'
import { formatLimit, limitOf, UNLIMITED } from '../lib/entitlements'
import { UsageMeter } from '../components/LimitGate'

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

const LIMIT_LABELS = {
  searches_per_month: 'عمليات البحث شهرياً',
  reports_per_month: 'التقارير شهرياً',
  companies_per_month: 'إضافة الشركات شهرياً',
  users: 'المستخدمون',
  watchlist_items: 'الشركات في قوائم المراقبة',
  compare_items: 'الشركات في المقارنة الواحدة',
}

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }

export default function Subscription() {
  const { user } = useUser()
  const { entitlements, loading: entLoading, credits, giveToGetEnabled, degraded } = useEntitlements()
  const [invoices, setInvoices] = useState([])
  const [allPlans, setAllPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const load = async () => {
      if (!user?.id) { setLoading(false); return }
      try {
        const supabase = getSupabase()

        const { data: userData } = await supabase
          .from('users').select('tenant_id').eq('id', user.id).maybeSingle()

        // Only the plans an operator has switched on are offered. Seeded but
        // inactive plans stay invisible until that flag flips in the panel.
        const { data: plansData } = await supabase
          .from('plans')
          .select('id, code, name, description, price_monthly, limits, features, active, give_to_get_enabled, sort_order')
          .eq('active', true)
          .order('sort_order', { ascending: true })
        setAllPlans(plansData || [])

        if (userData?.tenant_id) {
          const { data: invoicesData } = await supabase
            .from('invoices')
            .select('id, amount, status, created_at')
            .eq('tenant_id', userData.tenant_id)
            .order('created_at', { ascending: false })
            .limit(10)

          setInvoices((invoicesData || []).map((inv, idx) => ({
            id: inv.id,
            no: `INV-${new Date(inv.created_at).getFullYear()}-${String(idx + 1).padStart(3, '0')}`,
            date: new Date(inv.created_at).toLocaleDateString('en-GB'),
            amount: `${Number(inv.amount || 0).toLocaleString('en-US')} ر.س`,
            status: inv.status === 'paid' ? 'مدفوعة' : 'معلقة',
          })))
        }

        setError(null)
      } catch (err) {
        console.error('Error loading subscription:', err)
        setError('تعذّر تحميل بيانات الاشتراك')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.id])

  if (loading || entLoading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: '#64748B', fontWeight: 600 }}>جاري التحميل...</div>
  }

  const plan = entitlements?.plan
  const limits = entitlements?.limits || {}
  const usage = entitlements?.usage || {}
  const rules = entitlements?.giveToGetRules
  const catalog = entitlements?.featureCatalog || {}

  return (
    <div>
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
        <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px' }}>حدود باقتك واستهلاكها</h3>
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
          <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#15803D', margin: '0 0 6px' }}>فلسفة Give to Get</h3>
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
          <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 16px' }}>الباقات المتاحة</h3>
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
