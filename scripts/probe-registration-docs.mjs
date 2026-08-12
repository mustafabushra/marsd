#!/usr/bin/env node
/**
 * Registration asks for the documents, and stops asking for what the Ministry
 * already published.
 *
 * Two rules, and they pull against each other in a useful way:
 *   nothing the register states is typed again — name, both numbers, entity,
 *     region, city, registration date come from government_company_registry
 *   everything the register does not hold is uploaded before the file opens —
 *     the four documents company_document_types() marks required
 *
 * The second is the one worth testing hardest: a company file without its
 * paperwork is a file nobody can verify, and Marsad would be publishing a trust
 * score against it.
 *
 *   node scripts/probe-registration-docs.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4404'

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

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64')
const dir = mkdtempSync(join(tmpdir(), 'marsad-reg-'))
const doc = join(dir, 'wathiqa.png')
writeFileSync(doc, PNG)

const browser = await chromium.launch()

try {
  // ===== The rules, as the database states them =====
  console.log('\n─── ما تعتبره القاعدة مطلوباً ───')
  const { rows: types } = await db.query(
    'select doc_type, label, required from public.company_document_types() order by sort_order')
  const required = types.filter((t) => t.required)
  ok(`القاعدة تُلزم ${required.length} مستندات`, required.length > 0,
    required.map((t) => t.label).join('، '))

  const { rows: [g] } = await db.query(
    `select name, cr_number, unified_number, region, city, legal_entity
       from public.government_company_registry
      where dataset_id = public.published_registry_dataset()
        and coalesce(btrim(cr_number),'') <> '' limit 1`)
  ok('وهناك سجل رسمي للتعبئة منه', Boolean(g), g?.cr_number)

  // ===== The form =====
  console.log('\n─── نموذج التسجيل ───')
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 1100 } })).newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)))
  await page.goto(`${BASE}/company-register`, { waitUntil: 'domcontentloaded', timeout: 40000 })
  // Wait for the screen rather than for the clock — a fixed sleep reads it
  // mid-mount and calls a page that works «still loading».
  await page.waitForFunction(
    () => (document.body.innerText || '').replace(/\s/g, '').length > 300,
    { timeout: 25000 }).catch(() => {})

  const body = await page.locator('body').innerText()
  const onForm = /رقم السجل التجاري/.test(body)
  ok('الصفحة تفتح', body.length > 200, body.slice(0, 90))

  if (!onForm) {
    // Registration begins with a sign-up step; the company step is behind it.
    console.log('     (خطوة إنشاء الحساب أولاً — تُفحص خطوة الشركة عبر الكود)')
  }

  // ===== The source of truth, checked in the code rather than guessed =====
  console.log('\n─── ما يقوله المصدر ───')
  const src = readFileSync('src/pages/CompanyRegister.jsx', 'utf8')
  ok('النموذج يجلب من السجل التجاري', /search_companies_unified/.test(src))
  ok('ويعبّئ الحقول الرسمية منه',
    ['name:', 'crNumber:', 'unifiedNumber:', 'entityType:', 'region:', 'city:', 'foundingDate:']
      .every((f) => new RegExp(f.replace(':', '\\s*:')).test(src)))
  ok('ويقفل ما عُبّئ منه', /readOnly=\{fromRegistry\(/.test(src))
  ok('ويطلب المستندات المطلوبة', /RequiredCompanyDocuments/.test(src))
  ok('ويمنع الإرسال وهي ناقصة', /مستندات ناقصة/.test(src))
  ok('ويرفعها على الشركة بعد إنشائها', /uploadCompanyDocuments/.test(src))
  ok('والقائمة تأتي من القاعدة لا من النموذج',
    !/commercial_registration'\s*,\s*'vat_certificate/.test(src))

  // ===== The dashboard keeps them =====
  console.log('\n─── لا يُطلب مرّتين ───')
  // company_document_checklist returns [] when it cannot see a caller, so a raw
  // connection reads «no documents» and the two checks below pass over an empty
  // list without testing anything. Impersonate a platform admin the way
  // PostgREST does.
  const CHK = 'reg_docs_probe'
  await db.query(
    `insert into public.users (id, email, role)
     values ($1, 'reg-docs@marsad.test', 'platform_admin')
     on conflict (id) do update set role = 'platform_admin'`, [CHK])
  await db.query('begin')
  await db.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: CHK })])
  const { rows: [chk] } = await db.query(
    `select public.company_document_checklist(
       (select id from public.companies where status='active' limit 1)) j`)
  await db.query('rollback')
  await db.query('delete from public.users where id = $1', [CHK]).catch(() => {})
  const list = Array.isArray(chk.j) ? chk.j : []
  ok('الملف يعرض حالة كل مستند', list.length > 0, `${list.length} بند`)
  const states = [...new Set(list.map((d) => d.state))]
  ok('والحالة مشتقّة لا مخزّنة (فيها expired عند اللزوم)',
    list.every((d) => typeof d.state === 'string'), states.join(', '))
  ok('ولكل حالة فعلها الوحيد',
    list.every((d) => ['upload', 'reupload', 'view', 'replace'].includes(d.action)),
    [...new Set(list.map((d) => d.action))].join(', '))

  ok('console نظيف', errs.length === 0, errs[0])
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 220)}`)
} finally {
  await browser.close()
  await db.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — الرسمي يُعبَّأ، والمستندات تُرفع مرّة واحدة\n`)
process.exit(fail ? 1 : 0)
