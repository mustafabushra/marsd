import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * The side navigation, as a drawer on small screens.
 *
 * On a desktop the sidebar is simply part of the page and this state is never
 * used. Below 1024px the stylesheet turns the same element into an overlay, and
 * an overlay owes the reader three things a static column does not:
 *
 *   it closes when you arrive somewhere — otherwise tapping a link leaves the
 *   drawer sitting on top of the page you asked for;
 *
 *   it closes on Escape — the scrim is reachable with a finger but not with a
 *   keyboard, and a drawer with no keyboard exit is a trap;
 *
 *   it stops the page behind it from scrolling — dragging over a full-screen
 *   overlay otherwise moves the article underneath, and closing the drawer
 *   returns the reader somewhere they never chose to go.
 *
 * Both shells need all three, so they share this rather than each keeping its
 * own copy of the rules.
 */
export function useNavDrawer() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => { setOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!open) return undefined

    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)

    // Restore whatever was there, not a hardcoded default: a page that had set
    // its own overflow would otherwise lose it the first time the drawer opened.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open])

  return [open, setOpen]
}
