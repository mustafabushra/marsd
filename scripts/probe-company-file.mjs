#!/usr/bin/env node
/**
 * The company file holds everything about the company.
 *
 * It listed the nine document types and their states, and stopped there. Who
 * sent each file and when has been stored on every row since the documents work
 * landed and was displayed on no screen — so «who gave us this» was a question
 * only the database could answer.
 *
 * The account, its users, the subscription and the request history were each a
 * different screen, which is how a company file stops being one.
 *
 *   node scripts/probe-company-file.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4370'

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

const browser = await chromium.launch()
const made = {}

try {
  const stamp = Date.now().toString().slice(-7)
  const NAME = `شركة فحص الملف ${stamp}`
  const SENDER = `مؤسسة المُرسِل ${stamp}`
  const EMAIL = `file.${stamp}@example.com`

  const { rows: [co] } = await db.query(
    `insert into public.companies (name, cr_number, source, status, approved, city)
     values ($1, $2, 'community', 'pending', false, 'جدة') returning id`,
    [NAME, `44${stamp}`])
  made.company = co.id

  const { rows: [tn] } = await db.query(
    `insert into public.tenants (name, cr_number, email, company_id, status)
     values ($1, $2, $3, $4, 'active') returning id`,
    [SENDER, `F${stamp}`, EMAIL, co.id])
  made.tenant = tn.id

  made.user = `user_probe_file_${stamp}`
  await db.query(
    `insert into public.users (id, email, role, tenant_id, status)
     values ($1, $2, 'company_admin', $3, 'active')`, [made.user, EMAIL, tn.id])

  await db.query('begin')
  await db.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: made.user, role: 'authenticated' })])
  const { rows: [{ open_company_request: rq }] } = await db.query(
    'select public.open_company_request($1, $2)', [co.id, 'registration'])
  made.request = rq

  const { rows: types } = await db.query(
    'select doc_type, label from public.company_document_types() where required')
  for (const t of types) {
    await db.query(
      `insert into public.company_documents
         (company_id, uploaded_by_tenant_id, uploaded_by_user_id, doc_type, file_url, file_name, status, request_id)
       values ($1, $2, $3, $4, $5, $6, 'pending', $7)`,
      [co.id, tn.id, made.user, t.doc_type, `${co.id}/${t.doc_type}.pdf`, `${t.label}.pdf`, rq])
  }
  await db.query('select public.submit_company_request($1)', [rq])
  await db.query('commit')

  // --- The reviewer opens the file --------------------------------------------
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage()
  await signIn(page, BASE, { role: 'platform_admin' })
  await page.goto(`${BASE}/admin/company/${co.id}`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2200)

  ok('الملف يفتح', (await page.locator('body').innerText()).includes(NAME))

  // --- Documents, with provenance ------------------------------------------------
  // Scoped to the page, not the shell. The sidebar carries a group called
  // «المستندات والحالة الرسمية», and an unscoped `has-text` clicked that
  // instead — the probe reporting a missing tab that was on screen.
  const tab = (name) => page.locator('#main button').filter({ hasText: name }).first()
  await tab('المستندات').click()
  await page.waitForTimeout(900)
  const docsText = await page.locator('body').innerText()

  ok('المستندات معروضة', docsText.includes('السجل التجاري'))
  ok('ومعها من سلّمها', docsText.includes(SENDER),
    'المستندات مخزّنة بمُرسِلها ولا تُعرض — «من أعطانا هذا» تجيبه القاعدة وحدها')
  ok('وتاريخ التسليم', /سلّمه/.test(docsText))

  // --- The account and the requests -------------------------------------------------
  await tab('الحساب والطلبات').click()
  await page.waitForTimeout(900)
  const acc = await page.locator('body').innerText()

  ok('تبويب الحساب موجود', acc.includes('الحساب'))
  ok('ويعرض الحساب ومستخدميه', acc.includes(SENDER) && acc.includes(EMAIL))
  ok('والمصدر', acc.includes('أُدخلت يدوياً') || acc.includes('السجل التجاري'))
  ok('وسجلّ الطلبات', acc.includes('تسجيل شركة') && acc.includes('جديد'),
    'الطلب موجود ولا يظهر في ملف شركته')

  // --- And nobody else may read it ---------------------------------------------------
  // The submitter's e-mail is not something to hand to whoever opens a company
  // page, which is why this lives in an admin-only function rather than in the
  // checklist the company itself reads.
  await db.query('begin')
  await db.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: made.user, role: 'authenticated' })])
  let refused = false
  try {
    await db.query('select * from public.admin_company_documents($1)', [co.id])
  } catch { refused = true }
  await db.query('rollback')
  ok('حساب شركة لا يقرأ بيانات المُرسِلين', refused,
    'بريد من سلّم مستنداً مكشوف لأي حساب')

} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 130)}`)
} finally {
  await db.query('rollback').catch(() => {})
  if (made.company) {
    await db.query('delete from public.company_documents where company_id = $1', [made.company]).catch(() => {})
    await db.query('delete from public.company_requests where company_id = $1', [made.company]).catch(() => {})
    await db.query('delete from public.users where id = $1', [made.user]).catch(() => {})
    await db.query('delete from public.tenants where id = $1', [made.tenant]).catch(() => {})
    await db.query('delete from public.companies where id = $1', [made.company]).catch(() => {})
  }
  await db.end()
  await browser.close()
}

console.log(fail
  ? `\n  ❌ ${fail} من ${pass + fail}\n`
  : `\n  ✅ ${pass} فحصاً — الملف يقول من سلّم وماذا ومتى\n`)
process.exit(fail ? 1 : 0)
