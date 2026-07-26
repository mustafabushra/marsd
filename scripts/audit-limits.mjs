#!/usr/bin/env node
/**
 * Is every tenant actually inside the limits its plan says it has?
 *
 * Reviewing the enforcement code does not answer this. The watchlist ceiling was
 * enforced by a function that looked correct on its own and disagreed with the
 * resolver next to it: one excluded credits from that limit, the other added
 * them, so a tenant with 45 points had a limit of 48 where the plan said 3. No
 * amount of reading either function would have shown it — counting the rows did,
 * and the user noticed before any check here existed.
 *
 * So this counts. For every tenant, what the plan permits against what the
 * database holds, per limit. It is the only statement about enforcement that
 * does not depend on the enforcement being right.
 *
 * Usage: node scripts/audit-limits.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split('\n')
  .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()

const monthStart = `date_trunc('month', now())`

// Each limit, and the query that measures the thing it limits. Adding a limit to
// a plan without adding it here leaves it unmeasured — which is how a ceiling
// comes to be believed rather than known.
const LIMITS = [
  {
    key: 'watchlist_items',
    label: 'قوائم المراقبة',
    period: false,
    sql: `select tenant_id, count(*)::int as n from public.watchlist_items group by 1`,
  },
  {
    key: 'users',
    label: 'المستخدمون',
    period: false,
    sql: `select tenant_id, count(*)::int as n from public.users where tenant_id is not null group by 1`,
  },
  {
    key: 'pending_reports',
    label: 'تقارير قيد المراجعة',
    period: false,
    sql: `select reporter_tenant_id as tenant_id, count(*)::int as n from public.reports where status = 'pending_review' group by 1`,
  },
  {
    key: 'searches_per_month',
    label: 'عمليات البحث هذا الشهر',
    period: true,
    sql: `select tenant_id, count(distinct entity_id)::int as n from public.audit_logs
          where action = 'company_report_viewed' and created_at >= ${monthStart} group by 1`,
  },
]

const { rows: tenants } = await db.query(`
  select t.id, t.name, p.code as plan, p.limits, p.give_to_get_enabled,
         coalesce((select sum(amount) from public.credits_ledger cl where cl.tenant_id = t.id), 0)::int as credits
  from public.tenants t
  left join public.subscriptions s on s.tenant_id = t.id
  left join public.plans p on p.id = s.plan_id
  order by t.name`)

const usage = {}
for (const l of LIMITS) {
  const { rows } = await db.query(l.sql)
  usage[l.key] = Object.fromEntries(rows.map((r) => [r.tenant_id, r.n]))
}

// Mirrors lib/entitlements.js: the plan's allowance first, then credits, and
// only for the limits credits are actually spent against.
const SPENDABLE = new Set(['searches_per_month'])
const allowanceFor = (t, key) => {
  const raw = t.limits?.[key]
  if (raw === undefined || raw === null) return Infinity
  const ceiling = Number(raw)
  if (ceiling === -1) return Infinity
  if (!t.give_to_get_enabled || !SPENDABLE.has(key)) return ceiling
  return ceiling + Math.max(0, t.credits)
}

console.log('\n  ما تسمح به الباقة مقابل ما في القاعدة:\n')
let breaches = 0

for (const t of tenants) {
  if (!t.plan) { console.log(`  ⚠ ${t.name} — بلا اشتراك`); continue }
  console.log(`  ${t.name}  (${t.plan}${t.give_to_get_enabled ? `, ${t.credits} نقطة` : ''})`)

  for (const l of LIMITS) {
    const used = usage[l.key][t.id] || 0
    const allowed = allowanceFor(t, l.key)
    const over = used > allowed
    if (over) breaches++
    const cap = allowed === Infinity ? 'بلا حد' : allowed
    console.log(`    ${over ? '❌' : '✅'} ${l.label}: ${used} / ${cap}`)
  }
  console.log('')
}

console.log(`  ${breaches === 0 ? '✅ لا تجاوز' : `❌ ${breaches} تجاوزاً`}`)
if (breaches > 0) {
  console.log('     تجاوز قائم لا يعني بالضرورة أن الفحص مكسور الآن — قد يكون')
  console.log('     سابقاً لنشر الحد. راجع تواريخ الصفوف قبل الحكم.\n')
} else {
  console.log('')
}

await db.end()
process.exit(breaches === 0 ? 0 : 1)
