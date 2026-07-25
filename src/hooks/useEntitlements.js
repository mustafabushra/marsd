import { useCallback, useEffect, useState } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'
import { allows, can, limitOf, loadEntitlements, remaining } from '../lib/entitlements'

/**
 * The tenant's entitlements, bound to the signed-in user.
 *
 * Pages ask this and nothing else. The helpers are returned already bound to the
 * resolved entitlements so a caller writes `can('compare')` rather than
 * threading the object through every check and risking one that reads a stale
 * copy.
 *
 * `refresh` exists because spending changes the answer: after an action that
 * consumes a search or earns points, the page re-reads instead of showing a
 * remaining count that is one behind.
 */
export function useEntitlements() {
  const { isLoaded, user } = useUser()
  const [entitlements, setEntitlements] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user?.id) {
      setEntitlements(null)
      setLoading(false)
      return
    }
    try {
      const supabase = getSupabase()
      const { data } = await supabase.from('users').select('tenant_id').eq('id', user.id).maybeSingle()
      setEntitlements(await loadEntitlements(data?.tenant_id))
    } catch {
      setEntitlements(await loadEntitlements(null))
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (!isLoaded) return
    load()
  }, [isLoaded, load])

  return {
    entitlements,
    loading,
    refresh: load,
    can: (feature) => can(entitlements, feature),
    limitOf: (key) => limitOf(entitlements, key),
    remaining: (key) => remaining(entitlements, key),
    allows: (key, count) => allows(entitlements, key, count),
    plan: entitlements?.plan || null,
    credits: entitlements?.credits || 0,
    giveToGetEnabled: !!entitlements?.giveToGetEnabled,
    degraded: !!entitlements?.degraded,
  }
}
