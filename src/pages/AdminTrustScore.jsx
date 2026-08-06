import { useCallback, useState, useEffect } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { useLiveData } from '../hooks/useLiveData'
import { LiveBadge } from '../components/LiveBadge'
import { SkeletonPage } from '../components/Skeleton'

/**
 * /admin/trust-score — the model behind the number, and what it currently says.
 *
 * The screen held sliders for financial_stability, payment_history and four
 * other factors, none of which exist anywhere in the platform. Moving them
 * changed a useState object and nothing else. Meanwhile the function that
 * actually produced every score on Marsad counted approved reports and read
 * nothing about them: six reports saying "لم يُسدَّد" and six saying "تم السداد"
 * both scored 98.
 *
 * 031 replaced that with the model the seed had been using — on-time ratio,
 * defaults, average delay — and made every constant in it a setting rather than
 * a literal. This edits those settings, shows what the live distribution looks
 * like under them, and recomputes every company when they change. Editing the
 * model without recomputing would change what future scores mean while silently
 * disagreeing with every score already on screen.
 */

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }
const input = { width: '100%', boxSizing: 'border-box', border: '1.5px solid #E2E8F0', borderRadius: '9px', padding: '10px 12px', fontSize: '14px', fontFamily: 'inherit', outline: 'none', textAlign: 'right' }

// path → what the operator is actually deciding
const FIELDS = [
  { path: ['thresholds', 'preliminary_min_reports'], label: 'أقل عدد تقارير لإصدار درجة', hint: 'تحته: «بيانات غير كافية» بلا تقييم' },
  { path: ['thresholds', 'full_min_reports'], label: 'عدد التقارير لدرجة نهائية', hint: 'تحته تُوصف الدرجة بأنها أولية' },
  { path: ['weights', 'base'], label: 'الأساس', hint: 'درجة شركة سجلّها متوسط' },
  { path: ['weights', 'on_time'], label: 'وزن السداد في موعده', hint: 'يُضاف كاملاً إذا سدّدت في كل تعامل' },
  { path: ['weights', 'default'], label: 'وزن التعثّر', hint: 'يُخصم كاملاً إذا تعثّرت في كل تعامل' },
  { path: ['weights', 'delay_penalty_cap'], label: 'سقف خصم التأخير', hint: 'أقصى ما يكلّفه التأخير وحده' },
  { path: ['weights', 'delay_days_per_point'], label: 'أيام التأخير لكل نقطة خصم', hint: 'متوسط التأخير مقسوماً على هذا الرقم' },
  { path: ['clamp', 'floor'], label: 'أدنى درجة ممكنة', hint: 'لشركة مُقيَّمة — لا ينطبق على «بيانات غير كافية»' },
  { path: ['clamp', 'ceiling'], label: 'أعلى درجة ممكنة', hint: '' },
  { path: ['bands', 'low_min'], label: 'حد نطاق «مخاطر منخفضة»', hint: 'الدرجة عنده فأعلى تُعرض خضراء' },
  { path: ['bands', 'medium_min'], label: 'حد نطاق «مخاطر متوسطة»', hint: 'تحته: مخاطر مرتفعة' },
]

const BANDS = {
  low: { label: 'مخاطر منخفضة', c: '#16A34A', bg: '#ECFDF5' },
  medium: { label: 'مخاطر متوسطة', c: '#F59E0B', bg: '#FFFBEB' },
  high: { label: 'مخاطر مرتفعة', c: '#DC2626', bg: '#FEF2F2' },
  none: { label: 'بيانات غير كافية', c: '#64748B', bg: '#F1F5F9' },
}

const get = (obj, path) => path.reduce((o, k) => o?.[k], obj)
const set = (obj, path, value) => {
  const next = structuredClone(obj)
  let cur = next
  for (const k of path.slice(0, -1)) { cur[k] = cur[k] ?? {}; cur = cur[k] }
  cur[path[path.length - 1]] = value
  return next
}

export default function AdminTrustScore() {
  const { user } = useUser()
  const [rules, setRules] = useState(null)
  const [draft, setDraft] = useState(null)
  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 5000) }

  const load = useCallback(async () => {
    try {
      setError('')
      const supabase = getSupabase()
      const [{ data: setting, error: e1 }, { data: ts, error: e2 }] = await Promise.all([
        supabase.from('system_settings').select('value').eq('key', 'trust_score_rules').maybeSingle(),
        supabase.from('trust_scores').select('score, risk_band, tier, approved_reports, computed_at, companies ( name )').order('score', { ascending: false }).limit(200),
      ])
      if (e1) throw e1
      if (e2) throw e2

      setRules(setting?.value || null)
      setDraft((d) => d ?? setting?.value ?? null)
      setScores(ts || [])
    } catch (err) {
      setError(err.message || 'تعذّر التحميل')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const { connected, liveAt } = useLiveData(load, { tables: ['trust_scores', 'system_settings'] })

  const dirty = draft && rules && JSON.stringify(draft) !== JSON.stringify(rules)

  const save = async () => {
    try {
      setSaving(true)
      const supabase = getSupabase()

      const { data, error: e } = await supabase
        .from('system_settings')
        .update({ value: draft, updated_by: user?.id, updated_at: new Date().toISOString() })
        .eq('key', 'trust_score_rules')
        .select('key')
      if (e) throw e
      if (!data?.length) throw new Error('لم تُحفظ المعادلة — تحقّق من صلاحيتك')

      // Saving without this leaves every score on the platform reflecting the
      // model that was just replaced.
      const { data: n, error: e2 } = await supabase.rpc('recompute_all_trust_scores')
      if (e2) throw e2

      await supabase.from('audit_logs').insert([{
        actor_id: user?.id, action: 'trust_score_rules_updated', entity: 'system_settings',
        meta: JSON.stringify(draft), created_at: new Date().toISOString(),
      }])

      await load()
      showToast(`✅ حُفظت المعادلة وأُعيد احتساب ${n} شركة`)
    } catch (err) {
      showToast(`❌ ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const recompute = async () => {
    try {
      setSaving(true)
      const { data: n, error: e } = await getSupabase().rpc('recompute_all_trust_scores')
      if (e) throw e
      await load()
      showToast(`✅ أُعيد احتساب ${n} شركة`)
    } catch (err) {
      showToast(`❌ ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <SkeletonPage stats={4} panels={2} />
  }

  const rated = scores.filter((s) => s.tier !== 'none')
  const dist = Object.keys(BANDS).map((b) => ({ band: b, n: scores.filter((s) => s.risk_band === b).length }))
  const avg = rated.length ? Math.round(rated.reduce((a, s) => a + s.score, 0) / rated.length) : 0

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 100, boxShadow: '0 8px 24px rgba(15,23,42,.25)', maxWidth: '440px', lineHeight: 1.8 }}>{toast}</div>
      )}

      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#0F172A', margin: '0 0 5px', textAlign: 'right' }}>معادلة درجة الثقة</h1>
          <p style={{ fontSize: '14px', color: '#64748B', margin: 0, textAlign: 'right' }}>الدرجة تُحتسب من سلوك السداد في التقارير المعتمدة — لا من عددها</p>
        </div>
        <LiveBadge connected={connected} liveAt={liveAt} />
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '13px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#B91C1C', fontSize: '14px', fontWeight: 700 }}>⚠️ {error}</div>
      )}

      {/* Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '14px', marginBottom: '18px' }}>
        {dist.map((d) => {
          const b = BANDS[d.band]
          return (
            <div key={d.band} style={{ ...card, padding: '18px' }}>
              <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 700, marginBottom: '6px', textAlign: 'right' }}>{b.label}</div>
              <div style={{ fontSize: '28px', fontWeight: 900, color: b.c, textAlign: 'right' }}>{d.n}</div>
            </div>
          )
        })}
        <div style={{ ...card, padding: '18px' }}>
          <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 700, marginBottom: '6px', textAlign: 'right' }}>متوسط الدرجة المُقيَّمة</div>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#1E2A52', textAlign: 'right' }}>{avg}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.05fr', gap: '18px', alignItems: 'start' }}>
        {/* The model */}
        <div style={{ ...card, padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px', textAlign: 'right' }}>المعاملات</h2>
          <p style={{ fontSize: '12.5px', color: '#64748B', margin: '0 0 18px', fontWeight: 600, textAlign: 'right', lineHeight: 1.9 }}>
            الدرجة = الأساس + (نسبة السداد في موعده × وزنها) − (نسبة التعثّر × وزنها) − خصم التأخير
          </p>

          {draft && FIELDS.map((f) => (
            <div key={f.path.join('.')} style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: '12px', alignItems: 'center', marginBottom: '13px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155' }}>{f.label}</div>
                {f.hint && <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, lineHeight: 1.7 }}>{f.hint}</div>}
              </div>
              <input
                type="number"
                value={get(draft, f.path) ?? ''}
                onChange={(e) => setDraft(set(draft, f.path, e.target.value === '' ? '' : Number(e.target.value)))}
                style={input}
              />
            </div>
          ))}

          <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
            <button onClick={save} disabled={!dirty || saving} style={{ background: dirty && !saving ? '#16A34A' : '#CBD5E1', color: '#fff', border: 0, borderRadius: '10px', padding: '11px 24px', fontSize: '14px', fontWeight: 800, cursor: dirty && !saving ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              {saving ? 'جاري الحفظ...' : 'حفظ وإعادة الاحتساب'}
            </button>
            {dirty && (
              <button onClick={() => setDraft(rules)} disabled={saving} style={{ background: '#F1F5F9', color: '#334155', border: 0, borderRadius: '10px', padding: '11px 20px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                تراجع
              </button>
            )}
            <button onClick={recompute} disabled={saving} style={{ background: '#fff', color: '#334155', border: '1.5px solid #E2E8F0', borderRadius: '10px', padding: '11px 20px', fontSize: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              إعادة احتساب الكل
            </button>
          </div>
          {dirty && (
            <p style={{ fontSize: '12.5px', color: '#B45309', margin: '12px 2px 0', fontWeight: 700, lineHeight: 1.9, textAlign: 'right' }}>
              الحفظ يُعيد احتساب درجات كل الشركات فوراً — الدرجات المعروضة الآن ستتغيّر.
            </p>
          )}
        </div>

        {/* What it produces */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px 14px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A', margin: 0, textAlign: 'right' }}>الدرجات الحالية</h2>
            <p style={{ fontSize: '12.5px', color: '#64748B', margin: '4px 0 0', fontWeight: 600, textAlign: 'right' }}>{scores.length} شركة مُحتسبة</p>
          </div>
          <div style={{ maxHeight: '620px', overflowY: 'auto' }}>
            {scores.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontSize: '13.5px', fontWeight: 600 }}>لا توجد درجات محتسبة بعد</div>
            ) : scores.map((s, i) => {
              const b = BANDS[s.risk_band] || BANDS.none
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.7fr 0.7fr 1fr 0.8fr', gap: '10px', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid #F1F5F9', textAlign: 'right' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.companies?.name || '—'}</span>
                  <span style={{ fontSize: '17px', fontWeight: 900, color: b.c }}>{s.tier === 'none' ? '—' : s.score}</span>
                  <span><span style={{ fontSize: '11.5px', fontWeight: 800, background: b.bg, color: b.c, padding: '3px 9px', borderRadius: '6px' }}>{b.label}</span></span>
                  <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 700 }}>{s.approved_reports} تقرير</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
