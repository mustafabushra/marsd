#!/usr/bin/env node
/**
 * Suspending contribution: does it actually stop a report, and does it stop
 * only that?
 *
 * The point of this lever is that it is narrower than suspending an account. If
 * it also blocked searching, or watching, or anything else the company pays for,
 * it would be the blunt instrument it exists to replace — so the probe checks
 * what still works as carefully as what stops.
 *
 * Everything runs inside a transaction that is rolled back.
 *
 * Usage: node scripts/probe-contributor-control.mjs
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

const { rows: [reporter] } = await c.query(`
  select t.id as tenant_id, t.name,
         (select u.id from public.users u
           where u.tenant_id = t.id and u.status = 'active'
           order by (u.role <> 'company_admin') limit 1) as user_id
    from public.tenants t
   where t.status = 'active'
     and exists (select 1 from public.users u
                  where u.tenant_id = t.id and u.status = 'active' and u.role = 'company_admin')
   limit 1`)
const { rows: [admin] } = await c.query(
  "select id, email from public.users where role = 'platform_admin' and status = 'active' limit 1")

if (!reporter?.user_id || !admin) {
  console.error('\n  يلزم كيان بمستخدم نشط، ومدير منصة.\n'); await c.end(); process.exit(1)
}

console.log(`\n  الشركة المُبلِّغة: ${reporter.name}`)
console.log(`  إدارة مرصد: ${admin.email}\n`)

await c.query('begin')

const freshTarget = async () => {
  const { rows } = await c.query(`
    select co.id from public.companies co
     where not exists (
       select 1 from public.reports r
        where r.target_company_id = co.id and r.reporter_tenant_id = $1
          and r.created_at > now() - interval '90 days')
     limit 1`, [reporter.tenant_id])
  return rows[0]?.id
}

const fileReport = async () => {
  const target = await freshTarget()
  if (!target) return { ok: false, why: 'لا توجد شركة صالحة' }
  await c.query('savepoint s')
  try {
    await c.query(
      'insert into public.reports (reporter_tenant_id, target_company_id, dealt_at) values ($1, $2, now())',
      [reporter.tenant_id, target])
    await c.query('rollback to savepoint s')
    return { ok: true }
  } catch (e) {
    await c.query('rollback to savepoint s')
    return { ok: false, why: e.message.split('\n')[0] }
  }
}

// ── before ──────────────────────────────────────────────────────────────────
await as(reporter.user_id)
const before = await fileReport()
before.ok ? ok('قبل الإيقاف: تستطيع تقديم تقرير') : bad(`قبل الإيقاف: لا تستطيع — ${before.why}`)

// ── Marsad suspends contribution ────────────────────────────────────────────
// Suspend before testing the lift. The first version of this probe tried to set
// reporting_suspended to false while it was already false — no column changed,
// so the guard had nothing to object to and the row updated. It reported a hole
// that was not there, which is the same shape of error as reporting one that is.
await as(admin.id)
const { rowCount: suspended } = await c.query(`
  update public.tenants
     set reporting_suspended = true,
         reporting_suspended_reason = 'بلاغات كيدية متكرّرة — فحص آلي',
         reporting_suspended_at = now(),
         reporting_suspended_by = $2
   where id = $1`, [reporter.tenant_id, admin.id])
suspended > 0 ? ok('إدارة مرصد توقف التقارير') : bad('الإيقاف لم يُحفظ')

// ── the company cannot lift it ──────────────────────────────────────────────
await as(reporter.user_id)
await c.query('savepoint s')
let lifted = false, liftWhy = ''
try {
  const { rowCount } = await c.query(
    'update public.tenants set reporting_suspended = false where id = $1', [reporter.tenant_id])
  lifted = rowCount > 0
} catch (e) { liftWhy = ' — ' + e.message.split('\n')[0] }
await c.query('rollback to savepoint s')
lifted ? bad('الشركة ترفع الإيقاف عن نفسها!') : ok(`الشركة لا ترفع الإيقاف${liftWhy}`)

// Its own name is still its own to edit — the lever must not lock the row.
await c.query('savepoint s')
const { rowCount: ownName } = await c.query(
  'update public.tenants set phone = phone where id = $1', [reporter.tenant_id])
ownName > 0 ? ok('الشركة ما زالت تعدّل بياناتها العادية') : bad('الشركة لم تعد تعدّل بياناتها إطلاقاً')
await c.query('rollback to savepoint s')

// ── after: reporting stops ──────────────────────────────────────────────────
console.log('')
await as(reporter.user_id)
const after = await fileReport()
after.ok
  ? bad('بعد الإيقاف: ما زالت تستطيع تقديم تقرير!')
  : ok(`بعد الإيقاف: مرفوض — ${after.why}`)

// ── and only reporting stops ────────────────────────────────────────────────
// This is the whole reason the lever exists. If it took anything else with it,
// it would be the account suspension it was meant to replace.
const stillWorks = async (label, sql, params) => {
  await c.query('savepoint s')
  let worked = false, why = ''
  try {
    const { rows, rowCount } = await c.query(sql, params)
    worked = (rows?.length ?? rowCount) > 0
  } catch (e) { why = ' — ' + e.message.split('\n')[0] }
  await c.query('rollback to savepoint s')
  worked ? ok(`${label}: ما زال يعمل`) : bad(`${label}: توقّف أيضاً${why}`)
}

await stillWorks('البحث عن الشركات', 'select id from public.companies limit 1')
await stillWorks('قراءة تقاريرها السابقة',
  'select id from public.reports where reporter_tenant_id = $1 limit 1', [reporter.tenant_id])
await stillWorks('إضافة شركة للمراقبة', `
  insert into public.watchlist_items (tenant_id, company_id)
  select $1, co.id from public.companies co
   where not exists (select 1 from public.watchlist_items w
                      where w.tenant_id = $1 and w.company_id = co.id)
   limit 1 returning id`, [reporter.tenant_id])

// ── the signals ─────────────────────────────────────────────────────────────
console.log('')
await as(admin.id)
const { rows: [{ contributor_risk: risk }] } = await c.query(
  'select public.contributor_risk($1)', [reporter.tenant_id])
console.log(`  سجل ${risk.tenant.name}:`)
console.log(`    ${risk.reports.total} تقرير · ${risk.reports.approved} معتمد · ${risk.reports.rejected} مرفوض · ${risk.reports.overturned} سُحب بعد اعتراض`)
console.log(`    أكثر أسبوع: ${risk.patterns.max_reports_in_a_week} تقارير · نفس القطاع: ${risk.patterns.same_sector}`)
console.log(`    مؤشرات تستحق النظر: ${risk.flag_count}`)
for (const f of risk.flags || []) console.log(`      ⚠ ${f}`)
risk.tenant.reporting_suspended ? ok('السجل يعكس الإيقاف') : bad('السجل لا يعكس الإيقاف')

await as(reporter.user_id)
await c.query('savepoint s')
try {
  await c.query('select public.contributor_risk($1)', [reporter.tenant_id])
  bad('الشركة تقرأ سجل المخاطر الخاص بها!')
} catch { ok('الشركة لا تقرأ سجل المخاطر') }
await c.query('rollback to savepoint s')

await c.query('rollback')

await asService()
const { rows: [t] } = await c.query(
  'select reporting_suspended from public.tenants where id = $1', [reporter.tenant_id])
console.log(`\n  بعد التراجع: إيقاف التقارير = ${t.reporting_suspended} (كما كان)`)

await c.end()
console.log(failures ? `\n  ❌ ${failures} إخفاق\n` : '\n  ✅ الإيقاف يمنع التقارير وحدها، والسجل لإدارة مرصد وحدها\n')
process.exit(failures ? 1 : 0)
