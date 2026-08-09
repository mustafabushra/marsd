#!/usr/bin/env node
/**
 * The government register is readable by anyone signed in, writable by staff.
 *
 * A row here is a claim about the national commercial register. Any account may
 * read it — that is the whole value of holding it — and no account may invent
 * one. The import runs in an administrator's browser, so the write has to be
 * possible from there and impossible from anywhere else.
 *
 * It also proves the shape the design depends on: the same company appears once
 * per snapshot, not once overall. Q3 is a different publication from Q2, and
 * collapsing them would throw away the history that keeping them apart exists
 * to provide.
 *
 *   node scripts/probe-government-registry.mjs
 */

import pg from 'pg'
import { readFileSync } from 'node:fs'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let pass = 0
let fail = 0
let mark = 0
const ok = (n, cond, d = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${n}`) } else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}
const refuses = async (n, fn, expect) => {
  const sp = `g${(mark += 1)}`
  await c.query(`savepoint ${sp}`)
  try {
    await fn()
    await c.query(`release savepoint ${sp}`)
    fail += 1; console.log(`  ❌ ${n} — لم يُرفض`)
  } catch (e) {
    await c.query(`rollback to savepoint ${sp}`)
    const m = !expect || e.message.includes(expect)
    if (m) { pass += 1; console.log(`  ✅ ${n}`) }
    else { fail += 1; console.log(`  ❌ ${n} — رُفض لسبب آخر: ${e.message.slice(0, 60)}`) }
  }
}
const asUser = (id) => c.query(`select set_config('request.jwt.claims', $1, true)`,
  [JSON.stringify({ sub: id, role: 'authenticated' })])

const Q2 = 'ed041830-933d-4b93-aab2-c3b78822b22f'
const Q3 = '11111111-2222-3333-4444-555555555555'

try {
  await c.query('begin')

  // Who to impersonate, read as the owner — before the role is dropped.
  // `authenticated` cannot see public.users freely, so asking after the switch
  // returned nothing and the probe blamed a missing administrator for what was
  // its own ordering mistake.
  const { rows: [admin] } = await c.query(
    `select id from public.users where role = 'platform_admin' limit 1`)
  const { rows: [member] } = await c.query(
    `select id from public.users where role = 'company_admin' and tenant_id is not null limit 1`)
  if (!admin) throw new Error('لا مدير منصة — تعذّر الإثبات')

  // RLS applies to the table owner only when forced, and this connection is the
  // owner. Without this the probe would prove nothing about policies at all.
  await c.query('set local role authenticated')

  const row = (dataset, cr, name) => ({
    dataset_id: dataset, snapshot_period: 'فحص', cr_number: cr, name,
  })
  const insert = (r) => c.query(
    `insert into public.government_company_registry
       (dataset_id, snapshot_period, cr_number, name)
     values ($1, $2, $3, $4)`,
    [r.dataset_id, r.snapshot_period, r.cr_number, r.name])

  // --- Who may write ---------------------------------------------------------
  if (member) {
    await asUser(member.id)
    await refuses('حساب شركة لا يستطيع الكتابة',
      () => insert(row(Q2, '9990001', 'محاولة')), 'policy')
  }

  await c.query(`select set_config('request.jwt.claims', '{}', true)`)
  await refuses('ولا يستطيع مجهول',
    () => insert(row(Q2, '9990002', 'محاولة')), 'policy')

  await asUser(admin.id)
  await insert(row(Q2, '9990003', 'شركة فحص السجل الحكومي'))
  ok('المدير يكتب', true)

  // --- The same company in two quarters ---------------------------------------
  await insert(row(Q3, '9990003', 'شركة فحص السجل الحكومي'))
  const { rows: [both] } = await c.query(
    `select count(*)::int n from public.government_company_registry where cr_number = '9990003'`)
  ok('نفس الشركة تظهر في ربعين مختلفين', both.n === 2,
    `${both.n} صف — اللقطتان اندمجتا وضاع التاريخ`)

  // --- And only once per quarter -----------------------------------------------
  await refuses('ولا تتكرّر داخل الربع الواحد',
    () => insert(row(Q2, '9990003', 'مرة ثانية')), 'duplicate')

  // --- Who may read --------------------------------------------------------------
  if (member) {
    await asUser(member.id)
    const { rows: seen } = await c.query(
      `select id from public.government_company_registry where cr_number = '9990003'`)
    ok('حساب شركة يقرأ السجل', seen.length === 2, `رأى ${seen.length}`)
  }

  // --- Marsad is not the register ------------------------------------------------
  await c.query('reset role')
  const { rows: [link] } = await c.query(`
    select count(*)::int n from information_schema.columns
     where table_name = 'companies' and column_name = 'government_company_id'`)
  ok('companies تحمل رابطاً للسجل الحكومي', link.n === 1)

  const { rows: [added] } = await c.query(`
    select count(*)::int n from public.companies where government_company_id is not null`)
  ok('ولا شركة أُنشئت من الاستيراد وحده', added.n === 0,
    `${added.n} شركة — الاستيراد يجب ألا ينشئ شركات في مرصد`)

} finally {
  await c.query('rollback').catch(() => {})
  await c.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — السجل الحكومي مقروء للجميع، مكتوب للإدارة\n`)
process.exit(fail ? 1 : 0)
