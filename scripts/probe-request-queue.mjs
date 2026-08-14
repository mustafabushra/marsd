#!/usr/bin/env node
/**
 * A reviewer opens the queue and can decide from it.
 *
 * Requests were being written and nothing showed them. The first real
 * registration would have arrived, sat in `company_requests` with a state, and
 * nobody would have known — the same failure as before in better clothes.
 *
 * So this drives the screen the way a reviewer would: find the request, open
 * it, check that everything a decision needs is on the page, ask for a
 * clarification, and confirm the state moved. It is done in a real browser
 * because «the RPC returns the right JSON» is not the same claim as «a person
 * can act on it».
 *
 *   node scripts/probe-request-queue.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'
import { pad10 } from './lib/test-ids.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4360'

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
const made = { company: null, tenant: null, user: null, request: null }

try {
  // --- A request to review ---------------------------------------------------
  // Built here rather than borrowed, so the probe does not depend on whatever
  // happens to be in the queue today.
  const stamp = Date.now().toString().slice(-7)
  const NAME = `شركة فحص الطابور ${stamp}`

  const { rows: [co] } = await db.query(
    `insert into public.companies (name, cr_number, source, status, approved, city)
     values ($1, $2, 'community', 'pending', false, 'الرياض') returning id`,
    [NAME, pad10(`66${stamp}`)])
  made.company = co.id

  const { rows: [tn] } = await db.query(
    `insert into public.tenants (name, cr_number, email, company_id, status)
     values ($1, $2, $3, $4, 'active') returning id`,
    [`مقدّم ${stamp}`, `Q${stamp}`, `queue.${stamp}@example.com`, co.id])
  made.tenant = tn.id

  made.user = `user_probe_queue_${stamp}`
  await db.query(
    `insert into public.users (id, email, role, tenant_id, status)
     values ($1, $2, 'company_admin', $3, 'active')`,
    [made.user, `queue.${stamp}@example.com`, tn.id])

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

  // --- The reviewer ------------------------------------------------------------
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage()
  await signIn(page, BASE, { role: 'platform_admin' })
  await page.goto(`${BASE}/admin/company-requests`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1800)

  ok('الشاشة تفتح', await page.locator('text=/طلبات الشركات/').count() > 0)
  ok('والطلب معروض في الطابور', await page.locator(`text=${NAME}`).count() > 0,
    'الطلب مكتوب ولا أحد يراه — وهذه هي المشكلة نفسها')

  ok('مع عدّاد المستندات',
    await page.locator(`text=/${types.length}\\/${types.length} مستند/`).count() > 0)
  ok('ومدّة الانتظار', await page.locator('text=/اليوم|منذ .* يوم/').count() > 0,
    'الرقم الذي يدور حوله الطابور غير معروض')

  // --- One request, whole --------------------------------------------------------
  await page.locator(`text=${NAME}`).first().click()
  await page.waitForSelector('text=/الخطّ الزمني/', { timeout: 20000 }).catch(() => {})

  const body = await page.locator('body').innerText()
  const has = (s) => body.includes(s)

  ok('يفتح الطلب كاملاً', has('الخطّ الزمني'))
  ok('وفيه المستندات ومن رفعها', has('المستندات') && has(`queue.${stamp}@example.com`),
    'المستندات مخزّنة منذ أسابيع ولا تُعرض')
  ok('والحساب ومستخدموه', has('الحساب'))
  ok('ومؤشّر الثقة والتقارير', has('مؤشّر الثقة والتقارير'))
  ok('وأزرار القرار الثلاثة',
    await page.locator('button:has-text("قبول")').count() > 0
    && await page.locator('button:has-text("طلب توضيح")').count() > 0
    && await page.locator('button:has-text("رفض")').count() > 0)

  // --- A decision that refuses to explain itself ------------------------------------
  await page.locator('button:has-text("طلب توضيح")').click()
  await page.waitForTimeout(900)
  ok('طلب التوضيح بلا سبب يُرفض في الواجهة',
    (await page.locator('body').innerText()).includes('اكتب ما المطلوب'),
    'يُرسَل بلا سبب — والشركة لن تعرف ما المطلوب')

  await page.locator('textarea').first().fill('شهادة الزكاة غير واضحة')
  await page.locator('button:has-text("طلب توضيح")').click()
  await page.waitForTimeout(2500)

  const { rows: [after] } = await db.query(
    'select status from public.company_requests where id = $1', [rq])
  ok('وبالسبب ينتقل الطلب', after.status === 'clarification_needed', `جاءت «${after.status}»`)

  const { rows: [ev] } = await db.query(
    `select note from public.company_request_events
      where request_id = $1 and event = 'clarification_requested'`, [rq])
  ok('والسبب محفوظ في الخطّ الزمني', ev?.note === 'شهادة الزكاة غير واضحة')

  ok('والشاشة رجعت للطابور',
    (await page.locator('body').innerText()).includes('طلبات الشركات'))

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
  : `\n  ✅ ${pass} فحصاً — الطلب مرئي، ومفتوح كاملاً، وقابل للقرار\n`)
process.exit(fail ? 1 : 0)
