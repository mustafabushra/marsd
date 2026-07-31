import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '../lib/api'

/**
 * /admin/plans — the control surface for what every plan allows.
 *
 * This page used to hold three plans in useState — برونز, فضي, ذهبي — with
 * invented customer counts. Editing one changed nothing anywhere and the edit
 * itself vanished on reload, so the platform's pricing appeared configurable
 * while every limit in the app was in fact unenforced.
 *
 * It now reads and writes public.plans. What is edited here is what
 * useEntitlements resolves: raising a ceiling, moving a feature between plans,
 * or switching a plan on takes effect for tenants on their next load, with no
 * deploy. That is the whole reason limits are jsonb columns rather than
 * constants.
 *
 * `code` is deliberately not editable. The application checks it; name and price
 * are display, and must stay free to change without breaking a gate.
 */

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }
const input = { width: '100%', boxSizing: 'border-box', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '9px 11px', fontSize: '13.5px', fontFamily: 'inherit', outline: 'none' }
const btn = (bg, fg, border) => ({ background: bg, color: fg, border: border || 0, borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' })

const LIMIT_LABELS = {
  searches_per_month: 'بحث/شهر',
  reports_per_month: 'تقارير/شهر',
  companies_per_month: 'شركات/شهر',
  pending_reports: 'تقارير قيد المراجعة',
  users: 'مستخدمون',
  watchlist_items: 'قوائم المراقبة',
  compare_items: 'مقارنة',
}

export default function AdminPlans() {
  const [plans, setPlans] = useState([])
  const [catalog, setCatalog] = useState({})
  const [counts, setCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [editing, setEditing] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    try {
      setError('')
      const supabase = getSupabase()

      const [plansRes, settingsRes, subsRes] = await Promise.all([
        supabase.from('plans').select('*').order('sort_order', { ascending: true }),
        supabase.from('system_settings').select('value').eq('key', 'feature_catalog').maybeSingle(),
        supabase.from('subscriptions').select('plan_id'),
      ])

      if (plansRes.error) throw plansRes.error
      setPlans(plansRes.data || [])
      setCatalog(settingsRes.data?.value || {})

      // Real subscriber counts, not decoration: switching a plan off matters
      // more when you can see who is on it.
      const tally = {}
      for (const row of subsRes.data || []) tally[row.plan_id] = (tally[row.plan_id] || 0) + 1
      setCounts(tally)
    } catch (err) {
      setError(err.message || 'تعذّر تحميل الباقات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const patch = async (plan, changes, message) => {
    try {
      setBusyId(plan.id)
      const supabase = getSupabase()
      const { data, error: e } = await supabase.from('plans').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', plan.id).select('id')
      if (e) throw e
      // An UPDATE that RLS filters out matches nothing and raises nothing. On
      // this screen that would mean an operator believing a plan limit was
      // raised while every company stayed capped at the old one.
      if (!data?.length) throw new Error('لم يُحفظ التعديل — تحقّق من صلاحيتك')
      await load()
      showToast(message)
    } catch (err) {
      showToast('❌ ' + (err.message || 'تعذّر الحفظ'))
    } finally {
      setBusyId(null)
    }
  }

  const toggleActive = (plan) => {
    if (plan.is_default && plan.active) {
      showToast('❌ لا يمكن إيقاف الباقة الافتراضية — الكيانات الجديدة تُسند إليها')
      return
    }
    const subscribers = counts[plan.id] || 0
    if (plan.active && subscribers > 0 &&
        !window.confirm(`${subscribers} كيان مشترك في «${plan.name}». إيقافها يمنع الاشتراكات الجديدة فقط ولا يغيّر صلاحيات المشتركين الحاليين. متابعة؟`)) return
    patch(plan, { active: !plan.active }, plan.active ? 'أُوقفت الباقة' : 'فُعِّلت الباقة')
  }

  const toggleGiveToGet = (plan) =>
    patch(plan, { give_to_get_enabled: !plan.give_to_get_enabled },
      plan.give_to_get_enabled ? 'أُلغي Give-to-Get لهذه الباقة' : 'فُعِّل Give-to-Get لهذه الباقة')

  const saveEdit = async () => {
    if (!editing) return

    // Start from what the plan already holds rather than from an empty object.
    // Building it only from the keys this form knows about deleted every other
    // one on save — pending_reports vanished from the free plan that way, and
    // the limit simply stopped applying, with nothing to indicate it had gone.
    // A form should not silently drop what it does not render.
    const limits = { ...(editing.limits || {}) }

    for (const key of Object.keys(LIMIT_LABELS)) {
      const raw = String(editing.limits?.[key] ?? '').trim()
      if (raw === '') { delete limits[key]; continue }   // cleared means unlimited
      const n = Number(raw)
      if (!Number.isFinite(n)) { showToast(`❌ قيمة غير صحيحة في «${LIMIT_LABELS[key]}»`); return }
      limits[key] = n
    }
    const price = Number(editing.price_monthly)
    if (!Number.isFinite(price) || price < 0) { showToast('❌ السعر غير صحيح'); return }
    if (!editing.name.trim()) { showToast('❌ اسم الباقة مطلوب'); return }

    await patch(
      editing,
      {
        name: editing.name.trim(),
        description: (editing.description || '').trim() || null,
        price_monthly: price,
        limits,
        features: editing.features || [],
      },
      'حُفظت الباقة',
    )
    setEditing(null)
  }

  const toggleFeature = (key) => {
    setEditing((p) => {
      const has = (p.features || []).includes(key)
      return { ...p, features: has ? p.features.filter((f) => f !== key) : [...(p.features || []), key] }
    })
  }

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: '#64748B', fontWeight: 600 }}>جاري التحميل...</div>
  }

  return (
    <div>
      {toast && <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 120, maxWidth: '420px' }}>{toast}</div>}

      {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '13px 16px', marginBottom: '16px', color: '#B91C1C', fontSize: '14px', fontWeight: 700 }}>⚠️ {error}</div>}

      <div style={{ marginBottom: '18px' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px' }}>الباقات والصلاحيات ({plans.length})</h2>
        <p style={{ fontSize: '13.5px', color: '#64748B', margin: 0, lineHeight: 1.8 }}>
          ما تعدّله هنا يُطبَّق على الكيانات مباشرة عند تحميلهم التالي — بلا نشر ولا تعديل كود.
        </p>
      </div>

      {plans.length === 0 && (
        <div style={{ ...card, padding: '30px', textAlign: 'center', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: '14px', lineHeight: 1.9 }}>
          لا توجد باقات في قاعدة البيانات. شغّل الهجرة <code style={{ direction: 'ltr', display: 'inline-block' }}>011_plans_entitlements.sql</code> لبذر الباقات الأربع.
        </div>
      )}

      <div style={{ display: 'grid', gap: '14px' }}>
        {plans.map((plan) => {
          const isEditing = editing?.id === plan.id
          const subscribers = counts[plan.id] || 0

          return (
            <div key={plan.id} style={{ ...card, padding: '20px', opacity: plan.active ? 1 : 0.72 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap', marginBottom: '5px' }}>
                    <span style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A' }}>{plan.name}</span>
                    <code style={{ background: '#F1F5F9', color: '#475569', borderRadius: '6px', padding: '2px 8px', fontSize: '11.5px', direction: 'ltr' }}>{plan.code}</code>
                    <span style={{ background: plan.active ? '#ECFDF5' : '#FEE2E2', color: plan.active ? '#15803D' : '#B91C1C', borderRadius: '7px', padding: '3px 11px', fontSize: '12px', fontWeight: 800 }}>
                      {plan.active ? 'مفعّلة' : 'موقوفة'}
                    </span>
                    {plan.is_default && <span style={{ background: '#EEF2FF', color: '#3730A3', borderRadius: '7px', padding: '3px 11px', fontSize: '12px', fontWeight: 800 }}>افتراضية</span>}
                    {plan.give_to_get_enabled && <span style={{ background: '#F0FDF4', color: '#15803D', borderRadius: '7px', padding: '3px 11px', fontSize: '12px', fontWeight: 800 }}>Give-to-Get</span>}
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748B' }}>
                    {Number(plan.price_monthly) > 0 ? `${Number(plan.price_monthly).toLocaleString('en-US')} ر.س / شهرياً` : 'مجانية'} · {subscribers} مشترك
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button disabled={busyId === plan.id} onClick={() => setEditing(isEditing ? null : { ...plan, limits: { ...(plan.limits || {}) }, features: [...(plan.features || [])] })} style={btn('#F1F5F9', '#334155')}>
                    {isEditing ? 'إلغاء' : 'تعديل'}
                  </button>
                  <button disabled={busyId === plan.id} onClick={() => toggleGiveToGet(plan)} style={btn(plan.give_to_get_enabled ? '#FEF3C7' : '#F0FDF4', plan.give_to_get_enabled ? '#92400E' : '#15803D', '1px solid ' + (plan.give_to_get_enabled ? '#FDE68A' : '#BBF7D0'))}>
                    {plan.give_to_get_enabled ? 'إيقاف Give-to-Get' : 'تفعيل Give-to-Get'}
                  </button>
                  <button disabled={busyId === plan.id} onClick={() => toggleActive(plan)} style={btn(plan.active ? '#FEF2F2' : '#F0FDF4', plan.active ? '#B91C1C' : '#15803D', '1px solid ' + (plan.active ? '#FECACA' : '#BBF7D0'))}>
                    {plan.active ? 'إيقاف' : 'تفعيل'}
                  </button>
                </div>
              </div>

              {!isEditing ? (
                <>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    {Object.entries(LIMIT_LABELS).map(([key, label]) => {
                      const v = plan.limits?.[key]
                      const text = v === undefined || v === null || Number(v) === -1 ? 'بلا حد' : v
                      return (
                        <span key={key} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 12px', fontSize: '12.5px', color: '#334155', fontWeight: 700 }}>
                          {label}: <strong style={{ color: '#0F172A' }}>{text}</strong>
                        </span>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                    {(plan.features || []).length === 0
                      ? <span style={{ fontSize: '12.5px', color: '#64748B' }}>لا ميزات إضافية</span>
                      : plan.features.map((f) => (
                        <span key={f} style={{ background: '#EEF2FF', color: '#3730A3', borderRadius: '7px', padding: '5px 11px', fontSize: '12px', fontWeight: 700 }}>{catalog[f] || f}</span>
                      ))}
                  </div>
                </>
              ) : (
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '12px', marginBottom: '14px' }}>
                    <label>
                      <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#0F172A', marginBottom: '5px' }}>الاسم</span>
                      <input style={input} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                    </label>
                    <label>
                      <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#0F172A', marginBottom: '5px' }}>السعر الشهري (ر.س)</span>
                      <input style={{ ...input, direction: 'ltr', textAlign: 'left' }} value={editing.price_monthly ?? ''} onChange={(e) => setEditing({ ...editing, price_monthly: e.target.value })} />
                    </label>
                  </div>

                  <label style={{ display: 'block', marginBottom: '14px' }}>
                    <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#0F172A', marginBottom: '5px' }}>الوصف</span>
                    <input style={input} value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                  </label>

                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A', marginBottom: '7px' }}>
                    الحدود <span style={{ fontWeight: 600, color: '#64748B' }}>— اكتب \u200E-1\u200E أو اترك الحقل فارغاً ليصبح بلا حد</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '10px', marginBottom: '16px' }}>
                    {Object.entries(LIMIT_LABELS).map(([key, label]) => (
                      <label key={key}>
                        <span style={{ display: 'block', fontSize: '12px', color: '#64748B', fontWeight: 700, marginBottom: '4px' }}>{label}</span>
                        <input
                          style={{ ...input, direction: 'ltr', textAlign: 'left' }}
                          value={editing.limits?.[key] ?? ''}
                          onChange={(e) => setEditing({ ...editing, limits: { ...editing.limits, [key]: e.target.value } })}
                        />
                      </label>
                    ))}
                  </div>

                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A', marginBottom: '7px' }}>الميزات</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    {Object.keys(catalog).length === 0 && <span style={{ fontSize: '12.5px', color: '#64748B' }}>لا يوجد فهرس ميزات — شغّل الهجرة 011</span>}
                    {Object.entries(catalog).map(([key, label]) => {
                      const on = (editing.features || []).includes(key)
                      return (
                        <button key={key} onClick={() => toggleFeature(key)} style={{ ...btn(on ? '#16A34A' : '#F1F5F9', on ? '#fff' : '#475569'), fontSize: '12.5px', padding: '7px 13px' }}>
                          {on ? '✓ ' : ''}{label}
                        </button>
                      )
                    })}
                  </div>

                  <div style={{ display: 'flex', gap: '9px' }}>
                    <button disabled={busyId === plan.id} onClick={saveEdit} style={btn('#16A34A', '#fff')}>حفظ التغييرات</button>
                    <button disabled={busyId === plan.id} onClick={() => setEditing(null)} style={btn('#F1F5F9', '#64748B')}>إلغاء</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
