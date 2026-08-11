#!/usr/bin/env node
/**
 * One search box over two registers.
 *
 * The rule it has to hold: a name, a commercial registration number or a
 * unified number, asked once, answered from Marsad and from the Ministry's
 * published generation at the same time. A company Marsad already holds opens.
 * One that exists only in the national register is brought into Marsad from the
 * official record, and can then take documents and reports.
 *
 * And the line that is easy to blur and expensive to get wrong: the Ministry's
 * data identifies a company, it does not stand in for its paperwork. A company
 * brought in this way must still show its documents as outstanding — otherwise
 * importing the register would silently mark two million companies as having
 * filed papers none of them sent.
 *
 * Anything this creates is removed.
 *
 *   node scripts/probe-unified-search.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4399'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()

let pass = 0
let fail = 0
const ok = (n, c, d = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

const PROBE = 'search_probe_admin'
const browser = await chromium.launch()
let promoted = null

const asAdmin = async (sql, args) => {
  await db.query('begin')
  await db.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: PROBE })])
  try {
    const r = await db.query(sql, args)
    await db.query('rollback')
    return r.rows
  } catch (e) { await db.query('rollback'); throw e }
}

try {
  await db.query(
    `insert into public.users (id, email, role)
     values ($1, 'search-probe@marsad.test', 'platform_admin')
     on conflict (id) do update set role = 'platform_admin'`, [PROBE])

  // A registry row that Marsad does not already hold.
  const { rows: [g] } = await db.query(
    `select r.id, r.name, r.cr_number, r.unified_number
       from public.government_company_registry r
      where r.dataset_id = public.published_registry_dataset()
        and coalesce(btrim(r.cr_number),'') <> ''
        and coalesce(btrim(r.unified_number),'') <> ''
        and not exists (select 1 from public.companies c
                         where c.cr_number = btrim(r.cr_number)
                            or c.unified_number = btrim(r.unified_number))
      limit 1`)
  if (!g) throw new Error('لا سجل حكومي غير مضاف لاختباره')

  const { rows: [m] } = await db.query(
    `select id, name, cr_number from public.companies
      where status = 'active' and coalesce(btrim(cr_number),'') <> '' limit 1`)

  // ===== The three ways of asking =====
  console.log('\n─── يبحث بالثلاثة ───')
  const hits = async (q) => asAdmin('select origin, id, name from public.search_companies_unified($1, 30)', [q])

  const byName = await hits(g.name.slice(0, 14))
  ok('بالاسم يجد السجل الحكومي', byName.some((r) => r.id === g.id), `${byName.length} نتيجة`)

  const byCr = await hits(g.cr_number)
  ok('برقم السجل التجاري', byCr.some((r) => r.id === g.id), `${byCr.length} نتيجة`)

  const byUnified = await hits(g.unified_number)
  ok('وبالرقم الموحّد', byUnified.some((r) => r.id === g.id), `${byUnified.length} نتيجة`)

  // Arabic-Indic digits are what a phone keyboard produces.
  const arabicDigits = g.cr_number.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d])
  const byArabic = await hits(arabicDigits)
  ok('وبالأرقام العربية الهندية', byArabic.some((r) => r.id === g.id), arabicDigits)

  // ===== Both registers, at once =====
  console.log('\n─── المصدران معاً ───')
  if (m) {
    const both = await hits(m.cr_number)
    ok('شركة مرصد تظهر بمصدر «marsad»',
      both.some((r) => r.id === m.id && r.origin === 'marsad'))
  }
  ok('وسجل الوزارة يظهر بمصدر «registry»',
    byCr.some((r) => r.id === g.id && r.origin === 'registry'))

  // Not twice: a company held by both must appear once, as Marsad's.
  const dupes = byCr.filter((r) => r.origin === 'registry')
    .filter((r) => byCr.some((x) => x.origin === 'marsad' && x.name === r.name))
  ok('ولا يظهر السجل مكرّراً حين تملكه مرصد', dupes.length === 0, `${dupes.length} مكرّر`)

  // ===== In the browser =====
  console.log('\n─── من الشاشة ───')
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 150)))
  await signIn(page, BASE, { role: 'platform_admin' })
  await page.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded', timeout: 40000 })
  await page.waitForTimeout(2500)

  // By its accessible name. The element carries no `type`, so a
  // `input[type="text"]` selector matches nothing — the attribute selector
  // wants the attribute to be there, and a bare <input> only defaults to text.
  const box = page.getByRole('textbox', { name: /رقم السجل التجاري/ }).first()
  await box.fill(g.cr_number)
  await box.press('Enter')
  await page.waitForTimeout(4000)
  const body = await page.locator('#main').innerText()
  ok('البحث برقم السجل يعرض الشركة', body.includes(g.name.slice(0, 12)), body.slice(0, 110))
  ok('ويُعلَّم أنها من السجل الرسمي وليست في مرصد',
    /السجل التجاري|الوزارة|رسمي|إضافة/.test(body))

  // ===== Promotion =====
  console.log('\n─── من السجل إلى مرصد ───')
  const [{ add_registry_company_to_marsad: newId }] = await asAdmin(
    'select public.add_registry_company_to_marsad($1)', [g.id])
  // Committed separately: the checks below read it back.
  await db.query(`select set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: PROBE })])
  const { rows: [created] } = await db.query(
    `select id, name, cr_number, unified_number, source, status,
            government_company_id, region, city, capital
       from public.companies where cr_number = $1 or unified_number = $2`,
    [g.cr_number, g.unified_number])

  if (!created) {
    // The promotion ran inside a rolled-back transaction; do it for real.
    await db.query(`select set_config('request.jwt.claims', $1, false)`,
      [JSON.stringify({ sub: PROBE })])
    const { rows: [r] } = await db.query(
      'select public.add_registry_company_to_marsad($1) id', [g.id])
    promoted = r.id
  } else {
    promoted = created.id
  }

  const { rows: [c] } = await db.query(
    `select id, name, cr_number, unified_number, source, status,
            government_company_id, region, city
       from public.companies where id = $1`, [promoted])

  ok('أُنشئ سجل في مرصد', Boolean(c), String(newId).slice(0, 8))
  ok('  بالاسم الرسمي', c?.name === g.name, c?.name)
  ok('  ورقم السجل والرقم الموحّد', c?.cr_number === g.cr_number && c?.unified_number === g.unified_number)
  ok('  ومصدره «official»', c?.source === 'official', c?.source)
  ok('  ومربوط بصفّ الوزارة', c?.government_company_id === g.id)

  // Asked again, it must not make a second one.
  const { rows: [again] } = await db.query(
    'select public.add_registry_company_to_marsad($1) id', [g.id])
  ok('  وطلبه مرّتين لا ينشئ شركتين', again.id === promoted, `${again.id} ≠ ${promoted}`)

  // Now it is Marsad's, so the register must stop offering it.
  const after = await hits(g.cr_number)
  ok('ويصير المصدر «marsad» بعد الإضافة',
    after.some((r) => r.id === promoted && r.origin === 'marsad'),
    after.map((r) => r.origin).join(','))

  // ===== The line that must not blur =====
  console.log('\n─── بيانات الوزارة تعريفية لا بديلة ───')
  const [chk] = await asAdmin('select public.company_document_checklist($1) j', [promoted])
  const list = Array.isArray(chk.j) ? chk.j : []
  const required = list.filter((d) => d.required)
  ok('قائمة المستندات المطلوبة قائمة', required.length > 0, `${list.length} بند`)
  ok('ولا مستند يُعدّ مُقدَّماً لمجرّد الاستيراد',
    required.every((d) => d.state !== 'verified'),
    required.filter((d) => d.state === 'verified').map((d) => d.label).join('، '))

  const { rows: [docs] } = await db.query(
    'select count(*)::int n from public.company_documents where company_id = $1', [promoted])
  ok('ولا مستندات مُنشأة تلقائياً', docs.n === 0, `${docs.n} مستند`)

  ok('console نظيف', errs.length === 0, errs.slice(0, 2).join(' | '))
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 240)}`)
} finally {
  await browser.close()
  if (promoted) {
    await db.query(`delete from public.audit_logs where entity='company' and entity_id=$1`, [promoted]).catch(() => {})
    await db.query('delete from public.companies where id = $1', [promoted]).catch(() => {})
  }
  await db.query('delete from public.users where id = $1', [PROBE]).catch(() => {})
  console.log(`\n  🧹 نُظّفت شركة الفحص: ${promoted ? 'نعم' : 'لا شيء'}`)
  await db.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — بحث واحد، مصدران، والمستندات تبقى مطلوبة\n`)
process.exit(fail ? 1 : 0)
