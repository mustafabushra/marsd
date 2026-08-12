import { useState } from 'react'
import SupportDialog from './SupportDialog'

/**
 * The way in to «الإبلاغ عن مشكلة»: a button that is always on screen.
 *
 * ============================================================================
 * Why it floats rather than sitting in the menu
 * ============================================================================
 * It was a sidebar entry first, which put it in the one place it could not be
 * used. Below 1024px the sidebar is an off-canvas drawer — `translateX(100%)`
 * until the header summons it — so on every phone and most tablets the only
 * route to support was: notice something is broken, find the hamburger, open
 * the menu, scroll it, and tap an entry near the bottom. That is four steps
 * standing between an annoyed person and telling us what went wrong, and it is
 * worst exactly where screens break most.
 *
 * A floating button is on top of the page at every width, so the number of
 * steps is one, and it stays put while the person scrolls to the thing they
 * were about to describe.
 *
 * ============================================================================
 * Where it sits in the stack
 * ============================================================================
 * Deliberately *below* the mobile drawer and its scrim (120 and 119), so an
 * open menu covers it rather than the button hovering over the menu — the same
 * defect the header's bell and avatar already had to be fixed for.
 *
 * The dialog is above both. It used to be z-index 90, under a drawer at 120,
 * which meant opening it from inside the menu put it behind the menu. Nothing
 * caught that because the dialog was only ever opened at desktop width and the
 * window resized afterwards, with the drawer shut the whole time.
 */
export default function SupportLauncher () {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="الإبلاغ عن مشكلة"
        className="marsad-support-fab"
        data-tour="support-fab"
        style={{
          position: 'fixed',
          insetInlineEnd: '22px',
          bottom: '22px',
          zIndex: 85,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '9px',
          padding: '13px 20px',
          borderRadius: '999px',
          border: 0,
          background: '#1E2A52',
          color: '#fff',
          fontSize: '13.5px',
          fontWeight: 800,
          fontFamily: 'inherit',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(15,23,42,.28)',
          transition: 'transform .15s ease, box-shadow .15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 12px 30px rgba(15,23,42,.34)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'none'
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(15,23,42,.28)'
        }}
      >
        <span style={{ fontSize: '16px', lineHeight: 1, flex: 'none' }} aria-hidden="true">🛟</span>
        {/* Hidden on the narrowest screens by index.css, where the pill would
            take a third of the width. The aria-label above carries the name
            either way, so it does not become an unlabelled circle. */}
        <span className="marsad-support-fab-label">الدعم الفني</span>
      </button>

      <SupportDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
