#!/usr/bin/env node
/**
 * One search, two registries, and no company found twice.
 *
 * Marsad's rows come first — they are the ones with reports and a score, the
 * answer somebody searching Marsad usually wants. Government rows fill in what
 * Marsad does not have.
 *
 * The two things that would make it useless are both about repetition: a
 * company Marsad tracks appearing again as a government row, and a company
 * appearing once per published quarter. Both are checked here, because both
 * pass a naive `union all` without complaint.
 *
 *   node scripts/probe-unified-search.mjs
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
  const sp = `u${(mark += 1)}`
  await c.query(`savepoint ${sp}`)
  try { await fn(); await c.query(`release savepoint ${sp}`); fail += 1; console.log(`  ❌ ${n} — لم يُرفض`) }
  catch (e) {
    await c.query(`rollback to savepoint ${sp}`)
    const m = !expect || e.message.includes(expect)
    if (m) { pass += 1; console.log(`  ✅ ${n}`) } else { fail += 1; console.log(`  ❌ ${n} — ${e.message.slice(0, 60)}`) }
  }
}
const asUser = (id) => c.query(`select set_config('request.jwt.claims', $1, true)`,
  [JSON.stringify({ sub: id, role: 'authenticated' })])
const search = async (q) => (await c.query('select * from public.search_companies_unified($1, 50)', [q])).rows

const Q2 = 'aaaaaaaa-0000-0000-0000-000000000002'
const Q3 = 'aaaaaaaa-0000-0000-0000-000000000003'

try {
  await c.query('begin')
  const { rows: [me] } = await c.query(
    `select id from public.users where tenant_id is not null limit 1`)
  if (!me) throw new Error('لا مستخدم — تعذّر الإثبات')

  const stamp = Date.now().toString().slice(-6)
  const CR_BOTH = `77${stamp}1`   // في مرصد وفي السجل
  const CR_GOV = `77${stamp}2`    // في السجل وحده

  await c.query(`insert into public.companies (name, cr_number, source, status, approved)
                 values ('شركة الفحص الموحّد', $1, 'community', 'active', true)`, [CR_BOTH])

  // Q3 is loaded first, deliberately. «Most recent» must mean the quarter the
  // data describes, not the order we happened to load the files in — catching up
  // on a missed quarter must not make it look like the newest.
  for (const [ds, period, at] of [[Q3, 'الربع الثالث', '2026-09-30'], [Q2, 'الربع الثاني', '2026-06-30']]) {
    await c.query(`insert into public.government_company_registry
                     (dataset_id, snapshot_period, snapshot_at, cr_number, name)
                   values ($1, $2, $3, $4, 'شركة الفحص الموحّد')`, [ds, period, at, CR_BOTH])
    await c.query(`insert into public.government_company_registry
                     (dataset_id, snapshot_period, snapshot_at, cr_number, name)
                   values ($1, $2, $3, $4, 'منشأة حكومية فقط')`, [ds, period, at, CR_GOV])
  }

  // --- Signing in ---------------------------------------------------------------
  await c.query(`select set_config('request.jwt.claims', '{}', true)`)
  await refuses('البحث يلزمه تسجيل دخول', () => search('شركة'), 'تسجيل الدخول')

  await asUser(me.id)

  // --- Marsad first ---------------------------------------------------------------
  const r = await search('شركة الفحص الموحّد')
  ok('يجد الشركة', r.length > 0)
  ok('نتيجة مرصد أولاً', r[0]?.origin === 'marsad', `الأولى «${r[0]?.origin}»`)
  ok('ومعلَّمة أنها في مرصد', r[0]?.in_marsad === true)

  // --- Not twice ------------------------------------------------------------------
  const dupes = r.filter((x) => x.cr_number === CR_BOTH)
  ok('الشركة التي في مرصد لا تظهر مرة ثانية كحكومية', dupes.length === 1,
    `${dupes.length} نتيجة لنفس السجل`)

  // --- The register fills the gap ----------------------------------------------------
  const g = await search('منشأة حكومية فقط')
  ok('يجد ما ليس في مرصد', g.length > 0)
  ok('ومعلَّمة أنها حكومية', g[0]?.origin === 'government' && g[0]?.in_marsad === false)

  // Once, not once per quarter.
  ok('ربع واحد فقط، لا كل الأرباع', g.filter((x) => x.cr_number === CR_GOV).length === 1,
    `${g.filter((x) => x.cr_number === CR_GOV).length} نتيجة`)
  ok('وهو الأحدث', g[0]?.snapshot_period === 'الربع الثالث', `جاء «${g[0]?.snapshot_period}»`)

  // --- By number ----------------------------------------------------------------------
  ok('البحث برقم السجل', (await search(CR_GOV)).some((x) => x.cr_number === CR_GOV))
  ok('ورقم بمسافات وشرطات', (await search(`${CR_GOV.slice(0, 3)}-${CR_GOV.slice(3)} `))
    .some((x) => x.cr_number === CR_GOV))
  ok('وبأرقام عربية',
    (await search(CR_GOV.replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)))))
      .some((x) => x.cr_number === CR_GOV))

  ok('واستعلام فارغ لا يُرجع شيئاً', (await search('   ')).length === 0)

} finally {
  await c.query('rollback').catch(() => {})
  await c.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — بحث واحد، سجلّان، ولا تكرار\n`)
process.exit(fail ? 1 : 0)
