import { useCallback, useEffect, useState } from 'react'
import { useUser } from '@clerk/react'
import { getSupabase } from '../lib/api'

/**
 * The signed-in user's role, from public.users — the only place that decides it.
 *
 * There were two switches for the same permission, set by hand in different
 * places: the admin routes checked Clerk's publicMetadata.role === 'admin',
 * while the database policies check users.role === 'platform_admin'. Setting one
 * and forgetting the other gives you an operator who can open the admin panel
 * and save nothing, or one who can write to the database and cannot see the
 * screens. Only the database enforces anything, so the database is what this
 * reads, and Clerk metadata is no longer consulted.
 *
 * The previous version fell back to 'owner' — a role that does not exist in the
 * schema — whenever the query failed, on the reasoning that it eased local
 * development. That is a permission check that grants permission when it cannot
 * tell: with RLS enabled a denied read is exactly the case it would hit. A role
 * that cannot be established is now null, and null grants nothing.
 */

export const ROLES = {
  PLATFORM_ADMIN: 'platform_admin',
  COMPANY_ADMIN: 'company_admin',
  COMPANY_MEMBER: 'company_member',
  REVIEWER: 'reviewer',
}

export function useUserRole() {
  const { isLoaded, user } = useUser()
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!user?.id) {
      setRole(null)
      setLoading(false)
      return
    }
    try {
      const { data, error: dbError } = await getSupabase()
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (dbError) throw dbError

      setRole(data?.role || null)
      setError(null)
    } catch (err) {
      console.error('Failed to resolve user role:', err)
      setError(err.message)
      setRole(null)   // unknown is not privileged
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (!isLoaded) return
    load()
  }, [isLoaded, load])

  // A platform administrator runs Marsad. Company administration is a
  // superset relationship, not a separate ladder: whoever may act on the
  // platform may act within a company on it, which is what lets one account
  // hold both jobs while the roles stay distinct.
  const isPlatformAdmin = role === ROLES.PLATFORM_ADMIN
  const isCompanyAdmin = isPlatformAdmin || role === ROLES.COMPANY_ADMIN

  return { role, loading, error, isPlatformAdmin, isCompanyAdmin, refresh: load }
}
