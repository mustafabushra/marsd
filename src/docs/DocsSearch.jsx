import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { fold } from '../lib/extraction/fold.js'
import { DOC } from './tokens'
import { hrefFor, pageAt } from './nav'
import { useDocLang } from './DocLangContext'

/**
 * الفهرس يُجلَب عند أوّل فتح، لا يُستورَد.
 *
 * الاستيراد كان يُدخله في حزمة التوثيق: نحو ٥٫٥ ك.ب لكل صفحة، أي ميغابايت
 * ونصف عند ثلاثمئة صفحة يُنزّلها من يفتح أوّل صفحة ولو لم يبحث.
 *
 * والوعد يُخزَّن لا النتيجة، فطلبان متزامنان لا يُنتجان جلبتين.
 */
let indexPromise = null
const loadIndex = () => {
  if (!indexPromise) {
    indexPromise = fetch('/docs-search-index.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .catch((e) => { indexPromise = null; throw e })
  }
  return indexPromise
}

/**
 * البحث في التوثيق.
 *
 * ============================================================================
 * لماذا يُعاد استعمال طيّ العربية
 * ============================================================================
 * من يكتب «مستندات» يجب أن يجد «المستندات»، ومن يكتب «امن» يجب أن يجد «أمن».
 * والمقارنة الحرفية تقول «لا نتائج» لكلمة صحيحة — وهو أسوأ ما يفعله بحث،
 * لأن الباحث يستنتج أن المحتوى غير موجود.
 *
 * والطيّ مكتوب في المشروع منذ محرّك الاستخراج وتستعمله لوحة الأوامر. فهو
 * يُستورد لا يُكتب من جديد: نسختان تفترقان، فتجد إحداهما ما لا تجده الأخرى.
 *
 * ============================================================================
 * الترتيب
 * ============================================================================
 * تطابق العنوان يسبق العنوان الفرعي، والعنوان الفرعي يسبق المتن. وبادئةُ
 * الكلمة تسبق ورودها في وسطها. والتعادل يُفكّ بالعنوان كي لا يتحرّك الترتيب
 * بين بحثين متطابقين — فالنتيجة الأولى تتزحزح ويد الباحث على Enter.
 */

const MAX = 8

export default function DocsSearch ({ open, onClose }) {
  const lang = useDocLang()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [index, setIndex] = useState(null)
  const [loadErr, setLoadErr] = useState(false)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQ(''); setActive(0); setLoadErr(false)
      loadIndex().then(setIndex).catch(() => setLoadErr(true))
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
    return undefined
  }, [open])

  // منع تمرير الصفحة خلف النافذة.
  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const results = useMemo(() => {
    if (!index) return []
    const needle = fold(q.trim())
    if (needle.length < 2) return []
    const pool = index.filter((e) => e.lang === lang)
    // لا نتائج بلغة القارئ؟ يُبحث في العربية: الترجمة ناقصة، والمحتوى موجود.
    const src = pool.length ? pool : index.filter((e) => e.lang === 'ar')

    const scored = []
    for (const e of src) {
      const title = fold(e.title)
      const desc = fold(e.description)
      let score = 0
      let where = null

      if (title.startsWith(needle)) { score = 100; where = 'title' }
      else if (title.includes(needle)) { score = 80; where = 'title' }

      const h = e.headings.find((x) => fold(x.text).includes(needle))
      if (h && score < 60) { score = 60; where = 'heading' }

      if (!score && desc.includes(needle)) { score = 45; where = 'description' }
      if (!score && e.endpoints.some((p) => fold(p).includes(needle))) { score = 55; where = 'endpoint' }
      if (!score && e.haystack.includes(needle)) { score = 25; where = 'body' }

      if (!score) continue
      scored.push({ ...e, score, where, heading: h || null })
    }

    scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    return scored.slice(0, MAX)
  }, [q, lang, index])

  useEffect(() => { setActive(0) }, [q])

  const go = (r) => {
    if (!r) return
    const base = hrefFor(r.slug, r.lang)
    navigate(r.heading ? `${base}#${r.heading.id}` : base)
    onClose()
  }

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]) }
  }

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const short = q.trim().length > 0 && q.trim().length < 2

  return (
    <div role="presentation" onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 80,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '10vh 16px 16px',
    }}>
      <div role="dialog" aria-modal="true" aria-label="البحث في التوثيق"
           onClick={(e) => e.stopPropagation()}
           style={{
             width: '100%', maxWidth: '580px', background: DOC.bg,
             borderRadius: '15px', boxShadow: '0 24px 60px rgba(15,23,42,.28)',
             overflow: 'hidden', display: 'flex', flexDirection: 'column',
             maxHeight: '70vh',
           }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '13px 16px', borderBottom: `1px solid ${DOC.border}`,
        }}>
          <span aria-hidden="true" style={{ color: DOC.faint, fontSize: '16px' }}>⌕</span>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
                 onKeyDown={onKey} maxLength={120}
                 type="text" role="combobox" aria-expanded={results.length > 0}
                 aria-controls="doc-search-results" aria-autocomplete="list"
                 placeholder="ابحث في التوثيق…"
                 style={{
                   flex: 1, border: 0, outline: 'none', fontSize: '15.5px',
                   fontFamily: 'inherit', color: DOC.ink, background: 'transparent',
                 }} />
          <kbd style={{
            fontSize: '11px', fontFamily: DOC.text.mono, color: DOC.faint,
            border: `1px solid ${DOC.border}`, borderRadius: '5px', padding: '2px 6px',
          }}>Esc</kbd>
        </div>

        <div id="doc-search-results" ref={listRef} role="listbox"
             aria-label="نتائج البحث"
             style={{ overflowY: 'auto', padding: '6px' }}>
          {loadErr && <Hint>تعذّر تحميل فهرس البحث — أعد المحاولة</Hint>}
          {!loadErr && !index && (
            <div aria-live="polite" style={{ padding: '26px 16px', textAlign: 'center' }}>
              {[86, 70, 78].map((w, i) => (
                <div key={i} aria-hidden="true" style={{
                  height: '11px', width: `${w}%`, margin: '0 auto 10px',
                  background: DOC.subtle, borderRadius: '6px',
                }} />
              ))}
              <span style={{ fontSize: '12.5px', color: DOC.faint, fontWeight: 700 }}>
                يُحمَّل فهرس البحث…
              </span>
            </div>
          )}
          {index && short && <Hint>اكتب حرفين على الأقلّ</Hint>}
          {index && !short && q.trim().length >= 2 && results.length === 0 && (
            <Hint>
              لا نتائج لـ «{q.trim()}»
              <div style={{ fontSize: '12.5px', color: DOC.faint, marginTop: '6px', fontWeight: 600 }}>
                جرّب كلمة أقصر، أو ابحث بمسار مثل <code dir="ltr">/api/scan-document</code>
              </div>
            </Hint>
          )}
          {index && !q.trim() && <Hint>ابحث في العناوين والأقسام والمحتوى ومسارات الواجهة</Hint>}

          {results.map((r, i) => {
            const nav = pageAt(r.slug)
            return (
              <button key={`${r.lang}/${r.slug}`} type="button" role="option"
                      aria-selected={i === active} data-active={i === active}
                      onMouseEnter={() => setActive(i)} onClick={() => go(r)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'start',
                        background: i === active ? '#EEF2FF' : 'transparent',
                        border: 0, borderRadius: '10px', padding: '10px 12px',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap',
                }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: DOC.ink }}>
                    {r.title}
                  </span>
                  {nav && (
                    <span style={{ fontSize: '11.5px', color: DOC.faint, fontWeight: 700 }}>
                      {nav.groupTitle[r.lang] || nav.groupTitle.ar}
                    </span>
                  )}
                  <span style={{
                    marginInlineStart: 'auto', fontSize: '10.5px', fontWeight: 800,
                    color: DOC.faint, background: DOC.subtle, borderRadius: '5px',
                    padding: '1px 6px',
                  }}>
                    {{ title: 'عنوان', heading: 'قسم', description: 'وصف', endpoint: 'مسار', body: 'محتوى' }[r.where]}
                  </span>
                </div>
                {r.heading && (
                  <div style={{ fontSize: '12.5px', color: DOC.brand, fontWeight: 700, marginTop: '3px' }}>
                    ↳ {r.heading.text}
                  </div>
                )}
                <div style={{
                  fontSize: '12.5px', color: DOC.muted, marginTop: '3px',
                  lineHeight: 1.7, overflow: 'hidden', textOverflow: 'ellipsis',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {r.description || r.excerpt.slice(0, 120)}
                </div>
              </button>
            )
          })}
        </div>

        <div style={{
          borderTop: `1px solid ${DOC.border}`, padding: '8px 14px',
          fontSize: '11.5px', color: DOC.faint, display: 'flex', gap: '14px',
        }}>
          <span>↑↓ للتنقّل</span>
          <span>↵ للفتح</span>
          <span style={{ marginInlineStart: 'auto' }}>{index ? `${index.length} صفحة مفهرسة` : '…'}</span>
        </div>
      </div>
    </div>
  )
}

function Hint ({ children }) {
  return (
    <div style={{
      padding: '26px 16px', textAlign: 'center', color: DOC.muted,
      fontSize: '13.5px', fontWeight: 700, lineHeight: 1.8,
    }}>{children}</div>
  )
}
