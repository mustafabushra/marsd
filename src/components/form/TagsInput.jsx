import { useState } from 'react'
import { LIMITS } from '../../lib/validate.js'

/**
 * A list of short values, entered one at a time.
 *
 * For managers, where a registration lists several names and a single text box
 * would leave the person deciding whether to separate them with a comma, a
 * slash, or a new line — and would leave us parsing that decision later. Each
 * name is entered as itself.
 *
 * @param {string[]} value
 * @param {(next: string[]) => void} onChange
 */
export default function TagsInput({ value = [], onChange, placeholder = 'اكتب ثم اضغط Enter', max = 40 }) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const v = draft.trim().replace(/\s+/g, ' ')
    if (!v) return
    // Silently ignoring a duplicate is better than an error message: the person
    // typed a name that is already there, and the list is already correct.
    if (!value.includes(v) && value.length < max) onChange([...value, v])
    setDraft('')
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: value.length ? '7px' : 0 }}>
        {value.map((v) => (
          <span key={v} style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            background: '#EEF2FF', color: '#1E2A52', borderRadius: '8px',
            padding: '5px 10px', fontSize: '12.5px', fontWeight: 700,
          }}>
            {v}
            <button type="button"
                    onClick={() => onChange(value.filter((x) => x !== v))}
                    aria-label={`حذف ${v}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '15px', lineHeight: 1, padding: 0 }}>
              ×
            </button>
          </span>
        ))}
      </div>

      <input maxLength={LIMITS.search}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); add() }
          // Backspace on an empty box removes the last entry — the behaviour
          // every tag field has, and the one people try without being told.
          else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        // Leaving the field must not discard what is in it. Somebody who types
        // a name and clicks Save expects that name to be saved.
        onBlur={add}
        placeholder={value.length >= max ? `الحد ${max}` : placeholder}
        disabled={value.length >= max}
        style={{
          width: '100%', padding: '9px 12px', borderRadius: '9px',
          fontSize: '13.5px', fontFamily: 'inherit',
          border: '1.5px solid #E2E8F0', background: '#fff',
        }}
      />
    </div>
  )
}
