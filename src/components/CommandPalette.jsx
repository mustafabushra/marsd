import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { useUserRole } from '../hooks/useUserRole'
import { useTenantContext } from '../hooks/useTenantContext'
import { commandsFor } from '../lib/commands'
import { fold } from '../lib/extraction/fold.js'

/**
 * Ctrl+K — go anywhere, do anything, without hunting through a menu.
 *
 * ============================================================================
 * The part that is specific to this product
 * ============================================================================
 * Arabic search. Every ready-made palette compares strings exactly, which in
 * Arabic means somebody types a correct word and is told there are no results:
 * «شركه» does not match «شركة», «اعدادات» does not match «إعدادات». The folding
 * built for the extraction engine is reused here, so the hamza and the
 * taa-marbuta stop mattering — which is the difference between a palette people
 * use and one they try twice and abandon.
 *
 * ============================================================================
 * Ranking
 * ============================================================================
 * A prefix beats a contained match, a title beats a keyword, and ties break on
 * the title so the order never shifts between identical searches. Without that
 * last rule the first result moves while somebody is reaching for Enter.
 */

/** How well `q` matches this command. 0 means it does not. */
function score(cmd, q, folded) {
  if (!q) return 1

  const title = folded.title
  if (title === q) return 100
  if (title.startsWith(q)) return 90
  if (title.includes(q)) return 70

  // Keywords are how people search when they do not know the screen's name —
  // «بلاغ» for a report, «من فعل» for the audit log. A keyword hit is a real
  // hit, just a less certain one than the title.
  let best = 0
  for (const k of folded.keywords) {
    if (k === q) best = Math.max(best, 85)
    else if (k.startsWith(q)) best = Math.max(best, 65)
    else if (k.includes(q)) best = Math.max(best, 45)
  }
  if (best) return best

  if (folded.hint.includes(q)) return 30
  return 0
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)

  const navigate = useNavigate()
  const { isSignedIn } = useUser()
  const { isPlatformAdmin } = useUserRole()
  const { tenantId } = useTenantContext()
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const available = useMemo(
    () => commandsFor({ isPlatformAdmin, hasTenant: !!tenantId }),
    [isPlatformAdmin, tenantId],
  )

  // Folded once per command rather than once per keystroke: this runs on every
  // character typed, over every command the person can see.
  const folded = useMemo(() => available.map((c) => ({
    title: fold(c.title),
    hint: fold(c.hint ?? ''),
    keywords: c.keywords.map(fold),
  })), [available])

  const commandHits = useMemo(() => {
    const query = fold(q)
    return available
      .map((c, i) => ({ cmd: c, s: score(c, query, folded[i]) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || a.cmd.title.localeCompare(b.cmd.title, 'ar'))
      .slice(0, 40)
      .map((r) => r.cmd)
  }, [q, available, folded])

  // ---- companies ----------------------------------------------------------
  // The palette has to find companies, not only screens. On the company side
  // the whole job is looking a company up, and a box that offers a menu of
  // pages when you type a company's name is a search box that lied.
  //
  // Debounced and floored at two characters: one character matches most of the
  // registry, and querying on every keystroke to display that is noise paid for
  // twice.
  const [firms, setFirms] = useState([])
  const [firmsLoading, setFirmsLoading] = useState(false)

  // Companies become commands so there is one list, one highlight and one
  // Enter. Two parallel lists would mean two selection states and a keyboard
  // that behaves differently depending on where you happen to be.
  const results = useMemo(() => [
    ...commandHits,
    ...firms.map((f) => ({
      id: `company:${f.id}`,
      title: f.name,
      hint: [f.cr_number, f.city].filter(Boolean).join(' · ') || 'شركة في السجل',
      icon: '🏢',
      category: 'شركات في السجل',
      to: `/trust-report/${f.id}`,
    })),
  ], [commandHits, firms])

  // Grouped for display only — the keyboard moves through `results` in rank
  // order, so what Enter selects is always what is highlighted.
  const groups = useMemo(() => {
    const out = new Map()
    for (const c of results) {
      if (!out.has(c.category)) out.set(c.category, [])
      out.get(c.category).push(c)
    }
    return [...out.entries()]
  }, [results])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setFirms([]); return }

    let alive = true
    setFirmsLoading(true)
    const t = setTimeout(async () => {
      try {
        const { data } = await getSupabase()
          .rpc('search_companies_fts', { search_query: term, limit_val: 6, offset_val: 0 })
        if (alive) setFirms(data ?? [])
      } catch {
        // A failed lookup must not empty the command list. The screens are
        // still there and still the reason the palette opened.
        if (alive) setFirms([])
      } finally {
        if (alive) setFirmsLoading(false)
      }
    }, 220)

    return () => { alive = false; clearTimeout(t) }
  }, [q])

  const run = useCallback((cmd) => {
    setOpen(false)
    setQ('')
    navigate(cmd.to)
  }, [navigate])

  // ---- opening -------------------------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      const combo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'
      if (combo) {
        e.preventDefault()
        setOpen((v) => !v)
        return
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    setActive(0)
    // The input has to be focused after the element exists, not in the same
    // tick that decided to render it.
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => { setActive(0) }, [q])

  // Keep the highlighted row on screen when arrowing past the fold.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!isSignedIn || !open) return null

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[active]) run(results[active])
    }
  }

  let index = -1

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh', paddingInline: '16px',
      }}>
      <div dir="rtl" style={{
        // Wide enough for a full company name and its registration number on
        // one line. At 620 the longer names — «مجموعة ظهران التجارية شركة شخص
        // واحد» — wrapped or clipped, which is the row people are here to read.
        width: '100%', maxWidth: '720px', background: '#fff',
        borderRadius: '16px', boxShadow: '0 24px 60px rgba(15,23,42,.28)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        maxHeight: '70vh',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '13px', padding: '18px 22px', borderBottom: '1px solid #F1F5F9' }}>
          <span style={{ fontSize: '18px' }}>🔍</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="ابحث عن شركة، أو نفّذ أمراً…"
            style={{ flex: 1, border: 0, outline: 'none', fontSize: '16.5px', fontFamily: 'inherit', background: 'transparent', color: '#0F172A' }}
          />
          <kbd style={{ background: '#F1F5F9', color: '#64748B', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 800, direction: 'ltr' }}>
            Esc
          </kbd>
        </div>

        <div ref={listRef} style={{ overflowY: 'auto', padding: '8px' }}>
          {results.length === 0 && (
            <div style={{ padding: '32px 18px', textAlign: 'center', color: '#64748B', fontSize: '13.5px', lineHeight: 1.9 }}>
              {firmsLoading ? 'يبحث…' : `لا شيء يطابق «${q}».`}
              <br />
              <span style={{ fontSize: '12.5px', color: '#94A3B8' }}>
                جرّب: شركة · تقرير · اشتراك · سجل
              </span>
            </div>
          )}

          {groups.map(([category, items]) => (
            <div key={category} style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#94A3B8', padding: '8px 12px 5px' }}>
                {category}
              </div>
              {items.map((cmd) => {
                index++
                const on = index === active
                const myIndex = index
                return (
                  <button
                    key={cmd.id}
                    data-active={on}
                    onMouseEnter={() => setActive(myIndex)}
                    onClick={() => run(cmd)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
                      textAlign: 'start', border: 0, borderRadius: '10px',
                      padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit',
                      background: on ? '#EEF2FF' : 'transparent',
                    }}>
                    <span style={{ fontSize: '17px', flex: 'none' }}>{cmd.icon}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>
                        {cmd.title}
                      </span>
                      {cmd.hint && (
                        <span style={{ display: 'block', fontSize: '12px', color: '#64748B', marginTop: '1px' }}>
                          {cmd.hint}
                        </span>
                      )}
                    </span>
                    {on && (
                      <kbd style={{ background: '#fff', border: '1px solid #E2E8F0', color: '#64748B', borderRadius: '5px', padding: '2px 7px', fontSize: '10.5px', fontWeight: 800, direction: 'ltr', flex: 'none' }}>
                        ↵
                      </kbd>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #F1F5F9', padding: '9px 16px', display: 'flex', gap: '16px', fontSize: '11.5px', color: '#94A3B8', fontWeight: 700 }}>
          <span><span style={{ direction: 'ltr', display: 'inline-block' }}>↑↓</span> تنقّل</span>
          <span><span style={{ direction: 'ltr', display: 'inline-block' }}>↵</span> فتح</span>
          <span style={{ marginInlineStart: 'auto', direction: 'ltr' }}>Ctrl + K</span>
        </div>
      </div>
    </div>
  )
}
