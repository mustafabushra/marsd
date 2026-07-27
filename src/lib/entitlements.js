import { getSupabase } from './api'

/**
 * What a tenant is allowed to do, resolved from the database.
 *
 * Every gate in the app asks this one module. The alternative — a condition per
 * page — is how limits drift apart: one screen checks a plan name, another a
 * hard-coded number, and changing a ceiling means finding all of them. Here the
 * plan is data (plans.limits, plans.features), so an operator raises a limit or
 * moves a feature between plans from the admin panel and the app follows on the
 * next load.
 *
 * Two rules govern the resolution, and both fail open rather than shut:
 *
 *   - A limit key that is absent is unlimited, not zero. A plan that forgot to
 *     mention searches must not lock a paying tenant out of search.
 *   - If the lookup itself fails — network, RLS, a tenant with no subscription —
 *     the caller is allowed through and `degraded` is set. Billing accuracy is
 *     not worth blocking a customer over a failed request; the flag is there so
 *     the UI can say so rather than pretend everything is fine.
 */

export const UNLIMITED = -1

const PERIOD = () => new Date().toISOString().slice(0, 7) // 'YYYY-MM'

/** Ceiling for a limit key. Absent or -1 means no ceiling. */
export function limitOf(entitlements, key) {
  const raw = entitlements?.limits?.[key]
  if (raw === undefined || raw === null) return UNLIMITED
  const n = Number(raw)
  return Number.isFinite(n) ? n : UNLIMITED
}

/** Does the plan unlock this feature key? See system_settings.feature_catalog. */
export function can(entitlements, feature) {
  if (!entitlements) return false
  if (entitlements.degraded || entitlements.enforcementDisabled) return true
  return Array.isArray(entitlements.features) && entitlements.features.includes(feature)
}

/**
 * How many of `key` remain this period.
 *
 * The plan's own allowance is consumed first; credits are what is left after it
 * runs out, and they are spent — not added to a ceiling that resets. That
 * distinction matters more than it looks: while credits merely widened the
 * limit, earning 200 points once bought 200 extra lookups every month
 * thereafter, for ever. A single month's contribution became a permanent
 * upgrade, which is not an exchange.
 *
 * Only searching draws on credits today, so only that key is offered the
 * balance. A limit nothing spends against would otherwise appear to be
 * extendable and never actually extend.
 *
 * Returns Infinity when unlimited.
 */
const SPENDABLE = new Set(['searches_per_month'])

export function remaining(entitlements, key) {
  if (!entitlements) return 0
  if (entitlements.degraded || entitlements.enforcementDisabled) return Infinity

  const ceiling = limitOf(entitlements, key)
  if (ceiling === UNLIMITED) return Infinity

  const used = entitlements.usage?.[key] || 0
  const fromPlan = Math.max(0, ceiling - used)

  if (!entitlements.giveToGetEnabled || !SPENDABLE.has(key)) return fromPlan

  const cost = Number(entitlements.giveToGetRules?.spend?.search_unlock?.points) || 1
  const fromCredits = Math.floor(Math.max(0, entitlements.credits || 0) / cost)
  return fromPlan + fromCredits
}

/** Is this lookup being paid for with credits rather than the plan's allowance? */
export function isPaidWithCredits(entitlements, key) {
  if (!entitlements?.giveToGetEnabled || !SPENDABLE.has(key)) return false
  const ceiling = limitOf(entitlements, key)
  if (ceiling === UNLIMITED) return false
  return (entitlements.usage?.[key] || 0) >= ceiling
}

/** Whether one more of `key` is permitted right now. */
export function allows(entitlements, key, count = 1) {
  return remaining(entitlements, key) >= count
}

/**
 * Read the tenant's plan, credits and usage.
 *
 * One call per page rather than per action: the numbers move slowly and a gate
 * that re-queries on every keystroke is worse than one that is a few seconds
 * stale. Callers refresh after an action that spends.
 */
export async function loadEntitlements(tenantId) {
  const degraded = (reason) => ({
    tenantId,
    plan: null,
    limits: {},
    features: [],
    credits: 0,
    usage: {},
    giveToGetEnabled: false,
    enforcementDisabled: false,
    degraded: true,
    reason,
  })

  try {
    // One round trip. This used to be a query for the caller's tenant_id, a
    // wait, and then four more queries that could not start until it returned —
    // so the delay was the sum of two, after Clerk had already taken its turn.
    // Every gated screen sat behind that, and a member opening comparison saw
    // the whole table before the plan came back and locked it.
    //
    // The tenant lookup now happens inside the database, where it costs nothing.
    const { data, error } = await getSupabase().rpc('my_entitlements')
    if (error) throw error
    if (!data || data.degraded) return degraded(data?.reason || 'تعذّر قراءة بيانات الباقة')

    return {
      tenantId: data.tenantId,
      plan: data.plan,
      planCode: data.planCode,
      limits: data.limits || {},
      features: data.features || [],
      credits: Number(data.credits) || 0,
      usage: data.usage || {},
      giveToGetEnabled: !!data.giveToGetEnabled,
      giveToGetRules: data.giveToGetRules || null,
      featureCatalog: data.featureCatalog || {},
      enforcementDisabled: !!data.enforcementDisabled,
      degraded: false,
      reason: null,
    }
  } catch (err) {
    console.error('Failed to resolve entitlements:', err)
    return degraded(err?.message || 'تعذّر قراءة بيانات الباقة')
  }
}

/**
 * Record a contribution and credit it, when the plan earns that way.
 *
 * No-ops on a paid plan: Basic, Pro and Enterprise grant their entitlements
 * outright, and quietly accruing points there would leave a balance nobody can
 * explain. Returns the points awarded, 0 when the action earns nothing.
 */
/**
 * Ask the server to record a contribution.
 *
 * The browser no longer writes to credits_ledger, and RLS enforces that: the
 * balance decides what a plan allows, so it cannot be writable by the party it
 * benefits. Any client-side rule permissive enough to credit a member for
 * their contribution is permissive enough for that member to choose the amount.
 *
 * Nothing that decides the outcome is sent from here. The rate, the plan's
 * eligibility, and the monthly ceiling are all read server-side from the same
 * settings the admin panel edits — a request carries an action name, and the
 * server decides what it is worth.
 *
 * Returns the points awarded, 0 for anything else. A failed award never fails
 * the contribution: the work the member did is what matters, and the ledger can
 * be reconciled.
 */
async function callAwardEndpoint(payload) {
  try {
    const clerk = globalThis.Clerk
    const token = clerk?.session ? await clerk.session.getToken() : null
    if (!token) return 0

    const resp = await fetch('/api/award-credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })

    // Not our JSON: the endpoint is not deployed and the SPA fallback served
    // index.html. Nothing was awarded, and nothing is broken by saying so.
    if (!(resp.headers.get('content-type') || '').includes('application/json')) return 0

    const data = await resp.json().catch(() => null)
    if (!resp.ok) {
      console.error('Award refused:', data?.error)
      return 0
    }
    return Number(data?.awarded) || 0
  } catch (err) {
    console.error('Failed to award credits:', err)
    return 0
  }
}

/** Credit the signed-in user's own company. */
export async function awardCredits(entitlements, action, { reportId = null } = {}) {
  if (!entitlements?.giveToGetEnabled || !entitlements.tenantId) return 0
  return callAwardEndpoint({ action, reportId })
}

/**
 * Draw the balance down for something the plan's allowance no longer covers.
 *
 * The server checks the balance in the same request that debits it, so this
 * cannot be raced into an overdraft by asking twice at once. Returns true when
 * the spend succeeded — or when there was nothing to spend, which is the case
 * on a paid plan and means the caller should simply proceed.
 */
export async function spendCredits(entitlements, action) {
  if (!entitlements?.giveToGetEnabled || !entitlements.tenantId) return true

  try {
    const clerk = globalThis.Clerk
    const token = clerk?.session ? await clerk.session.getToken() : null
    if (!token) return false

    const resp = await fetch('/api/award-credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action }),
    })
    if (!(resp.headers.get('content-type') || '').includes('application/json')) return false

    const data = await resp.json().catch(() => null)
    return !!data && Number(data.spent) > 0
  } catch (err) {
    console.error('Failed to spend credits:', err)
    return false
  }
}

/**
 * Credit a company other than the caller's — the approval case, where an
 * administrator approves a report and the points go to the company that filed
 * it. The server requires platform_admin for this, so the check is not one a
 * modified client can skip.
 */
export async function awardCreditsToTenant(tenantId, action, { reportId = null } = {}) {
  if (!tenantId) return 0
  return callAwardEndpoint({ action, reportId, tenantId })
}

// spendCredits lived here and was never called. Credits currently widen a
// ceiling rather than being drawn down — remaining() adds the balance to the
// plan's allowance — so nothing in the product deducts them, and the settings'
// `spend` rates describe an arrangement that does not exist yet. Written
// speculatively, kept as dead weight, and now it would fail silently against
// RLS as well: the ledger takes writes only from the server. If drawing down is
// ever wanted, it belongs in api/award-credits.js alongside the granting, where
// the balance can be checked and debited in one place that the browser cannot
// reach around.

/**
 * Is there room for another company on the watchlist?
 *
 * A watchlist entry is held, not consumed: the ceiling is on how many a company
 * may have at once, so it must be counted live rather than tracked as usage.
 * Two screens add to the watchlist — the list itself and search results — and
 * this is shared between them so the rule cannot end up enforced in one place
 * and not the other.
 *
 * Returns { allowed, used, ceiling }. ceiling is Infinity when unlimited.
 */
export async function watchlistRoom(entitlements, tenantId) {
  const ceiling = limitOf(entitlements, 'watchlist_items')

  if (!tenantId || ceiling === UNLIMITED || entitlements?.degraded || entitlements?.enforcementDisabled) {
    return { allowed: true, used: 0, ceiling: Infinity }
  }

  try {
    const { count, error } = await getSupabase()
      .from('watchlist_items')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
    if (error) throw error

    // The allowance is whatever remaining() says, computed against the count
    // just read. It used to add the credit balance here directly, which made
    // this the second place a ceiling was worked out — and the two disagreed:
    // remaining() excludes watchlist from what credits extend, while this added
    // them, so a tenant with 45 points had a limit of 48 instead of 3. Exactly
    // the drift that having one resolver was supposed to prevent, introduced by
    // writing a second calculation next to it.
    const used = count || 0
    const withUsage = { ...entitlements, usage: { ...(entitlements.usage || {}), watchlist_items: used } }
    const left = remaining(withUsage, 'watchlist_items')

    return { allowed: left > 0, used, ceiling }
  } catch (err) {
    // Counting failed: let it through rather than blocking on a bad request.
    console.error('Failed to check watchlist room:', err)
    return { allowed: true, used: 0, ceiling: Infinity }
  }
}

/** Human-readable ceiling, for UI. */
export function formatLimit(value) {
  return value === UNLIMITED || value === Infinity ? 'بلا حد' : String(value)
}
