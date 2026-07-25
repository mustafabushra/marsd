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
 * Trim an award to what remains under the monthly earning ceiling.
 *
 * Contribution is deliberately unlimited — the registry is the asset. But
 * credits widen the plan's own limits, so unlimited earning would turn the free
 * plan into an unlimited one and the paid tiers would lose their meaning from
 * that direction. The cap keeps contribution free while keeping what it buys
 * finite.
 *
 * Counts only positive entries: spending must not create room to earn again.
 * Returns the points that may be granted, possibly a partial award, or 0.
 */
async function applyMonthlyCap(supabase, entitlements, points) {
  const cap = Number(entitlements?.giveToGetRules?.monthly_earn_cap) || 0
  if (cap <= 0) return points   // no ceiling configured

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('credits_ledger')
    .select('amount')
    .eq('tenant_id', entitlements.tenantId)
    .gt('amount', 0)
    .gte('created_at', monthStart.toISOString())

  // A failed count must not silently uncap the month.
  if (error) return 0

  const earned = (data || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  return Math.max(0, Math.min(points, cap - earned))
}

export async function awardCredits(entitlements, action, { reportId = null, userId = null } = {}) {
  if (!entitlements?.giveToGetEnabled || !entitlements.tenantId) return 0

  const rule = entitlements.giveToGetRules?.earn?.[action]
  const points = Number(rule?.points) || 0
  if (points <= 0) return 0

  try {
    const supabase = getSupabase()

    const capped = await applyMonthlyCap(supabase, entitlements, points)
    if (capped <= 0) return 0
    // `action` is the reason. The earn keys in give_to_get_rules and the values
    // credits_ledger_reason_check permits are deliberately the same vocabulary;
    // translating between them is how the previous write ended up sending
    // 'report_submitted' to a constraint that never allowed it.
    const { error } = await supabase.from('credits_ledger').insert([{
      tenant_id: entitlements.tenantId,
      report_id: reportId,
      user_id: userId,
      amount: capped,
      reason: action,
    }])
    if (error) {
      // 23505 is the one-award-per-report index doing its job: the report was
      // already paid for. Not a failure, and not worth a console entry.
      if (error.code === '23505') return 0
      throw error
    }
    return capped
  } catch (err) {
    // Never fail the contribution because its reward could not be written; the
    // work the user did is what matters, and the ledger can be reconciled.
    console.error('Failed to award credits:', err)
    return 0
  }
}

/**
 * Award credits to a tenant that is not the caller's own.
 *
 * Approval is the case: an administrator approves a report and the points go to
 * the company that filed it. Their plan decides whether they earn at all, so
 * this resolves that tenant's plan rather than the reviewer's — and the rate
 * comes from settings, never from a number written at the call site.
 *
 * Returns the points awarded, 0 when the plan does not earn or the report has
 * already been paid for.
 */
export async function awardCreditsToTenant(tenantId, action, { reportId = null, userId = null } = {}) {
  if (!tenantId) return 0

  try {
    const supabase = getSupabase()

    const [subRes, settingsRes] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('plans(give_to_get_enabled)')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'give_to_get_rules').maybeSingle(),
    ])

    if (!subRes.data?.plans?.give_to_get_enabled) return 0

    const rules = settingsRes.data?.value
    const points = Number(rules?.earn?.[action]?.points) || 0
    if (points <= 0) return 0

    // The ceiling belongs to the earning tenant, not the reviewer, so it is
    // applied against their ledger here too — otherwise approval would be the
    // one path around it.
    const capped = await applyMonthlyCap(supabase, { tenantId, giveToGetRules: rules }, points)
    if (capped <= 0) return 0

    const { error } = await supabase.from('credits_ledger').insert([{
      tenant_id: tenantId,
      report_id: reportId,
      user_id: userId,
      amount: capped,
      reason: action,
    }])
    if (error) {
      if (error.code === '23505') return 0   // already awarded for this report
      throw error
    }
    return capped
  } catch (err) {
    console.error('Failed to award credits to tenant:', err)
    return 0
  }
}

/**
 * Spend credits, or report that there are none to spend.
 *
 * Writes the negative entry only when the balance covers it, so the ledger can
 * never go below zero by racing itself. Returns false when the caller should
 * stop rather than proceed unpaid.
 */
export async function spendCredits(entitlements, action, { amount = null } = {}) {
  if (!entitlements?.giveToGetEnabled || !entitlements.tenantId) return true // nothing to spend on a paid plan

  const rule = entitlements.giveToGetRules?.spend?.[action]
  const cost = Number(amount ?? rule?.points) || 0
  if (cost <= 0) return true
  if ((entitlements.credits || 0) < cost) return false

  try {
    const supabase = getSupabase()
    const { error } = await supabase.from('credits_ledger').insert([{
      tenant_id: entitlements.tenantId,
      amount: -cost,
      reason: action,
    }])
    if (error) throw error
    return true
  } catch (err) {
    console.error('Failed to spend credits:', err)
    return false
  }
}

/** Human-readable ceiling, for UI. */
export function formatLimit(value) {
  return value === UNLIMITED || value === Infinity ? 'بلا حد' : String(value)
}
