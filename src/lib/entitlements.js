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
 * Credits extend the ceiling rather than replacing it: on a Give-to-Get plan a
 * tenant that has earned points can go past the plan's own limit, which is the
 * whole point of the arrangement. Returns Infinity when unlimited.
 */
export function remaining(entitlements, key) {
  if (!entitlements) return 0
  if (entitlements.degraded || entitlements.enforcementDisabled) return Infinity

  const ceiling = limitOf(entitlements, key)
  if (ceiling === UNLIMITED) return Infinity

  const used = entitlements.usage?.[key] || 0
  const base = Math.max(0, ceiling - used)

  if (!entitlements.giveToGetEnabled) return base
  return base + Math.max(0, entitlements.credits || 0)
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

  if (!tenantId) return degraded('لا يوجد كيان مرتبط بالحساب')

  try {
    const supabase = getSupabase()

    const [subRes, settingsRes, creditsRes, quotaRes] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('status, current_period_end, plans(id, code, name, description, price_monthly, limits, features, active, give_to_get_enabled)')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['give_to_get_rules', 'entitlements_enforcement', 'feature_catalog']),
      supabase
        .from('credits_ledger')
        .select('amount')
        .eq('tenant_id', tenantId),
      // Distinct companies opened this month. Counted from audit_logs, which
      // records the company id, rather than view_quota_usage, which holds a bare
      // counter that cannot say whether a company was seen before — and a member
      // is not charged twice for the same company.
      supabase
        .from('audit_logs')
        .select('entity_id')
        .eq('tenant_id', tenantId)
        .eq('action', 'company_report_viewed')
        .gte('created_at', new Date(new Date().setDate(1)).toISOString().slice(0, 10)),
    ])

    const plan = subRes.data?.plans || null
    if (!plan) return degraded('لا توجد باقة مرتبطة بالكيان')

    const settings = Object.fromEntries((settingsRes.data || []).map((r) => [r.key, r.value]))
    const enforcement = settings.entitlements_enforcement || {}

    // The ledger is append-only and holds both earnings and spends, so the
    // balance is its sum — never a stored counter that can drift from it.
    const credits = (creditsRes.data || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0)

    return {
      tenantId,
      plan,
      planCode: plan.code,
      limits: plan.limits || {},
      features: plan.features || [],
      credits,
      usage: {
        searches_per_month: new Set((quotaRes.data || []).map((r) => r.entity_id).filter(Boolean)).size,
      },
      giveToGetEnabled: !!plan.give_to_get_enabled,
      giveToGetRules: settings.give_to_get_rules || null,
      featureCatalog: settings.feature_catalog || {},
      enforcementDisabled: enforcement.enabled === false,
      subscriptionStatus: subRes.data?.status || null,
      periodEnd: subRes.data?.current_period_end || null,
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

    const used = count || 0
    // Credits widen this the same way they widen everything else on a
    // Give-to-Get plan: contributing earns room.
    const allowance = ceiling + (entitlements?.giveToGetEnabled ? (entitlements.credits || 0) : 0)
    return { allowed: used < allowance, used, ceiling: allowance }
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
