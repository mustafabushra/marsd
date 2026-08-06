#!/usr/bin/env node
/**
 * Can an account give itself a better plan?
 *
 * Everything the product limits — lookups, features, seats, comparison — is
 * decided by two columns on one row: `subscriptions.plan_id` and
 * `current_period_end`. Whoever may write that row sets their own price.
 *
 * They could. `subscriptions_update_policy` allowed a tenant admin to update
 * their own subscription, so
 *
 *     PATCH /rest/v1/subscriptions?tenant_id=eq.<mine>
 *     { "plan_id": "<enterprise>" }
 *
 * returned 1 row and removed every limit on the account. No RPC, no schema
 * knowledge — one request against a table the subscription page already reads.
 * Migration 110 closed it; this is what stops it coming back, because the policy
 * was plausible enough to have been written on purpose once already.
 *
 * Runs as a real company admin under its own JWT claims, and rolls back.
 *
 *   node scripts/probe-plan-escalation.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let failed = 0
const ok = (good, name, detail = '') => {
  console.log(`  ${good ? '✅' : '❌'} ${name}${detail ? ` · ${detail}` : ''}`)
  if (!good) failed++
}

/** Returns the number of rows the statement managed to write, 0 if refused. */
const attempt = async (sql, p = []) => {
  await c.query('savepoint s')
  try {
    const r = await c.query(sql, p)
    await c.query('rollback to savepoint s')
    return r.rowCount
  } catch {
    await c.query('rollback to savepoint s')
    return 0
  }
}

const { rows: [u] } = await c.query(`select u.id, u.tenant_id from public.users u
  join public.subscriptions s on s.tenant_id = u.tenant_id
 where u.role = 'company_admin' and u.tenant_id is not null limit 1`)
const { rows: [best] } = await c.query(
  "select id, code from public.plans order by price_monthly desc nulls last limit 1")
const { rows: [free] } = await c.query('select id from public.plans where is_default limit 1')

if (!u || !best) { console.log('  ⚠️  لا مدير شركة له اشتراك — لا يمكن الفحص'); process.exit(0) }
console.log(`\n  المدير: ${u.id}\n  أغلى باقة: ${best.code}\n`)

await c.query('begin')
try {
  await c.query('set local role authenticated')
  await c.query('select set_config($1,$2,true)',
    ['request.jwt.claims', JSON.stringify({ sub: u.id, role: 'authenticated' })])

  ok(await attempt('update public.subscriptions set plan_id = $1 where tenant_id = $2',
    [best.id, u.tenant_id]) === 0, 'لا يمنح نفسه أغلى باقة')

  ok(await attempt(`update public.subscriptions set current_period_end = now() + interval '10 years'
                     where tenant_id = $1`, [u.tenant_id]) === 0, 'ولا يمدّد اشتراكه')

  ok(await attempt(`update public.subscriptions set status = 'active' where tenant_id = $1`,
    [u.tenant_id]) === 0, 'ولا يعيد تفعيل اشتراك موقوف')

  ok(await attempt(`insert into public.subscriptions
       (tenant_id, plan_id, status, current_period_start, current_period_end)
     values ($1, $2, 'active', now(), now() + interval '10 years')`,
  [u.tenant_id, best.id]) === 0, 'ولا ينشئ لنفسه اشتراكاً بباقة يختارها')

  ok(await attempt(`update public.plans set limits = jsonb_set(limits,'{searches_per_month}','99999')
                     where id = $1`, [free.id]) === 0, 'ولا يوسّع حدود باقته من جدول الباقات')

  ok(await attempt(`insert into public.plans (code, name, price_monthly, limits, features, active)
     values ('probe_escalation', 'فحص', 0, '{"searches_per_month":-1}'::jsonb,
             array['full_trust_report'], true)`) === 0, 'ولا يخترع باقة جديدة')

  // Sign-up still works: a tenant admin creates its own free subscription.
  // Checked because the fix narrows this policy, and narrowing it too far would
  // break registration silently — nobody would be able to finish signing up.
  //
  // The tenant is made here rather than looked for. The first version searched
  // for one without a subscription, found none — every real tenant has one —
  // and skipped, so the most dangerous half of this change went unchecked: a
  // policy narrowed too far breaks registration for everybody, silently, and
  // nothing else in the suite touches that path.
  await c.query('reset role')
  const stamp = Date.now()
  const { rows: [fresh] } = await c.query(`
    insert into public.tenants (name, cr_number, email)
    values ('كيان فحص', $1, $2) returning id`,
  [`99${String(stamp).slice(-8)}`, `probe.${stamp}@example.test`])
  const owner = `probe_owner_${stamp}`
  await c.query(`insert into public.users (id, email, role, tenant_id)
                 values ($1, $2, 'company_admin', $3)`,
  [owner, `probe.${stamp}@example.test`, fresh.id])

  await c.query('set local role authenticated')
  await c.query('select set_config($1,$2,true)',
    ['request.jwt.claims', JSON.stringify({ sub: owner, role: 'authenticated' })])

  ok(await attempt(`insert into public.subscriptions
       (tenant_id, plan_id, status, current_period_start, current_period_end)
     values ($1, $2, 'active', now(), now() + interval '30 days')`,
  [fresh.id, free.id]) === 1, 'ومسار التسجيل ما زال ينشئ الاشتراك المجاني')

  ok(await attempt(`insert into public.subscriptions
       (tenant_id, plan_id, status, current_period_start, current_period_end)
     values ($1, $2, 'active', now(), now() + interval '30 days')`,
  [fresh.id, best.id]) === 0, 'ولا ينشئه بباقة مدفوعة')

  // And it can still read its own row, which every gated screen depends on.
  await c.query('select set_config($1,$2,true)',
    ['request.jwt.claims', JSON.stringify({ sub: u.id, role: 'authenticated' })])
  const { rows: mine } = await c.query(
    'select id from public.subscriptions where tenant_id = $1', [u.tenant_id])
  ok(mine.length === 1, 'والشركة ما زالت تقرأ اشتراكها', `${mine.length} صف`)
} finally {
  await c.query('rollback').catch(() => {})
  await c.end()
}

console.log(failed ? `\n  ❌ ${failed} فحص فشل\n` : '\n  ✅ كل الفحوصات نجحت\n')
process.exit(failed ? 1 : 0)
