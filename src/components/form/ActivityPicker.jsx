import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { fold } from '../../lib/extraction/fold.js'

/**
 * Pick activities from the national directory, by name or by code.
 *
 * ============================================================================
 * Why the list comes from the database
 * ============================================================================
 * The Ministry of Commerce publishes the national economic activity directory
 * (ISIC4) — thousands of activities, each with a code. It is not something this
 * repository can hold accurately: the ministry serves it through a page that
 * renders in JavaScript behind an anti-automation control, so there is no file
 * to vendor, and writing plausible six-digit codes by hand would put invented
 * official data in front of people.
 *
 * So `reference_activities` is loaded by an administrator, and this component
 * reads whatever is there. Today that is the ISIC4 divisions — the published
 * international structure. The day the official file is imported, or a Wathq
 * lookup returns activities with codes, every dropdown fills in without a
 * deployment.
 *
 * Until then, and afterwards for anything the directory lacks, an activity can
 * be typed. It is kept and marked, never refused: a real company whose activity
 * is missing from our copy of a list is still a real company.
 */

/** @param {{code?: string, name: string}[]} value */
export default function ActivityPicker({ value = [], onChange, max = 30 }) {
  const [all, setAll] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('reference_activities')
      .select('code, name_ar, level')
      .eq('active', true)
      .order('code')
      .limit(6000)
      .then(({ data, error }) => {
        if (!alive) return
        // A directory that fails to load must not block the field. The person
        // types the activity instead, exactly as they would for one that is
        // missing from it.
        if (error) console.warn('reference_activities:', error.message)
        setAll(data ?? [])
        setLoading(false)
      })
    return () => { alive = false }
  }, [])

  const folded = useMemo(() => all.map((a) => `${fold(a.name_ar)} ${a.code}`), [all])

  const shown = useMemo(() => {
    const q = fold(query)
    if (!q) return all.slice(0, 40)
    const out = []
    for (let i = 0; i < all.length && out.length < 40; i++) {
      if (folded[i].includes(q)) out.push(all[i])
    }
    return out
  }, [query, all, folded])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const has = (code, name) => value.some((v) => (code ? v.code === code : v.name === name))

  const add = (item) => {
    if (value.length >= max || has(item.code, item.name)) return
    onChange([...value, item])
    setQuery('')
  }

  const addTyped = () => {
    const name = query.trim().replace(/\s+/g, ' ')
    if (!name) return
    // «561010 المطاعم مع الخدمة» pasted whole: split the code off rather than
    // storing it inside the name, so it can still be matched later.
    const m = /^(\d{4,7})\s+(.+)$/.exec(name)
    add(m ? { code: m[1], name: m[2] } : { code: null, name })
    setOpen(false)
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
          {value.map((v, i) => (
            <div key={`${v.code ?? 'x'}-${i}`} style={{
              display: 'flex', alignItems: 'center', gap: '9px',
              background: v.code ? '#F8FAFC' : '#FFFBEB',
              border: `1px solid ${v.code ? '#E2E8F0' : '#FDE68A'}`,
              borderRadius: '9px', padding: '8px 11px',
            }}>
              {v.code && (
                <code style={{ direction: 'ltr', background: '#EEF2FF', color: '#1E2A52', borderRadius: '5px', padding: '2px 7px', fontSize: '11.5px', fontWeight: 800 }}>
                  {v.code}
                </code>
              )}
              <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 600, flex: 1 }}>{v.name}</span>
              {!v.code && (
                <span style={{ fontSize: '11px', color: '#92400E', fontWeight: 800 }}>بلا كود</span>
              )}
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}
                      aria-label={`حذف ${v.name}`}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '17px', lineHeight: 1, padding: 0 }}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          if (shown.length === 1) add(shown[0]); else addTyped()
        }}
        placeholder={loading ? 'يحمّل دليل الأنشطة…' : 'ابحث بالاسم أو بالكود، أو اكتب النشاط واضغط Enter'}
        disabled={value.length >= max}
        autoComplete="off"
        style={{
          width: '100%', padding: '9px 12px', borderRadius: '9px',
          fontSize: '13.5px', fontFamily: 'inherit',
          border: '1.5px solid #E2E8F0', background: '#fff',
        }}
      />

      {open && query.trim() && (
        <div style={{
          position: 'absolute', zIndex: 40, insetInlineStart: 0, insetInlineEnd: 0, top: 'calc(100% + 4px)',
          background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px',
          boxShadow: '0 10px 30px rgba(15,23,42,.12)', maxHeight: '250px', overflowY: 'auto',
        }}>
          {shown.map((a) => (
            <button key={a.code} type="button"
                    onMouseDown={(e) => { e.preventDefault(); add({ code: a.code, name: a.name_ar }) }}
                    disabled={has(a.code)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '9px', width: '100%', textAlign: 'start',
                      padding: '9px 12px', border: 'none', cursor: has(a.code) ? 'default' : 'pointer',
                      background: 'transparent', fontSize: '13px', fontFamily: 'inherit',
                      opacity: has(a.code) ? 0.4 : 1,
                    }}>
              <code style={{ direction: 'ltr', color: '#64748B', fontSize: '11.5px', fontWeight: 800, minWidth: '46px' }}>{a.code}</code>
              <span style={{ color: '#334155' }}>{a.name_ar}</span>
            </button>
          ))}

          <button type="button" onMouseDown={(e) => { e.preventDefault(); addTyped() }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'start', padding: '10px 12px',
                    border: 'none', borderTop: shown.length ? '1px solid #F1F5F9' : 'none',
                    cursor: 'pointer', background: '#FFFBEB', fontSize: '12.5px',
                    fontFamily: 'inherit', color: '#92400E', fontWeight: 700,
                  }}>
            أضف «{query.trim()}» كما كتبته
          </button>
        </div>
      )}

      <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '6px', lineHeight: 1.8 }}>
        {loading ? '…'
          : all.length
            ? `الدليل الوطني: ${all.length} نشاط. النشاط غير الموجود اكتبه وسيُحفظ كما هو.`
            : 'دليل الأنشطة غير محمّل — اكتب النشاط يدوياً.'}
      </div>
    </div>
  )
}
