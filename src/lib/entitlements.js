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
      isPlatform: !!data.isPlatform,
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
/**
 * How many points an approval granted — read back, never requested.
 *
 * Nothing here asks for credits. POST /api/award-credits used to grant them
 * from `body.action` alone, without ever checking that the action happened, so
 * a signed-in user could loop it and mint the monthly cap having done nothing.
 * Granting now lives in database triggers on the three transitions that are the
 * events — a report approved, a registration approved, a data request approved
 * — and they have already run by the time the UPDATE returns.
 *
 * So the screen's job is no longer to cause the award. It is to report one that
 * the database has already decided, which is why this reads rather than writes.
 * Returns 0 when nothing was granted: the plan does not earn, the month's
 * ceiling is reached, or these points were granted on an earlier approval of
 * the same thing.
 */
export async function creditsGrantedFor(sourceTable, sourceId, reason) {
  if (!sourceTable || !sourceId || !reason) return 0
  try {
    const { data, error } = await getSupabase().rpc('credits_granted_for', {
      p_source_table: sourceTable,
      p_source_id: sourceId,
      p_reason: reason,
    })
    if (error) throw error
    return Number(data) || 0
  } catch (err) {
    console.error('Failed to read granted credits:', err)
    return 0
  }
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
    // One database call: the lock, the balance and the debit happen together.
    // The endpoint this replaced read the ledger, summed it in JavaScript,
    // compared, then inserted — four steps with no transaction, so two clicks
    // at once both read the same balance and both spent it. And the read was
    // capped at 1000 rows by PostgREST, which returns 200 without saying it
    // truncated, so past that the balance being checked was simply wrong.
    const { data, error } = await getSupabase().rpc('spend_credits', { p_action: action })
    if (error) throw error

    // `proceed` means there was nothing to spend — a paid plan, or an action
    // with no price. The caller should carry on, not be blocked.
    if (data?.proceed) return true
    return Number(data?.spent) > 0
  } catch (err) {
    console.error('Failed to spend credits:', err)
    return false
  }
}

// This comment described spendCredits as dead and pointed at an endpoint that
// no longer exists. TrustReport calls it, and the balance now lives entirely in
// the database: spend_credits() takes an advisory lock on the tenant, sums the
// ledger in SQL and writes the debit, all in one transaction the browser cannot
// interleave with itself.

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
