import { useUser } from '@clerk/react'
import { useUserRecord } from './useUserRecord'
import { useUserRole } from './useUserRole'

/**
 * Which company this account belongs to, from the table that decides it.
 *
 * ============================================================================
 * What was wrong, and why it was wrong at the root
 * ============================================================================
 * This treated a Clerk organization as the tenant. On every load it wrote the
 * Clerk org into `tenants`, using the org id as the primary key:
 *
 *     id: clerkOrg.id            // "org_3GulxFGLNd2AEqh5KXrDAdT0WTk"
 *
 * `tenants.id` is a uuid, and the table has no column for a Clerk org id and
 * never has. So the write could not succeed under any circumstances — it threw
 * 22P02 on every page load since the day it was written, caught by a
 * `console.warn` that let the app carry on.
 *
 * The noise was the smaller half. `getUserTenantContext` then returned
 * `tenantId: organization?.id` — so this hook's `tenantId` was a Clerk org id
 * while `users.tenant_id`, the uuid every policy and every screen reads, is
 * something else entirely. Two different values under one name. Nothing looked
 * broken only because its one consumer, the command palette, uses it as a
 * yes/no.
 *
 * A tenant on Marsad is a row created by registration and by an approved
 * ownership claim — decide_claim_request builds one from the company's own
 * fields. It is not a Clerk organization, and syncing one into the other was
 * trying to make Clerk the source of truth for something the database already
 * owns.
 *
 * So this reads users.tenant_id, through useUserRecord — which fetches that row
 * once and shares it, so asking here costs nothing. Clerk still answers who the
 * person is; the database answers which company they belong to.
 */
export function useTenantContext() {
  const { user, isLoaded } = useUser()
  const { tenantId, loading, error } = useUserRecord()
  const { role, isPlatformAdmin } = useUserRole()

  const tenantContext = tenantId
    ? {
        tenantId,
        userId: user?.id,
        userEmail: user?.primaryEmailAddress?.emailAddress,
        userRole: role,
        isAdmin: isPlatformAdmin || role === 'company_admin',
      }
    : null

  return {
    tenantContext,
    tenantId: tenantContext?.tenantId ?? null,
    // The name lives on the company, not here. Screens that show it read it
    // from the company record they are already displaying rather than being
    // handed a second copy that can go stale.
    tenantName: null,
    isAdmin: tenantContext?.isAdmin ?? false,
    loading: !isLoaded || loading,
    error,
    isReady: isLoaded && !loading && !error && !!tenantContext,
  }
}
