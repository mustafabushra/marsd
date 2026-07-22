import { useEffect, useState } from 'react'
import { useOrganization, useUser } from '@clerk/react'
import { supabase } from '../lib/supabase'
import { syncClerkOrgToSupabase, getUserTenantContext } from '../lib/clerkOrganizations'

/**
 * Hook to get and sync tenant context from Clerk organization
 * Automatically syncs Clerk org data to Supabase tenants table
 */
export function useTenantContext() {
  const { organization, isLoaded: isOrgLoaded } = useOrganization()
  const { user, isLoaded: isUserLoaded } = useUser()
  const [tenantContext, setTenantContext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function initTenantContext() {
      if (!isOrgLoaded || !isUserLoaded) return

      try {
        setLoading(true)
        setError(null)

        if (!user || !organization) {
          setTenantContext(null)
          setLoading(false)
          return
        }

        // Sync Clerk org to Supabase
        try {
          await syncClerkOrgToSupabase(supabase, organization)
        } catch (syncError) {
          console.warn('Failed to sync org to Supabase:', syncError)
          // Don't fail completely if sync fails - tenant context still works
        }

        // Build tenant context
        const context = getUserTenantContext(organization, user)
        setTenantContext(context)
      } catch (err) {
        console.error('Failed to initialize tenant context:', err)
        setError(err)
      } finally {
        setLoading(false)
      }
    }

    initTenantContext()
  }, [organization, user, isOrgLoaded, isUserLoaded])

  return {
    tenantContext,
    tenantId: tenantContext?.tenantId,
    tenantName: tenantContext?.tenantName,
    isAdmin: tenantContext?.isAdmin,
    loading,
    error,
    isReady: !loading && !error && tenantContext,
  }
}
