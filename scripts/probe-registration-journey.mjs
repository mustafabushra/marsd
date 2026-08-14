#!/usr/bin/env node
/**
 * The whole journey, end to end.
 *
 * Every probe before this one built its own fixture rows, which is why the
 * double write went unnoticed for weeks: no test ever went through
 * `register_company_for_current_user`, so nothing ever saw it write one record
 * while the browser wrote another.
 *
 * So the company side here goes through the real registration function — the
 * one the onboarding screen calls — and the reviewer side is driven in a real
 * browser, click by click: find it in the queue, take it, be refused the
 * approval, verify the documents, be allowed the approval, and watch the
 * company become findable.
 *
 *   node scripts/probe-registration-journey.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'
import { pad10 } from './lib/test-ids.mjs'

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
const as = (id) => db.query(`select set_config('request.jwt.claims', $1, true)`,
  [JSON.stringify({ sub: id, role: 'authenticated' })])

/** Is this company findable by an ordinary signed-in user? */
async function findable (name) {
  const { rows: [actor] } = await db.query(
    `select id from public.users where role = 'company_member' limit 1`)
  await db.query('begin'); await as(actor.id)
  const { rows } = await db.query('select * from public.search_companies_unified($1, 20)', [name])
  await db.query('rollback')
  return rows.some((r) => r.name === name)
}

const browser = await chromium.launch()
const made = {}

try {
  const s = Date.now().toString().slice(-7)
  const NAME = `شركة الرحلة الكاملة ${s}`
  const EMAIL = `journey.${s}@example.com`

  // ===== 1. Somebody registers =====
  // Through the real function, with the real arguments the screen passes.
  made.user = `user_journey_${s}`
  await db.query(
    `insert into public.users (id,email,role,status) values ($1,$2,'company_member','active')`,
    [made.user, EMAIL])

  await db.query('begin'); await as(made.user)
  const { rows: [reg] } = await db.query(
    'select * from public.register_company_for_current_user($1,$2,$3,$4,$5,$6)',
    [NAME, pad10(`19${s}`), EMAIL, '0500000000', 'الرياض', 'مقاولات'])
  await db.query('commit')
  made.company = reg.company_id
  made.tenant = reg.tenant_id
  made.request = reg.request_id

  ok('التسجيل ينشئ الشركة والحساب والطلب معاً',
    !!reg.company_id && !!reg.tenant_id && !!reg.request_id)

  const { rows: [n1] } = await db.query(
    'select count(*)::int n from public.company_requests where company_id=$1', [made.company])
  ok('طلب واحد لا اثنان', n1.n === 1, `${n1.n} طلبات`)

  ok('والشركة غير موجودة في البحث بعد', !(await findable(NAME)),
    'شركة لم تُعتمد ظاهرة للناس')

  // ===== 2. The documents, and the submission =====
  const { rows: types } = await db.query(
    'select doc_type, label from public.company_document_types() where required')
  await db.query('begin'); await as(made.user)
  for (const t of types) {
    await db.query(`insert into public.company_documents
      (company_id, uploaded_by_tenant_id, uploaded_by_user_id, doc_type, file_url, file_name, status, request_id)
      values ($1,$2,$3,$4,$5,$6,'pending',$7)`,
      [made.company, made.tenant, made.user, t.doc_type,
       `${made.company}/${t.doc_type}.pdf`, `${t.label}.pdf`, made.request])
  }
  await db.query('select public.submit_company_request($1)', [made.request])
  await db.query('commit')

  const { rows: [sub] } = await db.query(
    'select status, submitted_at, response_due_at, resolution_due_at from public.company_requests where id=$1',
    [made.request])
  ok('الإرسال يضبط الحالة والمهلتين',
    sub.status === 'submitted' && !!sub.response_due_at && !!sub.resolution_due_at, sub.status)

  // ===== 3. The reviewer, in a browser =====
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 1150 } })).newPage()
  await signIn(page, BASE, { role: 'platform_admin' })
  await page.goto(`${BASE}/admin/company-requests`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2200)

  const queue = await page.locator('body').innerText()
  ok('الطلب في الطابور', queue.includes(NAME), 'الطلب مكتوب ولا أحد يراه')
  ok('ومعلَّم غير مُسنَد', queue.includes('غير مُسنَد'))
  ok('ويقول ٠/٤ مُدقَّق', /0\/\d+ مُدقَّق/.test(queue), 'وصلت ≠ قُرئت — والفرق غير معروض')

  await page.locator(`text=${NAME}`).first().click()
  await page.waitForSelector('text=/الخطّ الزمني/', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1200)

  let body = await page.locator('body').innerText()
  ok('الخطّ الزمني بالعربية', /أُرسل الطلب/.test(body) && !/\bsubmitted\b/.test(body),
    'أحداث خام في واجهة عربية')
  ok('والـchecklist يقول ما ينقص', /مستندات دُقّقت/.test(body))

  // Exact text, not `has-text`: the queue's own filter chip «مقبولة» contains
  // «قبول», so a substring match clicked the filter and the probe reported on a
  // list it thought was the decision panel.
  const approve = () => page.getByRole('button', { name: 'قبول', exact: true })
  ok('وزرّ القبول معطّل', await approve().isDisabled(), 'يمكن الضغط على قبول قبل التدقيق')

  // ===== 4. Taking it =====
  await page.locator('button:has-text("استلام الطلب")').first().click()
  await page.waitForTimeout(2200)
  const { rows: [asg] } = await db.query(
    'select status, assigned_to, assigned_at, first_response_at from public.company_requests where id=$1',
    [made.request])
  ok('الاستلام ينقل إلى قيد المراجعة', asg.status === 'under_review', asg.status)
  ok('ويسجّل الموظّف ووقته', !!asg.assigned_to && !!asg.assigned_at && !!asg.first_response_at)

  body = await page.locator('body').innerText()
  ok('والشاشة تقول مع من هو', /مع .+@/.test(body))

  // ===== 5. Verifying the documents =====
  // Through the reviewer's own function, as the documents screen calls it.
  const { rows: docs } = await db.query(
    'select id from public.company_documents where company_id=$1 and superseded_at is null', [made.company])
  const { rows: [staff] } = await db.query(
    `select id from public.users where role='platform_admin' order by created_at limit 1`)
  for (const d of docs) {
    await db.query('begin'); await as(staff.id)
    await db.query('select public.review_document($1, true, null)', [d.id])
    await db.query('commit')
  }

  // A reload drops the open request, so the reviewer has to walk back in — and
  // the probe has to wait for the detail rather than assume it.
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  // The queue opens on «جديدة», and this request is no longer new — taking it
  // moved it to «قيد المراجعة». The filter doing that is the queue working, not
  // failing, so the probe follows the request instead of expecting it to stay.
  // The chip carries its count — «قيد المراجعة (1)» — so an exact-name match
  // finds nothing.
  await page.locator('button').filter({ hasText: 'قيد المراجعة' }).first().click()
  await page.waitForTimeout(1800)
  await page.locator(`text=${NAME}`).first().click()
  await page.waitForSelector('text=/الخطّ الزمني/', { timeout: 20000 })
  await page.waitForTimeout(1500)
  body = await page.locator('body').innerText()
  ok('والشاشة صفحة الطلب لا الطابور', body.includes('الخطّ الزمني'))
  ok('والـchecklist صار كلّه ✓', /٤\/٤|4\/4 مستندات دُقّقت/.test(body) || !/✗/.test(body),
    body.split('\n').filter((l) => l.includes('✗')).join(' | ').slice(0, 120))
  ok('وبعد التدقيق يفتح زرّ القبول', !(await approve().isDisabled()),
    'القبول ما زال معطّلاً بعد تدقيق الأربعة')

  // ===== 6. The decision =====
  await approve().click()
  await page.waitForTimeout(3000)

  // If the click did not take, say what the screen said. A silent refusal is
  // how a passing locator hides a failing action.
  {
    const after = await page.locator('body').innerText()
    const err = after.split('\n').find((l) => /تعذّر|لا يمكن القبول/.test(l))
    if (err) console.log(`     ↳ الشاشة: ${err.slice(0, 140)}`)
  }

  const { rows: [done] } = await db.query(
    'select status, reviewed_at, reviewed_by from public.company_requests where id=$1', [made.request])
  ok('القبول يُغلق الطلب', done.status === 'approved' && !!done.reviewed_at, done.status)

  const { rows: [co] } = await db.query(
    'select status, approved, review_status from public.companies where id=$1', [made.company])
  ok('والشركة تصبح نشطة', co.status === 'active', co.status)
  ok('والعمودان المهجوران يتبعانها',
    co.approved === true && co.review_status === 'approved',
    `approved=${co.approved} review=${co.review_status}`)

  const { rows: [legacy] } = await db.query(
    'select status from public.registration_requests where company_id=$1', [made.company])
  ok('والصفّ القديم يُغلق معه', legacy?.status === 'approved', legacy?.status)

  // ===== 7. And now the world can see it =====
  ok('الشركة صارت موجودة في البحث', await findable(NAME),
    'قُبلت ولا تظهر — القبول بلا أثر')

  const { rows: ev } = await db.query(
    `select e.event from public.company_request_events e where e.request_id=$1 order by e.created_at`,
    [made.request])
  // The lifecycle, separately from the document verifications that now land on
  // the same timeline — a registration that took three days because a file came
  // back twice cannot be explained by the decision entry alone.
  const seq = ev.map((x) => x.event)
  ok('والرحلة كلها على خطّ زمني واحد',
    seq.filter((e) => !e.startsWith('document_')).join(' → ')
      === 'created → submitted → assigned → approved',
    seq.join(' → '))

  ok('وتدقيق المستندات مسجَّل فيه',
    seq.filter((e) => e === 'document_verified').length === docs.length,
    `${seq.filter((e) => e === 'document_verified').length} من ${docs.length}`)

} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 200)}`)
} finally {
  await db.query('rollback').catch(() => {})
  if (made.company) {
    await db.query(`delete from public.company_request_events where request_id in
      (select id from public.company_requests where company_id=$1)`, [made.company]).catch(() => {})
    await db.query('delete from public.company_documents where company_id=$1', [made.company]).catch(() => {})
    await db.query('delete from public.company_requests where company_id=$1', [made.company]).catch(() => {})
    await db.query('delete from public.registration_requests where company_id=$1', [made.company]).catch(() => {})
    await db.query('delete from public.company_audit_log where company_id=$1', [made.company]).catch(() => {})
    await db.query('delete from public.credits_ledger where tenant_id=$1', [made.tenant]).catch(() => {})
    await db.query('delete from public.trust_scores where company_id=$1', [made.company]).catch(() => {})
  }
  await db.query('delete from public.users where id=$1', [made.user]).catch(() => {})
  await db.query('delete from public.tenants where id=$1', [made.tenant]).catch(() => {})
  await db.query('delete from public.companies where id=$1', [made.company]).catch(() => {})
  await db.end()
  await browser.close()
}

console.log(fail
  ? `\n  ❌ ${fail} من ${pass + fail}\n`
  : `\n  ✅ ${pass} فحصاً — الرحلة كاملة، من التسجيل إلى الظهور\n`)
process.exit(fail ? 1 : 0)
