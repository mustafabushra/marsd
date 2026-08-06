import { useUser } from '@clerk/react'
import { useUserRecord } from './useUserRecord'

/**
 * Does this user still need to complete company onboarding?
 *
 * "The query failed" and "the user has no tenant" are different answers, and
 * conflating them sent people with a perfectly good company off to onboarding —
 * or into a redirect loop — whenever a request merely hiccuped. Only a row that
 * actually came back without a tenant_id counts as needing onboarding; a
 * failure is reported as `error` and leaves needsOnboarding false.
 *
 * ============================================================================
 * Why this reads a shared record now
 * ============================================================================
 * It ran `select tenant_id from users where id = …`, and useUserRole ran
 * `select role` against the same row of the same table as a separate request.
 * Both mount on every protected screen, so every navigation paid for two round
 * trips to fetch two columns — and on login they queued, each with its own
 * loading gate blanking the screen in turn.
 *
 * useUserRecord fetches both in one request and shares it. The distinction that
 * matters here is preserved exactly: `needsOnboarding` is true only when a row
 * came back and its tenant_id was empty, never when the read failed.
 */
export function useCompanyOnboarding() {
  const { user, isLoaded } = useUser()
  const { row, tenantId, loading, error } = useUserRecord()

  // A row that arrived and carried no tenant. `row` is null both before the
  // request resolves and after it fails, and neither of those is an answer —
  // which is the whole distinction this hook was written to keep.
  const answered = !loading && !error && row !== null
  const needsOnboarding = answered && !tenantId

  return {
    tenantId,
    loading: !isLoaded || (!!user && loading),
    needsOnboarding,
    error,
  }
}
