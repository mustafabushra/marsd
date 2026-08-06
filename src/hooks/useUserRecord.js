import { useState, useEffect, useCallback } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

/**
 * One read of the signed-in user's row, shared by everything that needs it.
 *
 * ============================================================================
 * Why this exists
 * ============================================================================
 * Signing in used to run a waterfall before the dashboard could paint:
 *
 *   1. Clerk answers                       (network)
 *   2. useUserRole        → select role       from users where id = …
 *   3. useCompanyOnboarding → select tenant_id from users where id = …
 *   4. useEntitlements    → rpc my_entitlements
 *
 * Steps 2 and 3 read *the same row of the same table* as two separate round
 * trips, one after the other, each with its own loading gate rendering its own
 * placeholder. Three placeholders in sequence is what the wait after login
 * actually was — not one slow query, but four fast ones queued behind each
 * other, each blanking the screen in turn.
 *
 * Both columns come back in one request now. The gates that used to wait
 * separately wait once, together.
 *
 * ============================================================================
 * The cache
 * ============================================================================
 * Module-level and keyed by user id, because this row is read by three
 * different components mounted at three different depths, and without it they
 * would each issue the request again. It is cleared when the id changes, which
 * covers signing out and signing in as somebody else.
 */

let cache = { id: null, row: null, promise: null }

/** Dropped on sign-out so the next account never sees the last one's row. */
export function clearUserRecordCache() {
  cache = { id: null, row: null, promise: null }
}

async function fetchRecord(id) {
  const { data, error } = await getSupabase()
    .from('users')
    .select('role, tenant_id')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ?? {}
}

export function useUserRecord() {
  const { user, isLoaded } = useUser()
  const id = user?.id

  const [row, setRow] = useState(() => (cache.id === id ? cache.row : null))
  const [loading, setLoading] = useState(() => !(cache.id === id && cache.row))
  const [error, setError] = useState(null)

  const load = useCallback(async (force = false) => {
    if (!id) { setRow(null); setLoading(false); return }

    if (!force && cache.id === id && cache.row) {
      setRow(cache.row); setLoading(false); return
    }

    // A request already in flight is joined rather than duplicated: three
    // components mount within the same tick and would otherwise each start one.
    if (!force && cache.id === id && cache.promise) {
      try { setRow(await cache.promise) } catch (e) { setError(e.message) }
      finally { setLoading(false) }
      return
    }

    cache = { id, row: null, promise: fetchRecord(id) }
    try {
      const data = await cache.promise
      cache.row = data
      setRow(data)
      setError(null)
    } catch (e) {
      cache = { id: null, row: null, promise: null }
      setError(e.message)
      setRow(null)          // unknown is not privileged
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (!isLoaded) return
    load()
  }, [isLoaded, load])

  return {
    row,
    role: row?.role ?? null,
    tenantId: row?.tenant_id ?? null,
    loading: !isLoaded || loading,
    error,
    refresh: () => load(true),
  }
}
