import { useCallback, useState } from 'react'
import { TOUR_VERSION } from './steps'

/**
 * Whether this person has already been shown the tour.
 *
 * ============================================================================
 * Why localStorage and not the database
 * ============================================================================
 * «Have I seen this» is a property of a person at a browser, and it is not
 * worth a row, a policy and a round trip. Nothing depends on it being true
 * across devices: seeing a short tour a second time on a new laptop is a
 * smaller cost than a table nobody maintains. If it ever needs to follow the
 * account, this is the one place that changes.
 *
 * The key carries a version. When the tour is rewritten — new steps, renamed
 * screens — bumping TOUR_VERSION makes it eligible again for everyone rather
 * than leaving them with a description of a product that has moved on.
 *
 * Both «finished» and «skipped» stop it from opening by itself. Skipping is an
 * answer, and asking again is how a helpful thing becomes an irritating one.
 * Neither stops the button.
 */

const key = () => `marsad.tour.${TOUR_VERSION}`

/** Storage can throw — private mode, disabled cookies. It is never fatal here. */
function read () {
  try { return window.localStorage.getItem(key()) } catch { return null }
}

function write (value) {
  try { window.localStorage.setItem(key(), value) } catch { /* nothing to do */ }
}

export function useTourState () {
  const [status, setStatus] = useState(() => read())

  const finish = useCallback(() => { write('finished'); setStatus('finished') }, [])
  const skip = useCallback(() => { write('skipped'); setStatus('skipped') }, [])
  const reset = useCallback(() => {
    try { window.localStorage.removeItem(key()) } catch { /* nothing to do */ }
    setStatus(null)
  }, [])

  return {
    // Never seen it, on this browser, in this version.
    isFirstVisit: status === null,
    status,
    finish,
    skip,
    reset,
  }
}
