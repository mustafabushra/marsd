import { useEffect, useState } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

export function useCompanyOnboarding() {
  const { user, isLoaded } = useUser()
  const [tenantId, setTenantId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  useEffect(() => {
    async function checkTenant() {
      if (!isLoaded || !user) {
        setLoading(false)
        return
      }

      try {
        const supabase = getSupabase()

        // Check if user has a tenant
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', user.id)
          .single()

        if (userError || !userData?.tenant_id) {
          // User doesn't have a tenant - needs onboarding
          setNeedsOnboarding(true)
          setLoading(false)
          return
        }

        // User has a tenant
        setTenantId(userData.tenant_id)
        setNeedsOnboarding(false)
      } catch (err) {
        console.error('Error checking tenant:', err)
        setNeedsOnboarding(true)
      } finally {
        setLoading(false)
      }
    }

    checkTenant()
  }, [user, isLoaded])

  return {
    tenantId,
    loading,
    needsOnboarding
  }
}
