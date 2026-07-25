import { getSupabase } from './api'

/**
 * Metering for looking a company up.
 *
 * What "عمليات البحث" charges for is deliberately the report view, not the
 * search box. Search runs on every keystroke behind a 500ms debounce, so
 * charging there would spend a free member's whole month typing one company
 * name — and typing is not what consumes the registry. Opening a company's
 * report is.
 *
 * A company already looked at this month is free to look at again. Someone
 * revisiting a supplier they are negotiating with should not pay twice for the
 * same fact, so the meter counts distinct companies rather than page loads.
 *
 * The record lives in audit_logs, which is written for this anyway and carries
 * the company id. view_quota_usage holds only a bare counter, and a counter
 * cannot answer "have I seen this one before" — keeping both would mean two
 * numbers that drift.
 */

const VIEW_ACTION = 'company_report_viewed'

const monthStart = () => {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/** Distinct companies this tenant has opened this month. */
export async function countCompanyViews(tenantId) {
  if (!tenantId) return 0
  try {
    const { data, error } = await getSupabase()
      .from('audit_logs')
      .select('entity_id')
      .eq('tenant_id', tenantId)
      .eq('action', VIEW_ACTION)
      .gte('created_at', monthStart())
    if (error) throw error
    return new Set((data || []).map((r) => r.entity_id).filter(Boolean)).size
  } catch (err) {
    console.error('Failed to count company views:', err)
    return 0
  }
}

/** Has this tenant already opened this company this month? */
export async function hasViewedCompany(tenantId, companyId) {
  if (!tenantId || !companyId) return false
  try {
    const { data } = await getSupabase()
      .from('audit_logs')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('action', VIEW_ACTION)
      .eq('entity_id', companyId)
      .gte('created_at', monthStart())
      .limit(1)
    return (data || []).length > 0
  } catch {
    return false
  }
}

/**
 * Record the view.
 *
 * Best-effort: a failed write must not stop someone reading a report they are
 * entitled to. It costs an undercount, which is the right way round to be wrong.
 */
export async function recordCompanyView(tenantId, companyId, userId = null) {
  if (!tenantId || !companyId) return
  try {
    await getSupabase().from('audit_logs').insert([{
      tenant_id: tenantId,
      actor_id: userId,
      action: VIEW_ACTION,
      entity: 'company',
      entity_id: companyId,
      created_at: new Date().toISOString(),
    }])
  } catch (err) {
    console.error('Failed to record company view:', err)
  }
}
