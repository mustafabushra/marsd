#!/usr/bin/env node
/**
 * Can a company find out who reported on it?
 *
 * It could. `get_company_reports_timeline` is SECURITY DEFINER, granted to
 * `authenticated`, and returned the reporting company's name with no check on
 * who was asking — while the same report printed «لا تُعرض أسماء الشركات
 * المبلّغة في أي موضع من هذا التقرير» three panels below it.
 *
 * This is the check that makes the promise real. It runs as an ordinary company
 * and as Marsad, and asserts the opposite outcome for each: a platform where
 * reporters can be identified by the companies they reported on stops receiving
 * honest reports, because the cost of filing becomes retaliation.
 *
 * It also asks the question the UI cannot: the name must not leave the
 * database. Hiding it in the browser would leave the API answering it to
 * anyone who called the RPC directly.
 *
 *   node scripts/probe-reporter-privacy.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let failed = 0
const check = (ok, name, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const asUser = async (userId, fn) => {
  await c.query('begin')
  await c.query("select set_config('role', 'authenticated', true)")
  await c.query("select set_config('request.jwt.claims', $1, true)",
    [JSON.stringify({ sub: userId, role: 'authenticated' })])
  try { return await fn() } finally { await c.query('rollback') }
}

try {
  const { rows: [target] } = await c.query(
    `select target_company_id as id from public.reports where status = 'approved' limit 1`)
  if (!target) { console.log('  ⚠️  لا تقارير معتمدة — لا يمكن الفحص'); process.exit(0) }

  const { rows: [plain] } = await c.query(
    `select id, email from public.users
      where coalesce(role, '') not in ('platform_admin', 'reviewer') limit 1`)
  const { rows: [staff] } = await c.query(
    `select id, email from public.users where role = 'platform_admin' limit 1`)

  // Every real company name, so a leak can be detected whatever shape it takes.
  const { rows: names } = await c.query('select name from public.companies')
  const real = new Set(names.map((r) => r.name).filter(Boolean))

  // ---- as an ordinary company --------------------------------------------
  if (plain) {
    console.log(`  كشركة: ${plain.email}`)
    const rows = await asUser(plain.id, async () => {
      // The timeline is behind the plan now (migration 108): it answers only
      // once the lookup has been recorded and charged. This probe used to read
      // it cold and got rows, because nothing was enforcing anything. Opening
      // the report first is what the page does, and reading it without doing so
      // is no longer a thing a customer can do — so measuring that would be
      // measuring a path that does not exist.
      await c.query('select public.open_company_report($1)', [target.id])
      const { rows: r } = await c.query(
        'select * from public.get_company_reports_timeline($1, 100)', [target.id])
      return r
    })

    check(rows.length > 0, 'الشركة ما زالت ترى التقارير', 'العرض انكسر بدل أن يُحجب الاسم')

    const leaked = rows.filter((r) => real.has(r.reporter_company_name))
    check(leaked.length === 0, 'لا اسم شركة حقيقية في أي صف',
      leaked.map((r) => r.reporter_company_name).join('، '))

    check(rows.every((r) => r.reporter_is_visible === false),
      'الهوية معلَّمة كمحجوبة في كل صف')

    check(rows.every((r) => r.reporter_sector),
      'القطاع يُعاد بدلاً من الاسم')

    // The withheld value must say it is withheld. An empty string reads as
    // missing data, and a reader would think the record was incomplete rather
    // than that the identity is protected.
    check(rows.every((r) => (r.reporter_company_name || '').includes('محجوبة')),
      'القيمة المحجوبة تقول إنها محجوبة',
      rows[0]?.reporter_company_name)
  }

  // ---- as Marsad ----------------------------------------------------------
  if (staff) {
    console.log(`  كفريق مرصد: ${staff.email}`)
    const rows = await asUser(staff.id, async () => {
      const { rows: r } = await c.query(
        'select * from public.get_company_reports_timeline($1, 100)', [target.id])
      return r
    })

    check(rows.every((r) => r.reporter_is_visible === true),
      'فريق مرصد يرى الهوية',
      'بدونها لا يمكن كشف بلاغ كيدي من منافس')

    // At least one row must carry a real name — a reviewer who sees the same
    // placeholder as everyone else cannot arbitrate a dispute.
    check(rows.some((r) => real.has(r.reporter_company_name)),
      'الاسم الحقيقي يصل لفريق مرصد')
  } else {
    console.log('  ⚠️  لا حساب مدير منصة — تخطّي فحص جانب مرصد')
  }

  // ---- and the screen must not contradict the database --------------------
  // Read across the page and every report component: the timeline markup moved
  // into ReportTimeline.jsx, and a check that only looks where the code used to
  // be reports a failure about code that is correct.
  const { readdirSync } = await import('node:fs')
  const files = [
    'src/pages/TrustReport.jsx',
    ...readdirSync('src/components/report').map((f) => `src/components/report/${f}`),
  ]
  const src = files.map((f) => readFileSync(f, 'utf8')).join('\n')

  // The name may appear only behind the flag the database sets.
  const namedUnguarded = /\{\s*report\.reporter_company_name\s*\}/.test(src)
    && !/reporter_is_visible/.test(src)
  check(!namedUnguarded, 'الاسم لا يُطبع إلا خلف reporter_is_visible')
  check(/reporter_sector/.test(src), 'الشاشة تعرض القطاع')

} finally {
  await c.query('rollback').catch(() => {})
  await c.end()
}

console.log(failed ? `\n  ❌ ${failed} فحص فشل\n` : '\n  ✅ كل الفحوصات نجحت\n')
process.exit(failed ? 1 : 0)
