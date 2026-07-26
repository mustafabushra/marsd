#!/usr/bin/env node
/**
 * Does the interface's idea of a role match the database's?
 *
 * There are two answers to "may this user do that": src/utils/roles.ts, which
 * decides whether a button is offered, and the RLS policies, which decide whether
 * the write lands. Only the second protects anything, and only the first is
 * visible — so when they disagree the product is either a button that fails after
 * the click, or a capability with nothing offering it.
 *
 * They had disagreed since launch in the quietest possible direction. roles.ts
 * described owner / admin / manager / viewer; users.role is constrained to
 * platform_admin, company_admin, company_member, reviewer. Every lookup missed,
 * every miss fell through to viewer, and the dashboard told a company admin
 * "لا توجد صلاحية" on the button for the one action the platform exists for.
 *
 * This runs the real writes as a real account of each role, inside a transaction
 * it rolls back, and compares the outcome with what the table promises. It can
 * only tell the truth about accounts that exist — a role with no user is
 * reported as unchecked, not as passing.
 *
 * Usage: node scripts/verify-roles.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split('\n')
  .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim()

// The permission table, transcribed from src/utils/roles.ts. Kept here on purpose:
// a copy that must be updated alongside the original is what makes a divergence
// show up as a failing check rather than as a silent agreement to be wrong.
const EXPECTED = {
  platform_admin: { canAddReport: true,  canEditCompany: true,  canManageUsers: true },
  company_admin:  { canAddReport: true,  canEditCompany: true,  canManageUsers: true },
  company_member: { canAddReport: true,  canEditCompany: false, canManageUsers: false },
  reviewer:       { canAddReport: false, canEditCompany: false, canManageUsers: false },
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

// Prefer an account that can actually exercise every check: one whose tenant has
// a company to edit and a colleague to manage. Picking the first account of each
// role reported company_admin as forbidden from managing users, when the truth
// was that the account was alone in its tenant and the UPDATE matched nothing.
// A probe that cannot tell "refused" from "nothing to refuse" invents failures.
const { rows: users } = await c.query(`
  select distinct on (u.role)
         u.id, u.email, u.role, u.tenant_id, t.company_id,
         (select count(*) from public.users p
           where p.tenant_id = u.tenant_id and p.id <> u.id and p.status = 'active')::int as peers
    from public.users u
    left join public.tenants t on t.id = u.tenant_id
   where u.status = 'active'
   order by u.role, (t.company_id is null), (
     select count(*) from public.users p
      where p.tenant_id = u.tenant_id and p.id <> u.id and p.status = 'active') desc, u.created_at`)

const { rows: [anyCompany] } = await c.query('select id from public.companies limit 1')

let failures = 0
let unchecked = 0

for (const role of Object.keys(EXPECTED)) {
  const u = users.find((x) => x.role === role)
  console.log(`\n  ${role}${u ? `  ·  ${u.email}` : ''}`)

  if (!u) {
    console.log('    ⚪ لا يوجد حساب بهذا الدور — لم يُفحص')
    unchecked++
    continue
  }

  await c.query('begin')
  await c.query('set local role authenticated')
  await c.query('select set_config($1, $2, true)',
    ['request.jwt.claims', JSON.stringify({ sub: u.id, role: 'authenticated' })])

  // The database's answer: did the row land? An UPDATE or INSERT that RLS filters
  // out reports no error and no rows, so rowCount is the only honest signal.
  const attempt = async (sql, params) => {
    await c.query('savepoint s')
    let allowed = false
    try {
      const { rowCount } = await c.query(sql, params)
      allowed = rowCount > 0
    } catch {
      allowed = false
    }
    await c.query('rollback to savepoint s')
    return allowed
  }

  const checks = {
    canAddReport: u.tenant_id && anyCompany
      ? await attempt(
          `insert into public.reports (reporter_tenant_id, target_company_id, dealt_at)
           values ($1, $2, now())`, [u.tenant_id, anyCompany.id])
      : null,

    canEditCompany: u.company_id
      ? await attempt('update public.companies set name_en = name_en where id = $1', [u.company_id])
      : null,

    canManageUsers: u.tenant_id && u.peers > 0
      ? await attempt(
          `update public.users set status = status where tenant_id = $1 and id <> $2`,
          [u.tenant_id, u.id])
      : null,
  }

  await c.query('rollback')

  for (const [action, expected] of Object.entries(EXPECTED[role])) {
    const actual = checks[action]
    if (actual === null) {
      console.log(`    ⚪ ${action}: لا توجد بيانات كافية لفحصه بهذا الحساب`)
      unchecked++
    } else if (actual === expected) {
      console.log(`    ✅ ${action}: ${expected ? 'مسموح' : 'ممنوع'} — الواجهة والقاعدة متطابقتان`)
    } else {
      console.log(`    ❌ ${action}: الواجهة تقول ${expected ? 'مسموح' : 'ممنوع'} والقاعدة تقول ${actual ? 'مسموح' : 'ممنوع'}`)
      failures++
    }
  }
}

await c.end()

console.log(failures
  ? `\n  ❌ ${failures} تعارض بين صلاحيات الواجهة وسياسات القاعدة\n`
  : `\n  ✅ لا تعارض${unchecked ? `  (${unchecked} لم تُفحص)` : ''}\n`)
process.exit(failures ? 1 : 0)
