import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { STEPS } from './steps'

/**
 * The guided tour.
 *
 * ============================================================================
 * Written rather than installed
 * ============================================================================
 * The tour libraries all position their tooltip from the left edge and treat
 * RTL as a text-direction switch, which puts the arrow on the wrong side of the
 * element and the buttons in the wrong order. This whole component is smaller
 * than the CSS it would take to fight one, and it lets «التالي» sit where a
 * reader of Arabic expects it.
 *
 * ============================================================================
 * A step whose element is missing is skipped, not fatal
 * ============================================================================
 * Most anchors are conditional — nav entries hidden from staff without a
 * company, an action disabled without the entitlement. So the step list is
 * filtered against the DOM when the tour opens, and again whenever the layout
 * changes underneath it. The count the reader sees is the count of steps they
 * will actually get.
 *
 * ============================================================================
 * The highlight is a hole, not a border
 * ============================================================================
 * Four dimmed panels are drawn around the target rather than one overlay with a
 * ring on top. That way the element is genuinely uncovered — it keeps its own
 * colours, and nothing sits between it and the eye — and the dimming still
 * closes the tour when clicked.
 */

const PAD = 6
const GAP = 12
const TIP_W = 340

export default function Tour ({ open, onFinish, onSkip }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)
  const [tip, setTip] = useState(null)
  const [vw, setVw] = useState(() => (typeof window === 'undefined' ? 1200 : window.innerWidth))
  const tipRef = useRef(null)

  // Only the steps whose element is actually on this screen.
  const steps = useMemo(() => {
    if (!open || typeof document === 'undefined') return []
    return STEPS.filter((s) => {
      const el = document.querySelector(s.target)
      if (!el) return false
      const r = el.getBoundingClientRect()
      // Present but collapsed — a drawer that is shut, a hidden nav on mobile.
      return r.width > 0 && r.height > 0
    })
    // `vw` is not unused: below 1024px the sidebar becomes a closed drawer and
    // every nav anchor inside it measures zero, so the visible list genuinely
    // differs by width and has to be recomputed when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vw])

  const step = steps[i]
  const isNarrow = vw < 760

  useEffect(() => { if (open) setI(0) }, [open])

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /** Bring the target into view, then measure it. */
  useLayoutEffect(() => {
    if (!open || !step) return
    const el = document.querySelector(step.target)
    if (!el) return

    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })

    let raf = 0
    const measure = () => setRect(el.getBoundingClientRect())
    // The scroll is animated; measuring once catches it mid-flight and the
    // highlight lands where the element used to be.
    const t = setTimeout(() => { measure(); raf = requestAnimationFrame(measure) }, 320)
    measure()

    return () => { clearTimeout(t); cancelAnimationFrame(raf) }
  }, [open, step, vw])

  /** Place the tooltip once its own size is known. */
  useLayoutEffect(() => {
    if (!rect || !step) return
    const h = tipRef.current?.offsetHeight || 190
    const w = Math.min(TIP_W, vw - 24)

    if (isNarrow) {
      // One column of screen. The card sits at the bottom, out of the way of
      // whatever is being pointed at.
      setTip({ top: window.innerHeight - h - 16, left: (vw - w) / 2, w, arrow: null })
      return
    }

    let top
    let arrow = step.placement
    if (step.placement === 'top') top = rect.top - h - GAP
    else if (step.placement === 'bottom') top = rect.bottom + GAP
    else top = rect.top + rect.height / 2 - h / 2

    // `start` means beside the element on the reading side. In RTL the reading
    // side is the right, so the card goes to its left.
    let left
    if (step.placement === 'start') left = rect.left - w - GAP
    else left = rect.left + rect.width / 2 - w / 2

    // Never off-screen; the card matters more than the arrow lining up.
    if (left < 12) { left = 12; arrow = null }
    if (left + w > vw - 12) { left = vw - w - 12; arrow = null }
    if (top < 12) { top = rect.bottom + GAP; arrow = 'bottom' }
    if (top + h > window.innerHeight - 12) { top = Math.max(12, rect.top - h - GAP); arrow = 'top' }

    setTip({ top, left, w, arrow })
  }, [rect, step, vw, isNarrow])

  const next = useCallback(() => {
    if (i < steps.length - 1) setI(i + 1)
    else onFinish()
  }, [i, steps.length, onFinish])

  const prev = useCallback(() => setI((n) => Math.max(0, n - 1)), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onSkip()
      // In RTL the right arrow moves backwards, the way the text does.
      if (e.key === 'ArrowLeft') next()
      if (e.key === 'ArrowRight') prev()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, next, prev, onSkip])

  if (!open) return null

  // Nothing to point at — an account with none of these screens. Saying so is
  // better than an empty overlay the reader has to dismiss.
  if (!steps.length) {
    return (
      <div role="dialog" aria-modal="true" aria-label="جولة تعريفية"
        style={{ ...overlayBase, background: 'rgba(15,23,42,.55)', display: 'flex',
                 alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ ...card, maxWidth: '380px', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A', marginBottom: '8px' }}>
            لا يوجد ما نعرضه بعد
          </div>
          <p style={{ fontSize: '13.5px', color: '#64748B', margin: '0 0 16px', lineHeight: 1.9 }}>
            ستظهر الجولة حين تكتمل شاشات حسابك.
          </p>
          <button onClick={onSkip} style={primaryBtn}>حسناً</button>
        </div>
      </div>
    )
  }

  const last = i === steps.length - 1

  return (
    <div role="dialog" aria-modal="true" aria-label="جولة تعريفية في مرصد" dir="rtl">
      {/* The dim, as four panels leaving the target uncovered. */}
      {rect && [
        { top: 0, left: 0, width: '100%', height: Math.max(0, rect.top - PAD) },
        { top: Math.max(0, rect.bottom + PAD), left: 0, width: '100%', height: `calc(100% - ${rect.bottom + PAD}px)` },
        { top: Math.max(0, rect.top - PAD), left: 0, width: Math.max(0, rect.left - PAD), height: rect.height + PAD * 2 },
        { top: Math.max(0, rect.top - PAD), left: rect.right + PAD, width: `calc(100% - ${rect.right + PAD}px)`, height: rect.height + PAD * 2 },
      ].map((s, n) => (
        <div key={n} onClick={onSkip} style={{ ...overlayBase, ...s, background: 'rgba(15,23,42,.55)' }} />
      ))}

      {/* The ring around the uncovered element. */}
      {rect && (
        <div aria-hidden="true" style={{
          position: 'fixed', zIndex: 201, pointerEvents: 'none',
          top: rect.top - PAD, left: rect.left - PAD,
          width: rect.width + PAD * 2, height: rect.height + PAD * 2,
          border: '2.5px solid #16A34A', borderRadius: '12px',
          boxShadow: '0 0 0 4px rgba(22,163,74,.18)',
          transition: 'all .22s cubic-bezier(.4,0,.2,1)',
        }} />
      )}

      {/* The card. */}
      {tip && (
        <div ref={tipRef} style={{
          position: 'fixed', zIndex: 202, top: tip.top, left: tip.left, width: tip.w,
          ...card, transition: 'top .22s ease, left .22s ease',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', marginBottom: '7px' }}>
            <h2 style={{ fontSize: '15.5px', fontWeight: 900, color: '#0F172A', margin: 0 }}>
              {step.title}
            </h2>
            <span style={{ fontSize: '11.5px', color: '#94A3B8', fontWeight: 800, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {i + 1} / {steps.length}
            </span>
          </div>

          <p style={{ fontSize: '13.5px', color: '#475569', margin: '0 0 16px', lineHeight: 1.95 }}>
            {step.body}
          </p>

          {/* Progress, as a row of marks rather than a bar — eleven steps is a
              number worth seeing the shape of. */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '14px' }} aria-hidden="true">
            {steps.map((s, n) => (
              <span key={s.id} style={{
                height: '3px', flex: 1, borderRadius: '2px',
                background: n <= i ? '#16A34A' : '#E2E8F0', transition: 'background .2s',
              }} />
            ))}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={next} style={primaryBtn}>
              {last ? 'إنهاء' : 'التالي'}
            </button>
            {i > 0 && (
              <button onClick={prev} style={ghostBtn}>السابق</button>
            )}
            <button onClick={onSkip} style={{ ...ghostBtn, border: 0, color: '#94A3B8', marginInlineStart: 'auto' }}>
              تخطّي
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const overlayBase = { position: 'fixed', zIndex: 200 }

const card = {
  background: '#fff', borderRadius: '14px', padding: '18px',
  boxShadow: '0 18px 50px rgba(15,23,42,.28)', boxSizing: 'border-box',
}

const primaryBtn = {
  padding: '9px 20px', borderRadius: '9px', border: 0, background: '#16A34A',
  color: '#fff', fontSize: '13px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
}

const ghostBtn = {
  padding: '9px 16px', borderRadius: '9px', border: '1.5px solid #E2E8F0',
  background: '#fff', color: '#1E2A52', fontSize: '13px', fontWeight: 800,
  cursor: 'pointer', fontFamily: 'inherit',
}
