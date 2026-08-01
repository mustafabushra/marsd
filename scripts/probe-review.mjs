#!/usr/bin/env node
/**
 * Can Marsad actually review a report?
 *
 * It could not, for the platform's whole life. reports had one UPDATE policy —
 * a company editing its own draft — and no clause for a reviewer or a platform
 * administrator, so approving, rejecting and asking for more information were
 * all impossible. None of them looked impossible: the UPDATE matched no rows,
 * raised nothing, and /admin/reports reported success and paid the credits.
 *
 * So this checks the three actions by reading the row back, and checks the
 * things that must stay refused — a company approving its own report, and a
 * reviewer editing the substance of one instead of ruling on it.
 *
 * Everything runs inside a transaction that is rolled back.
 *
 * Usage: node scripts/probe-review.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split('\n')
  .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim()
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let failures = 0
const ok = (m) => console.log(`  ✅ ${m}`)
const bad = (m) => { console.log(`  ❌ ${m}`); failures++ }

const as = async (id) => {
  await c.query('set local role postgres')
  await c.query('set local role authenticated')
  await c.query('select set_config($1, $2, true)',
    ['request.jwt.claims', JSON.stringify({ sub: id, role: 'authenticated' })])
}
const asService = async () => {
  await c.query('set local role postgres')
  await c.query("select set_config('request.jwt.claims', '', true)")
}

const { rows: [admin] } = await c.query(
  "select id, email from public.users where role = 'platform_admin' and status = 'active' limit 1")
const { rows: [reporter] } = await c.query(`
  select t.id as tenant_id, t.name,
         (select u.id from public.users u where u.tenant_id = t.id and u.status = 'active' limit 1) as user_id
    from public.tenants t
   where t.status = 'active'
     and exists (select 1 from public.users u where u.tenant_id = t.id and u.status = 'active')
   limit 1`)
// A company this tenant has not reported on recently. prevent_duplicate_reports
// refuses a second report on the same company inside 90 days, so taking the
// first row made the probe fail the moment real data happened to use that pair —
// which is exactly what 067 produced when it corrected eight reports. The probe
// was picking a fixture that the platform's own rules forbid.
const { rows: [target] } = await c.query(`
  select c.id from public.companies c
   where c.approved
     and not exists (
       select 1 from public.reports r
        where r.target_company_id = c.id
          and r.reporter_tenant_id = $1
          and r.created_at > now() - interval '90 days')
   limit 1`, [reporter.tenant_id])

if (!admin || !reporter?.user_id || !target) {
  console.error('\n  يلزم مدير منصة، وكيان بمستخدم، وشركة.\n'); await c.end(); process.exit(1)
}

console.log(`\n  إدارة مرصد: ${admin.email}`)
console.log(`  الشركة المُبلِّغة: ${reporter.name}\n`)

await c.query('begin')

// A fresh report in review, so the probe never depends on the queue's contents.
const newReport = async () => {
  await asService()
  const { rows: [r] } = await c.query(`
    insert into public.reports (reporter_tenant_id, target_company_id, status, dealt_at, payment_commitment, delay_days)
    values ($1, $2, 'pending_review', now() - interval '30 days', 'late', 12)
    returning id`, [reporter.tenant_id, target.id])
  return r.id
}

const statusOf = async (id) => {
  await asService()
  const { rows: [r] } = await c.query('select status from public.reports where id = $1', [id])
  return r?.status
}

// The row count is the whole point: this is exactly what the screen trusted and
// what silently returned zero for months.
const decide = async (label, id, sql, expected) => {
  await as(admin.id)
  let rowCount = 0, why = ''
  try {
    ;({ rowCount } = await c.query(sql, [id]))
  } catch (e) { why = ' — ' + e.message.split('\n')[0] }
  const after = await statusOf(id)
  rowCount > 0 && after === expected
    ? ok(`${label}: ${rowCount} صف · الحالة الآن ${after}`)
    : bad(`${label}: ${rowCount} صف · الحالة ${after}${why}`)
}

await decide('اعتماد التقرير', await newReport(),
  "update public.reports set status = 'approved', approved_at = now() where id = $1", 'approved')

await decide('رفض التقرير', await newReport(),
  "update public.reports set status = 'rejected', rejected_at = now(), rejection_reason = 'فحص آلي' where id = $1", 'rejected')

await decide('طلب توضيح', await newReport(),
  "update public.reports set status = 'request_info' where id = $1", 'request_info')

// ── what must stay refused ──────────────────────────────────────────────────
console.log('')
const rid = await newReport()

const refused = async (label, who, sql) => {
  await as(who)
  await c.query('savepoint s')
  let allowed = false, why = ''
  try {
    const { rowCount } = await c.query(sql, [rid])
    allowed = rowCount > 0
  } catch (e) { why = ' — ' + e.message.split('\n')[0] }
  await c.query('rollback to savepoint s')
  allowed ? bad(`${label}: مسموح!`) : ok(`${label}: مرفوض${why}`)
}

await refused('الشركة تعتمد تقريرها بنفسها', reporter.user_id,
  "update public.reports set status = 'approved' where id = $1")

await refused('المراجع يغيّر مبلغ التعامل', admin.id,
  'update public.reports set deal_value = 999999 where id = $1')

await refused('المراجع يغيّر حالة السداد', admin.id,
  "update public.reports set payment_commitment = 'full' where id = $1")

await refused('المراجع ينقل التقرير لشركة أخرى', admin.id,
  'update public.reports set target_company_id = (select id from public.companies offset 1 limit 1) where id = $1')

await c.query('rollback')

await asService()
const { rows: [{ count }] } = await c.query(
  "select count(*) from public.reports where rejection_reason = 'فحص آلي'")
console.log(`\n  بعد التراجع: ${count} تقرير من الفحص (يجب أن يكون 0)`)

await c.end()
console.log(failures ? `\n  ❌ ${failures} إخفاق\n` : '\n  ✅ مرصد تراجع التقارير، والمراجعة تُغيّر الحالة لا المحتوى\n')
process.exit(failures ? 1 : 0)
