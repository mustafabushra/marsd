import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabase } from '../lib/api'

/**
 * Keep a screen's data current by re-reading it when the database changes.
 *
 * The screens already know how to load themselves. Rather than teaching each
 * one to apply an insert, an update and a delete to its own shape — three more
 * code paths per screen, each able to drift from the query that produced the
 * original — a change event simply triggers the existing load. What arrives is
 * always what a fresh page would have shown, which is the property that matters
 * and the one incremental patching quietly loses.
 *
 * Reloading costs a query per burst, not per event: events are coalesced over a
 * short window, so approving twenty reports refreshes once rather than twenty
 * times.
 *
 * Row-level security applies to the stream exactly as to a query, so a listener
 * is told only about rows it could have read. The filter below narrows further —
 * a company dashboard has no use for another tenant's traffic even though it
 * would never receive it.
 */
export function useLiveData(load, { tables = [], filter = null, enabled = true, debounceMs = 400 } = {}) {
  const [liveAt, setLiveAt] = useState(null)
  const [connected, setConnected] = useState(false)
  const loadRef = useRef(load)
  const timerRef = useRef(null)

  // The caller's load function is usually redefined every render; capturing it
  // in a ref keeps the subscription from being torn down and rebuilt each time.
  useEffect(() => { loadRef.current = load })

  const scheduleReload = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      try {
        await loadRef.current?.()
        setLiveAt(new Date())
      } catch (err) {
        console.error('Live reload failed:', err)
      }
    }, debounceMs)
  }, [debounceMs])

  useEffect(() => {
    if (!enabled || tables.length === 0) return

    const supabase = getSupabase()
    const channel = supabase.channel(`live:${tables.join('-')}:${filter || 'all'}`)

    for (const table of tables) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        scheduleReload,
      )
    }

    channel.subscribe((status) => {
      setConnected(status === 'SUBSCRIBED')
      // A reconnect means events were missed while the socket was down, so the
      // screen is re-read rather than trusted to have kept up.
      if (status === 'SUBSCRIBED') scheduleReload()
    })

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      supabase.removeChannel(channel)
    }
    // tables is a literal at every call site; joining it keeps a new array
    // identity each render from rebuilding the channel.
  }, [enabled, tables.join(','), filter, scheduleReload])

  return { connected, liveAt }
}

// The indicator that pairs with this hook lives in components/LiveBadge.jsx.
// It is markup, and markup in a .js file does not build.
