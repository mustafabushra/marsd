#!/usr/bin/env node
/**
 * Do the five report/search functions return the right answers?
 *
 * They all parsed and all failed at run time — three trust-report panels and
 * search itself. Running is not the same as being right, so every check here
 * compares the function's answer against the tables it claims to summarise,
 * under the same role and claims PostgREST sets for a signed-in request.
 *
 * Usage: node scripts/probe-search.mjs
 */

import { readFileSync } from 'node:fs'
import pg from 'pg'

const url = readFileSync('.env.migrations', 'utf8').split('\n')
  .find((l) => l.trim().startsWith('DATABASE_URL=')).split('=').slice(1).join('=').trim()
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()

let fail = 0
const ok = (label, pass, note = '') => {
  console.log(`  ${pass ? '✅' : '❌'} ${label}${note ? ' · ' + note : ''}`)
  if (!pass) fail++
}
const q = async (sql, args) => (await c.query(sql, args)).rows

const [admin] = await q("select id from public.users where role = 'platform_admin' limit 1")
// The company with the most approved reports, so the summaries have something
// to be wrong about.
const [co] = await q(`
  select c.id, c.name, c.cr_number, count(r.id)::int as n
    from public.companies c
    left join public.reports r on r.target_company_id = c.id and r.status = 'approved'
   where c.approved
   group by c.id, c.name, c.cr_number
   order by n desc limit 1`)

console.log(`\n  ${co.name}  ·  ${co.n} تقرير معتمد\n`)

const asAdmin = async (fn) => {
  await c.query('begin')
  await c.query('set local role authenticated')
  await c.query('select set_config($1, $2, true)',
    ['request.jwt.claims', JSON.stringify({ sub: admin.id, role: 'authenticated' })])
  try { return await fn() } finally { await c.query('rollback') }
}

await asAdmin(async () => {
  // ---- 1) why companies get reported --------------------------------------
  try {
    const rows = await q('select * from public.get_company_reports_summary($1)', [co.id])
    const total = rows.reduce((s, r) => s + r.count, 0)
    const [{ n }] = await q(`select count(*)::int as n from public.reports
                              where target_company_id = $1 and status = 'approved'
                                and category is not null`, [co.id])
    ok('get_company_reports_summary', total === n, `${rows.length} فئة · ${total} من ${n}`)
    if (rows.length) {
      ok('  لكل فئة أيقونة ولون', rows.every((r) => r.icon && r.color), rows[0].category)
      ok('  الأكثر أولًا', rows.every((r, i) => i === 0 || rows[i - 1].count >= r.count))
    }
  } catch (e) { ok('get_company_reports_summary', false, e.message.split('\n')[0]) }

  // ---- 2) the last reports ------------------------------------------------
  try {
    const rows = await q('select * from public.get_company_reports_timeline($1, 5)', [co.id])
    ok('get_company_reports_timeline', true, `${rows.length} صف`)
    if (rows.length) {
      const [real] = await q('select description, category from public.reports where id = $1', [rows[0].id])
      ok('  summary هو description الحقيقي', rows[0].summary === real.description)
      ok('  severity هو category الحقيقي', rows[0].severity === real.category)
      ok('  الأحدث أولًا',
        rows.every((r, i) => i === 0 || rows[i - 1].created_at >= r.created_at))
      ok('  لا اسم مُبلِّغ فارغ', rows.every((r) => !!r.reporter_company_name))
    }
    const capped = await q('select * from public.get_company_reports_timeline($1, 9999)', [co.id])
    ok('  الحدّ الأعلى مقيَّد', capped.length <= 100, `${capped.length}`)
  } catch (e) { ok('get_company_reports_timeline', false, e.message.split('\n')[0]) }

  // ---- 3) reports per month ----------------------------------------------
  try {
    const rows = await q('select * from public.get_company_trends($1)', [co.id])
    ok('get_company_trends', true, `${rows.length} شهر`)
    if (rows.length) {
      ok('  الاتجاه من قيم معروفة', rows.every((r) => ['up', 'down', 'flat'].includes(r.trend_direction)))
      ok('  أول شهر بلا مقارنة = flat', rows[0].trend_direction === 'flat')
      ok('  الشهور تصاعديًا', rows.every((r, i) => i === 0 || rows[i - 1].period_month < r.period_month))
      const [{ n }] = await q(`select count(*)::int as n from public.reports
                                where target_company_id = $1 and status = 'approved'
                                  and created_at >= date_trunc('month', now()) - interval '11 months'`, [co.id])
      ok('  المجموع يطابق الجدول', rows.reduce((s, r) => s + r.approved_reports, 0) === n)
    }
  } catch (e) { ok('get_company_trends', false, e.message.split('\n')[0]) }

  // ---- 4) search ----------------------------------------------------------
  try {
    const rows = await q('select * from public.search_companies_fts($1, 20, 0)', [co.name.slice(0, 4)])
    ok('search_companies_fts', rows.some((r) => r.id === co.id), `${rows.length} نتيجة`)

    const byCr = await q('select * from public.search_companies_fts($1, 20, 0)', [co.cr_number])
    ok('  البحث بالسجل التجاري يضعها أولًا', byCr[0]?.id === co.id, `${byCr.length} نتيجة`)

    const [{ n: approved }] = await q('select count(*)::int as n from public.companies where approved')
    const all = await q("select * from public.search_companies_fts('', 100, 0)")
    ok('  لا تُعيد غير المعتمدة', all.length <= approved, `${all.length} من ${approved}`)

    const p1 = await q("select * from public.search_companies_fts('ا', 2, 0)")
    const p2 = await q("select * from public.search_companies_fts('ا', 2, 2)")
    ok('  الترقيم يُزيح فعلًا', !p1.length || !p2.length || p1[0].id !== p2[0].id)
  } catch (e) { ok('search_companies_fts', false, e.message.split('\n')[0]) }

  // ---- 5) autocomplete ----------------------------------------------------
  try {
    const rows = await q('select * from public.autocomplete_companies($1, 10)', [co.name.slice(0, 3)])
    ok('autocomplete_companies', rows.length > 0, `${rows.length} اقتراح`)
    ok('  الأقصر أولًا', rows.every((r, i) => i === 0 || rows[i - 1].name.length <= r.name.length))
    const capped = await q("select * from public.autocomplete_companies('ا', 9999)")
    ok('  الحدّ الأعلى مقيَّد', capped.length <= 25, `${capped.length}`)
  } catch (e) { ok('autocomplete_companies', false, e.message.split('\n')[0]) }
})

// ---- with no session at all -----------------------------------------------
// 059 closed the registry to anonymous callers. Rewriting these five must not
// have reopened it — that is exactly how 062 leaked.
console.log('')
await c.query('begin')
await c.query('set local role authenticated')
await c.query("select set_config('request.jwt.claims', '', true)")
for (const [fn, args] of [
  ['public.search_companies_fts($1, 5, 0)', ['ا']],
  ['public.autocomplete_companies($1, 5)', ['ا']],
  ['public.get_company_reports_summary($1)', [co.id]],
  ['public.get_company_reports_timeline($1, 5)', [co.id]],
  ['public.get_company_trends($1)', [co.id]],
]) {
  let n = -1
  try { n = (await c.query(`select * from ${fn}`, args)).rows.length } catch { n = 0 }
  ok(`مغلق بلا جلسة · ${fn.split('(')[0].replace('public.', '')}`, n === 0, n > 0 ? `سرّب ${n} صف` : '')
}
await c.query('rollback')

// ---- and anon has no grant at all -----------------------------------------
const grants = await q(`
  select p.proname, r.rolname
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace and ns.nspname = 'public'
    cross join lateral aclexplode(p.proacl) a
    join pg_roles r on r.oid = a.grantee
   where p.proname in ('search_companies_fts','autocomplete_companies',
                       'get_company_reports_summary','get_company_reports_timeline',
                       'get_company_trends')
     and a.privilege_type = 'EXECUTE'
     and r.rolname in ('anon','PUBLIC')`)
ok('لا صلاحية تنفيذ لـ anon', grants.length === 0,
   grants.map((g) => `${g.proname}→${g.rolname}`).join(', '))

console.log(fail ? `\n  ❌ ${fail} فحص فشل\n` : '\n  ✅ الخمس تعمل وتُطابق الجداول\n')
await c.end()
process.exit(fail ? 1 : 0)
