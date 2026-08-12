import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '../lib/api'
import { SkeletonPage } from '../components/Skeleton'
import { Card } from '../ui'

/**
 * /admin/settings — the settings the platform actually reads.
 *
 * This page used to hold eight values in useState (minReports, dailyBackups and
 * so on) and fetch /api/settings, an endpoint that does not exist. The request
 * failed on every load, the defaults stayed, and saving posted into the same
 * void — so the page described a configuration surface the platform did not
 * have, while the settings it does have were unreachable.
 *
 * What it edits now is public.system_settings, the same rows useEntitlements
 * reads: the Give-to-Get rates, the feature catalogue, and the enforcement kill
 * switch. Changing a rate here changes what a contribution is worth on the next
 * page load, with no deploy — which is the whole reason those values are rows
 * rather than constants.
 *
 * Keys are shown but never editable. The application looks them up by name, so
 * renaming one from a form would silently disconnect the setting from the code
 * that reads it, and nothing would appear to be wrong.
 */

const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px' }
const input = { width: '100%', boxSizing: 'border-box', border: '1.5px solid #E2E8F0', borderRadius: '8px', padding: '9px 11px', fontSize: '13.5px', fontFamily: 'inherit', outline: 'none' }
const btn = (bg, fg, border) => ({ background: bg, color: fg, border: border || 0, borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' })

export default function AdminSettings() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busyKey, setBusyKey] = useState(null)
  const [draft, setDraft] = useState({})

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  const load = useCallback(async () => {
    try {
      setError('')
      const { data, error: e } = await getSupabase()
        .from('system_settings')
        .select('key, value, description, updated_at')
        .order('key')
      if (e) throw e
      setRows(data || [])
    } catch (err) {
      setError(err.message || 'تعذّر تحميل الإعدادات')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = async (key, value) => {
    try {
      setBusyKey(key)
      const { data, error: e } = await getSupabase()
        .from('system_settings')
        .update({ value, updated_at: new Date().toISOString() })
        .eq('key', key)
        .select('key')
      if (e) throw e
      // These settings are read by the database at the moment of each write —
      // plan enforcement, Give-to-Get rates, the trust model. A save that
      // reports success without landing leaves the whole platform on the old
      // rule while the panel shows the new one.
      if (!data?.length) throw new Error('لم يُحفظ الإعداد — تحقّق من صلاحيتك')
      await load()
      setDraft((d) => { const n = { ...d }; delete n[key]; return n })
      showToast('حُفظ الإعداد — يسري على الجميع عند التحميل التالي')
    } catch (err) {
      showToast('❌ ' + (err.message || 'تعذّر الحفظ'))
    } finally {
      setBusyKey(null)
    }
  }

  // ---- Give-to-Get: edited as fields, because that is what it is ----------
  const renderGiveToGet = (row) => {
    const v = draft[row.key] ?? row.value ?? {}
    const setRate = (bucket, action, points) => {
      const next = JSON.parse(JSON.stringify(v))
      next[bucket] = next[bucket] || {}
      next[bucket][action] = { ...(next[bucket][action] || {}), points: Number(points) || 0 }
      setDraft((d) => ({ ...d, [row.key]: next }))
    }
    const setCap = (cap) => setDraft((d) => ({ ...d, [row.key]: { ...v, monthly_earn_cap: Number(cap) || 0 } }))
    const dirty = !!draft[row.key]

    return (
      <>
        <div style={{ fontSize: '13px', fontWeight: 800, color: '#15803D', marginBottom: '8px' }}>ما تُكسبه كل مساهمة</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '10px', marginBottom: '16px' }}>
          {Object.entries(v.earn || {}).map(([action, rule]) => (
            <label key={action} style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '11px 13px' }}>
              <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#166534', marginBottom: '6px' }}>{rule.label || action}</span>
              <input
                style={{ ...input, direction: 'ltr', textAlign: 'left', background: '#fff' }}
                value={rule.points ?? ''}
                onChange={(e) => setRate('earn', action, e.target.value)}
              />
            </label>
          ))}
        </div>

        <div style={{ fontSize: '13px', fontWeight: 800, color: '#92400E', marginBottom: '8px' }}>ما تُكلّفه كل عملية إضافية</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '10px', marginBottom: '16px' }}>
          {Object.entries(v.spend || {}).map(([action, rule]) => (
            <label key={action} style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '11px 13px' }}>
              <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#92400E', marginBottom: '6px' }}>{rule.label || action}</span>
              <input
                style={{ ...input, direction: 'ltr', textAlign: 'left', background: '#fff' }}
                value={rule.points ?? ''}
                onChange={(e) => setRate('spend', action, e.target.value)}
              />
            </label>
          ))}
        </div>

        <label style={{ display: 'block', maxWidth: '280px', marginBottom: '14px' }}>
          <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 800, color: '#0F172A', marginBottom: '5px' }}>سقف الكسب الشهري لكل كيان</span>
          <input style={{ ...input, direction: 'ltr', textAlign: 'left' }} value={v.monthly_earn_cap ?? ''} onChange={(e) => setCap(e.target.value)} />
          <span style={{ display: 'block', fontSize: '11.5px', color: '#64748B', marginTop: '5px', lineHeight: 1.7 }}>
            المساهمة بلا حد، وما تتحوّل إليه من صلاحيات محدود. صفر يعني بلا سقف.
          </span>
        </label>

        {dirty && (
          <div style={{ display: 'flex', gap: '9px' }}>
            <button disabled={busyKey === row.key} onClick={() => save(row.key, v)} style={btn('#16A34A', '#fff')}>حفظ</button>
            <button disabled={busyKey === row.key} onClick={() => setDraft((d) => { const n = { ...d }; delete n[row.key]; return n })} style={btn('#F1F5F9', '#64748B')}>تراجع</button>
          </div>
        )}
      </>
    )
  }

  // ---- Enforcement kill switch ------------------------------------------
  const renderEnforcement = (row) => {
    const on = row.value?.enabled !== false
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ background: on ? '#ECFDF5' : '#FEE2E2', color: on ? '#15803D' : '#B91C1C', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: 800 }}>
            {on ? 'الحدود مطبَّقة' : '⚠️ الحدود موقوفة — الجميع بلا قيود'}
          </span>
          <button
            disabled={busyKey === row.key}
            onClick={() => {
              if (on && !window.confirm('إيقاف تطبيق الحدود يمنح كل الكيانات وصولاً غير محدود فوراً، بغض النظر عن باقاتهم. للطوارئ فقط. متابعة؟')) return
              save(row.key, { ...(row.value || {}), enabled: !on })
            }}
            style={btn(on ? '#FEF2F2' : '#F0FDF4', on ? '#B91C1C' : '#15803D', '1px solid ' + (on ? '#FECACA' : '#BBF7D0'))}
          >
            {on ? 'إيقاف التطبيق' : 'إعادة التطبيق'}
          </button>
        </div>
        <p style={{ fontSize: '12.5px', color: '#64748B', margin: '10px 0 0', lineHeight: 1.8 }}>
          مفتاح طوارئ: إن ظهر خلل يحجب عملاء عن حقوقهم، يوقف الحدود فوراً دون نشر — ثم يُعاد بعد الإصلاح.
        </p>
      </div>
    )
  }

  // ---- Feature catalogue: labels only ------------------------------------
  const renderCatalog = (row) => {
    const v = draft[row.key] ?? row.value ?? {}
    const dirty = !!draft[row.key]
    return (
      <>
        <p style={{ fontSize: '12.5px', color: '#64748B', margin: '0 0 12px', lineHeight: 1.8 }}>
          المفتاح هو ما يفحصه التطبيق، والقيمة هي ما يقرأه المستخدم. المفاتيح غير قابلة للتعديل — تغيير مفتاح يفصل الميزة عن الكود الذي يقرأها بلا أي خطأ ظاهر.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '10px', marginBottom: '14px' }}>
          {Object.entries(v).map(([key, label]) => (
            <label key={key} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '11px 13px' }}>
              <code style={{ display: 'block', fontSize: '11.5px', color: '#64748B', direction: 'ltr', marginBottom: '6px' }}>{key}</code>
              <input
                style={{ ...input, background: '#fff' }}
                value={label}
                onChange={(e) => setDraft((d) => ({ ...d, [row.key]: { ...v, [key]: e.target.value } }))}
              />
            </label>
          ))}
        </div>
        {dirty && (
          <div style={{ display: 'flex', gap: '9px' }}>
            <button disabled={busyKey === row.key} onClick={() => save(row.key, v)} style={btn('#16A34A', '#fff')}>حفظ</button>
            <button disabled={busyKey === row.key} onClick={() => setDraft((d) => { const n = { ...d }; delete n[row.key]; return n })} style={btn('#F1F5F9', '#64748B')}>تراجع</button>
          </div>
        )}
      </>
    )
  }

  // Anything added to system_settings later is still manageable here, as raw
  // JSON, rather than being invisible until someone writes a form for it.
  const renderRaw = (row) => {
    const text = draft[row.key] ?? JSON.stringify(row.value, null, 2)
    const dirty = draft[row.key] !== undefined
    return (
      <>
        <textarea
          value={text}
          onChange={(e) => setDraft((d) => ({ ...d, [row.key]: e.target.value }))}
          rows={Math.min(16, String(text).split('\n').length + 1)}
          style={{ ...input, direction: 'ltr', textAlign: 'left', fontFamily: 'monospace', fontSize: '12.5px', lineHeight: 1.7, resize: 'vertical' }}
        />
        {dirty && (
          <div style={{ display: 'flex', gap: '9px', marginTop: '10px' }}>
            <button
              disabled={busyKey === row.key}
              onClick={() => {
                try {
                  save(row.key, JSON.parse(text))
                } catch {
                  showToast('❌ الصيغة غير صالحة — تحقّق من JSON قبل الحفظ')
                }
              }}
              style={btn('#16A34A', '#fff')}
            >حفظ</button>
            <button disabled={busyKey === row.key} onClick={() => setDraft((d) => { const n = { ...d }; delete n[row.key]; return n })} style={btn('#F1F5F9', '#64748B')}>تراجع</button>
          </div>
        )}
      </>
    )
  }

  const TITLES = {
    give_to_get_rules: 'قواعد Give-to-Get',
    feature_catalog: 'فهرس الميزات',
    entitlements_enforcement: 'تطبيق الحدود',
    document_ai: 'قراءة المستندات آلياً',
  }

  if (loading) {
    return <SkeletonPage stats={0} panels={3} />
  }

  return (
    <div>
      {toast && <div style={{ position: 'fixed', bottom: '24px', left: '24px', background: '#0F172A', color: '#fff', borderRadius: '10px', padding: '12px 18px', fontSize: '13.5px', fontWeight: 700, zIndex: 120, maxWidth: '440px' }}>{toast}</div>}

      {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', padding: '13px 16px', marginBottom: '16px', color: '#B91C1C', fontSize: '14px', fontWeight: 700 }}>⚠️ {error}</div>}

      <div style={{ marginBottom: '18px' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 900, color: '#0F172A', margin: '0 0 6px' }}>إعدادات النظام ({rows.length})</h2>
        <p style={{ fontSize: '13.5px', color: '#64748B', margin: 0, lineHeight: 1.8 }}>
          هذه هي الصفوف التي يقرأها التطبيق فعلاً. ما يُحفظ هنا يسري على الجميع عند التحميل التالي — بلا نشر.
        </p>
      </div>

      {rows.length === 0 && (
        <Card style={{ padding: '30px', textAlign: 'center', color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: '14px', lineHeight: 1.9 }}>
          لا توجد إعدادات في قاعدة البيانات. شغّل الهجرة <code style={{ direction: 'ltr', display: 'inline-block' }}>011_plans_entitlements.sql</code>.
        </Card>
      )}

      <div style={{ display: 'grid', gap: '14px' }}>
        {rows.map((row) => (
          <div key={row.key} style={{ ...card, padding: '20px' }}>
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '5px' }}>
                <span style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A' }}>{TITLES[row.key] || row.key}</span>
                <code style={{ background: '#F1F5F9', color: '#475569', borderRadius: '6px', padding: '2px 8px', fontSize: '11.5px', direction: 'ltr' }}>{row.key}</code>
              </div>
              {row.description && <p style={{ fontSize: '12.5px', color: '#64748B', margin: 0, lineHeight: 1.8 }}>{row.description}</p>}
            </div>

            {row.key === 'give_to_get_rules' ? renderGiveToGet(row)
              : row.key === 'entitlements_enforcement' ? renderEnforcement(row)
              : row.key === 'feature_catalog' ? renderCatalog(row)
              : renderRaw(row)}

            {row.updated_at && (
              <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '14px' }}>
                آخر تحديث: {new Date(row.updated_at).toLocaleString('en-GB')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
