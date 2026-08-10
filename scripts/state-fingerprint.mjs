#!/usr/bin/env node
/**
 * What the system currently says, in a form that can be diffed.
 *
 * Every step of the state migration runs this before and after. A gate moved
 * from `approved` to `status = 'active'` is only safe if the same search
 * returns the same companies — and «it looked fine» is not that claim.
 *
 * Deterministic on purpose: fixed queries, sorted output, no timestamps.
 *
 *   node scripts/state-fingerprint.mjs > before.txt
 *   …migration…
 *   node scripts/state-fingerprint.mjs > after.txt
 *   diff before.txt after.txt
 */

import pg from 'pg'
import { readFileSync } from 'node:fs'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()

const out = []
const say = (s) => out.push(s)

// --- Row counts -------------------------------------------------------------
say('## عدد الصفوف')
const TABLES = ['companies', 'company_requests', 'company_request_events',
  'registration_requests', 'claim_requests', 'company_data_requests',
  'clarification_requests', 'company_documents', 'tenants', 'users', 'reports',
  'disputes', 'government_company_registry']
for (const t of TABLES) {
  const { rows } = await db.query(`select count(*)::int n from public.${t}`).catch(() => ({ rows: [{ n: 'ERR' }] }))
  say(`  ${t.padEnd(30)} ${rows[0].n}`)
}

// --- Company state distribution ---------------------------------------------
say('\n## توزيع حالات الشركات')
const { rows: dist } = await db.query(`
  select status, approved, review_status, count(*)::int n
    from public.companies group by 1,2,3 order by 1,2,3`)
for (const r of dist) {
  say(`  status=${String(r.status).padEnd(10)} approved=${String(r.approved).padEnd(6)} review=${String(r.review_status).padEnd(14)} ${r.n}`)
}

// --- Request state distribution ---------------------------------------------
say('\n## توزيع حالات الطلبات')
const { rows: rq } = await db.query(`
  select kind, status, count(*)::int n from public.company_requests group by 1,2 order by 1,2`)
say(rq.length ? rq.map((r) => `  ${r.kind}/${r.status} = ${r.n}`).join('\n') : '  (لا طلبات)')

// --- What each search surface returns ---------------------------------------
// The claim is set inside a transaction because `set_config(..., true)` is
// transaction-local; outside one it is discarded before the next statement.
const TERMS = ['مرصد', 'يلا', 'شركة', 'سعود', 'الرياض', 'مقاولات']
const { rows: [actor] } = await db.query(
  `select id from public.users where role = 'company_member' order by created_at limit 1`)

say('\n## نتائج البحث (كمستخدم شركة)')
for (const term of TERMS) {
  await db.query('begin')
  await db.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: actor?.id, role: 'authenticated' })])

  const lines = []
  for (const fn of ['search_companies_unified', 'autocomplete_companies']) {
    try {
      const { rows } = await db.query(`select * from public.${fn}($1, 20)`, [term])
      const names = rows.map((r) => r.name).filter(Boolean).sort()
      lines.push(`    ${fn.padEnd(26)} ${names.length}  [${names.join(' | ').slice(0, 90)}]`)
    } catch (e) {
      lines.push(`    ${fn.padEnd(26)} ERROR ${e.message.slice(0, 50)}`)
    }
  }
  await db.query('rollback')
  say(`  «${term}»`)
  for (const l of lines) say(l)
}

// --- Who is visible at all --------------------------------------------------
say('\n## الشركات المرئية (approved = true)')
const { rows: vis } = await db.query(
  `select name from public.companies where approved order by name`)
for (const r of vis) say(`  ${r.name}`)

say('\n## الشركات المرئية (status = \'active\')')
const { rows: vis2 } = await db.query(
  `select name from public.companies where status = 'active' order by name`)
for (const r of vis2) say(`  ${r.name}`)

await db.end()
console.log(out.join('\n'))
