import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Tour from './Tour'
import { useTourState } from './useTourState'

/**
 * «جولة تعريفية» — the button, and the decision to open by itself.
 *
 * ============================================================================
 * When it starts on its own
 * ============================================================================
 * On /dashboard, once, and only for somebody who has neither finished nor
 * skipped it. Not on the landing page, not on a company report somebody
 * followed a link to, and not on the middle of a form: an unexpected overlay is
 * an interruption, and it is only welcome where the reader has just arrived
 * somewhere with no particular task in hand. The dashboard is that place.
 *
 * There is a short delay before it opens. The dashboard fetches its own numbers
 * and the sidebar decides which entries this account may see; starting before
 * that settles points the highlight at elements that are about to move, and at
 * a couple that are about to appear.
 *
 * ============================================================================
 * The button never goes away
 * ============================================================================
 * Finishing or skipping stops it from opening by itself and nothing more. The
 * button is always there, and pressing it always starts from the first step —
 * so «what was that screen again» has an answer that is not the support form.
 */
export default function TourLauncher () {
  const [open, setOpen] = useState(false)
  const { isFirstVisit, finish, skip } = useTourState()
  const { pathname } = useLocation()

  const onDashboard = pathname === '/dashboard'

  useEffect(() => {
    if (!onDashboard || !isFirstVisit || open) return

    // Wait for the screen, not for a guess at how long it takes.
    //
    // This opened on a fixed 1.4s timer, and the dashboard fetches its numbers
    // before it draws them — so the tour computed its step list against a page
    // that was still filling in, found seven of eleven anchors, and dropped the
    // greeting and the KPI row. Silently: a step whose element is missing is
    // meant to be skipped, and this looked exactly like that. The two most
    // important steps were the ones most likely to be missing, because they are
    // the ones that depend on data.
    //
    // The list is deliberately computed once, when the tour opens, so that the
    // step numbers cannot shift under a reader who is part-way through. That
    // makes *when* it opens the thing that has to be right.
    let cancelled = false
    const started = Date.now()

    const ready = () => document.querySelector('[data-tour="dash-kpis"]')
      && document.querySelector('[data-tour="dash-greeting"]')

    const check = () => {
      if (cancelled) return
      // Give up waiting after a few seconds and run with whatever is there —
      // a slow query should delay the tour, not cancel it.
      if (ready() || Date.now() - started > 8000) {
        // A breath after the last element lands, so nothing is mid-layout.
        setTimeout(() => { if (!cancelled) setOpen(true) }, 500)
        return
      }
      setTimeout(check, 250)
    }

    const t = setTimeout(check, 900)
    return () => { cancelled = true; clearTimeout(t) }
    // Deliberately not depending on `open`: this decides once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDashboard, isFirstVisit])

  return (
    <>
      <button
        type="button"
        data-tour-launcher=""
        onClick={() => setOpen(true)}
        title="جولة تعريفية في مرصد"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '7px',
          padding: '8px 14px', borderRadius: '9px',
          border: '1.5px solid #E2E8F0', background: '#fff', color: '#1E2A52',
          fontSize: '13px', fontWeight: 800, cursor: 'pointer',
          fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F8FAFC' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
      >
        <span aria-hidden="true">🧭</span>
        <span className="marsad-tour-label">جولة تعريفية</span>
      </button>

      <Tour
        open={open}
        onFinish={() => { setOpen(false); finish() }}
        onSkip={() => { setOpen(false); skip() }}
      />
    </>
  )
}
