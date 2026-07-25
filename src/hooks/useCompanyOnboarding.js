import { useEffect, useState } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

/**
 * Does this user still need to complete company onboarding?
 *
 * "The query failed" and "the user has no tenant" are different answers, and
 * conflating them sent people with a perfectly good company off to onboarding —
 * or into a redirect loop — whenever a request merely hiccuped. Only a row that
 * actually came back without a tenant_id counts as needing onboarding; a
 * failure is reported as `error` and leaves needsOnboarding false.
 */
export function useCompanyOnboarding() {
  const { user, isLoaded } = useUser()
  const [tenantId, setTenantId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function checkTenant() {
      if (!isLoaded || !user) {
        if (!cancelled) setLoading(false)
        return
      }

      try {
        const supabase = getSupabase()

        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', user.id)
          .single()

        if (cancelled) return

        // PGRST116 is "no row" — a real answer: this user has no record yet.
        if (userError && userError.code !== 'PGRST116') throw userError

        setError(null)
        setTenantId(userData?.tenant_id || null)
        setNeedsOnboarding(!userData?.tenant_id)
      } catch (err) {
        if (cancelled) return
        console.error('Error checking tenant:', err)
        setError(err.message || 'تعذّر التحقق من بيانات الشركة')
        setNeedsOnboarding(false)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    checkTenant()
    return () => { cancelled = true }
  }, [user, isLoaded])

  return {
    tenantId,
    loading,
    needsOnboarding,
    error,
  }
}
