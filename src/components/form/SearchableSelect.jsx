import { useState, useRef, useEffect, useMemo } from 'react'
import { fold } from '../../lib/extraction/fold.js'
import { LIMITS } from '../../lib/validate.js'

/**
 * A dropdown you can type into.
 *
 * Built rather than installed because the requirement is specific: it has to
 * search Arabic the way Arabic is actually typed. «جده» must find «جدة»,
 * «مسئولية» must find «مسؤولية», and a missing hamza must not empty the list.
 * Every off-the-shelf combobox compares strings exactly, which in Arabic means
 * the person types a correct word and is told there are no results.
 *
 * It also has to accept a value that is not on the list. A registry cannot
 * refuse a real company because its city is not in our table — so free entry
 * stays possible and is marked, rather than blocked.
 */
export default function SearchableSelect({
  value,
  onChange,
  options,              // [{value, label}] or ['string']
  placeholder = 'اختر…',
  allowFree = false,    // may the person keep a value that is not an option?
  disabled = false,
  id,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const boxRef = useRef(null)
  const inputRef = useRef(null)

  const items = useMemo(
    () => options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)),
    [options],
  )

  // Folded once per list, not once per keystroke: this runs on every character
  // typed against a list that may hold thousands of activities.
  const folded = useMemo(
    () => items.map((o) => `${fold(o.label)} ${fold(o.value)}`),
    [items],
  )

  const shown = useMemo(() => {
    const q = fold(query)
    if (!q) return items.slice(0, 60)
    const out = []
    // A prefix match is what the person meant; a contained match is a fallback.
    // Ordering them this way puts «جدة» above «حي الجدة الشمالي».
    const starts = []
    const has = []
    for (let i = 0; i < items.length; i++) {
      if (folded[i].startsWith(q)) starts.push(items[i])
      else if (folded[i].includes(q)) has.push(items[i])
      if (starts.length + has.length >= 60) break
    }
    out.push(...starts, ...has)
    return out
  }, [query, items, folded])

  useEffect(() => { setActive(0) }, [query])

  // Close when the click lands outside. Without this the list stays open behind
  // the next field the person moves to.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const pick = (v) => { onChange(v); setQuery(''); setOpen(false) }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, shown.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (shown[active]) pick(shown[active].value)
      else if (allowFree && query.trim()) pick(query.trim())
    } else if (e.key === 'Escape') { setOpen(false) }
  }

  const known = !value || items.some((o) => o.value === value)
  const shownLabel = items.find((o) => o.value === value)?.label ?? value ?? ''

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input maxLength={LIMITS.search}
        id={id}
        ref={inputRef}
        disabled={disabled}
        value={open ? query : shownLabel}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => { setQuery(''); setOpen(true) }}
        onBlur={() => {
          // Typed something, never picked, and free entry is allowed: keep it.
          // Dropping it would silently discard what the person wrote.
          if (allowFree && query.trim() && query.trim() !== shownLabel) onChange(query.trim())
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        style={{
          width: '100%', padding: '9px 12px', borderRadius: '9px',
          fontSize: '13.5px', fontFamily: 'inherit',
          border: `1.5px solid ${!known ? '#FDE68A' : '#E2E8F0'}`,
          background: disabled ? '#F8FAFC' : '#fff',
        }}
      />

      {!known && !open && (
        <div style={{ fontSize: '11.5px', color: '#92400E', marginTop: '4px', fontWeight: 700 }}>
          قيمة خارج القائمة الرسمية — محفوظة كما كتبتها
        </div>
      )}

      {open && (
        <div style={{
          position: 'absolute', zIndex: 40, insetInlineStart: 0, insetInlineEnd: 0, top: 'calc(100% + 4px)',
          background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px',
          boxShadow: '0 10px 30px rgba(15,23,42,.12)', maxHeight: '260px', overflowY: 'auto',
        }}>
          {shown.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: '12.5px', color: '#64748B' }}>
              {allowFree
                ? 'لا نتائج — اضغط Enter لحفظ ما كتبته كما هو'
                : 'لا نتائج مطابقة'}
            </div>
          )}
          {shown.map((o, i) => (
            <button key={o.value} type="button"
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => { e.preventDefault(); pick(o.value) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'start',
                      padding: '9px 13px', border: 'none', cursor: 'pointer',
                      fontSize: '13px', fontFamily: 'inherit',
                      background: i === active ? '#F1F5F9' : 'transparent',
                      color: o.value === value ? '#1E2A52' : '#334155',
                      fontWeight: o.value === value ? 800 : 500,
                    }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
