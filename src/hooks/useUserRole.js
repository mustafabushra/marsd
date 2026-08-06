import { useUserRecord } from './useUserRecord'

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
 * An earlier version fell back to 'owner' — a role that does not exist in the
 * schema — whenever the query failed, on the reasoning that it eased local
 * development. That is a permission check that grants permission when it cannot
 * tell: with RLS enabled a denied read is exactly the case it would hit. A role
 * that cannot be established is null, and null grants nothing.
 *
 * ============================================================================
 * Why this is now a thin wrapper
 * ============================================================================
 * It ran its own `select role from users where id = …`, and useCompanyOnboarding
 * ran `select tenant_id` against the same row as a second round trip, with its
 * own loading gate. On login the two queued behind one another and each blanked
 * the screen in turn — the wait after signing in was four fast requests in a
 * line, not one slow one.
 *
 * useUserRecord fetches both columns once and shares the result. The shape
 * returned here is unchanged, so nothing that reads a role had to change.
 */

export const ROLES = {
  PLATFORM_ADMIN: 'platform_admin',
  COMPANY_ADMIN: 'company_admin',
  COMPANY_MEMBER: 'company_member',
  REVIEWER: 'reviewer',
}

export function useUserRole() {
  const { role, loading, error, refresh } = useUserRecord()

  // A platform administrator runs Marsad. Company administration is a superset
  // relationship, not a separate ladder: whoever may act on the platform may act
  // within a company on it, which is what lets one account hold both jobs while
  // the roles stay distinct.
  const isPlatformAdmin = role === ROLES.PLATFORM_ADMIN
  const isCompanyAdmin = isPlatformAdmin || role === ROLES.COMPANY_ADMIN

  return { role, loading, error, isPlatformAdmin, isCompanyAdmin, refresh }
}
