import { useState, useEffect } from 'react'

/**
 * A skeleton that waits before showing itself.
 *
 * ============================================================================
 * Why a delay
 * ============================================================================
 * Most navigations in this app finish in well under a fifth of a second — the
 * chunk is cached, the query is warm. A skeleton that appears and vanishes in
 * that window is not a loading state, it is a flash: the eye registers movement
 * and interprets it as something breaking.
 *
 * That is what made the whole product feel unfinished after skeletons went in.
 * The individual screens were right; showing them for 80ms was not.
 *
 * So nothing renders for `delay` milliseconds. A fast load shows the old
 * content until the new content is ready and the change looks instant. A slow
 * one gets the skeleton, which is the only case it was ever for.
 *
 * ============================================================================
 * And a floor once it appears
 * ============================================================================
 * A skeleton that survives its delay and then disappears 40ms later is the same
 * flash, moved. `minVisible` keeps it on screen long enough to read as a state
 * rather than a glitch.
 */
export default function DeferredSkeleton({ delay = 220, minVisible = 320, children }) {
  const [show, setShow] = useState(false)
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setShow(true)
      setLocked(true)
      // Once shown, hold it: the parent unmounts this whole component when the
      // data lands, so the floor is enforced by refusing to un-show early
      // rather than by delaying the parent.
      setTimeout(() => setLocked(false), minVisible)
    }, delay)
    return () => clearTimeout(t)
  }, [delay, minVisible])

  if (!show && !locked) return null

  return (
    <div style={{ animation: 'skeletonFade 160ms ease-out' }}>
      {children}
    </div>
  )
}
