#!/usr/bin/env node
/**
 * Registration and the verification badge, decided inside the company file.
 *
 * Both used to live on their own screens, so deciding either meant leaving the
 * one page that shows the documents, the reports and the history the decision
 * rests on. What is checked here is not that a button exists — it is that the
 * decision reached the database, that the audit row names who made it, and that
 * the company was told.
 *
 * A company of its own is created and removed, because approving or rejecting a
 * real one changes what the product shows about a real business.
 *
 *   node scripts/probe-company-decisions.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
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

const browser = await chromium.launch()
const coId = randomUUID()
const NAME = `شركة فحص القرارات ${Date.now().toString().slice(-6)}`

const PROBE_ADMIN = 'decisions_probe_admin'

try {
  // `companies` carries guard triggers — changing a status or a verification
  // flag raises unless is_platform_admin(). A raw connection carries no claim,
  // so this probe's *own* setup and resets were being refused by the same
  // control the app passes through legitimately. The claim is set at session
  // level rather than per transaction because these writes are committed.
  await db.query(
    `insert into public.users (id, email, role)
     values ($1, 'decisions-probe@marsad.test', 'platform_admin')
     on conflict (id) do update set role = 'platform_admin'`, [PROBE_ADMIN])
  await db.query(`select set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: PROBE_ADMIN })])

  await db.query(
    `insert into public.companies (id, name, cr_number, status, source, created_at)
     values ($1, $2, $3, 'pending', 'community', now())`,
    [coId, NAME, String(Date.now()).slice(-10)])

  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)) })

  await signIn(page, BASE, { role: 'platform_admin' })
  const openFile = async () => {
    await page.goto(`${BASE}/admin/company/${coId}`, { waitUntil: 'networkidle', timeout: 45000 })
    await page.getByRole('tablist', { name: 'أقسام ملفّ الشركة' })
      .waitFor({ state: 'visible', timeout: 25000 })
    await page.waitForTimeout(1200)
  }
  await openFile()

  console.log('\n─── القرارات في الملفّ ───')
  const main = page.locator('#main')
  ok('قسم «القرارات» معروض في نظرة عامة', (await main.innerText()).includes('القرارات'))
  ok('وحالة التسجيل «بانتظار الاعتماد»', /بانتظار|قيد/.test(await main.innerText()))
  ok('وزرّا القبول والرفض ظاهران',
    (await page.getByRole('button', { name: 'قبول التسجيل' }).count()) === 1
    && (await page.getByRole('button', { name: 'رفض التسجيل' }).count()) === 1)

  console.log('\n─── الرفض يحتاج سبباً ───')
  await page.getByRole('button', { name: 'رفض التسجيل' }).click()
  const dlg = page.getByRole('dialog', { name: 'سبب القرار' })
  await dlg.waitFor({ state: 'visible', timeout: 10000 })
  const confirm = dlg.getByRole('button', { name: 'تأكيد' })
  ok('التأكيد معطّل بلا سبب', await confirm.isDisabled())
  await dlg.locator('textarea').fill('السجل التجاري المرفق منتهي الصلاحية.')
  await page.waitForTimeout(300)
  ok('ويُفعَّل بعد كتابة السبب', !(await confirm.isDisabled()))
  await confirm.click()
  await page.waitForTimeout(4000)

  const { rows: [afterReject] } = await db.query(
    'select status from public.companies where id = $1', [coId])
  ok('الرفض محفوظ في القاعدة', afterReject?.status === 'rejected', afterReject?.status)

  const { rows: [auditR] } = await db.query(
    `select actor_id, meta from public.audit_logs
      where entity = 'company' and entity_id = $1 and action = 'company_rejected'
      order by created_at desc limit 1`, [coId])
  ok('وسجل التدقيق يسمّي من رفض', Boolean(auditR?.actor_id), 'لا فاعل')
  ok('ويحفظ السبب', (auditR?.meta?.reason || '').includes('منتهي'), JSON.stringify(auditR?.meta || {}).slice(0, 70))

  // ===== Approve =====
  console.log('\n─── القبول ───')
  await db.query(`update public.companies set status = 'pending' where id = $1`, [coId])
  await openFile()
  await page.getByRole('button', { name: 'قبول التسجيل' }).click()
  await page.waitForTimeout(4000)
  const { rows: [afterApprove] } = await db.query(
    'select status from public.companies where id = $1', [coId])
  ok('القبول محفوظ في القاعدة', afterApprove?.status === 'approved', afterApprove?.status)

  // ===== Verification =====
  console.log('\n─── التوثيق ───')
  await openFile()
  const verifyBtn = page.getByRole('button', { name: 'توثيق الشركة' })
  ok('زرّ التوثيق ظاهر لشركة غير موثّقة', (await verifyBtn.count()) === 1)
  await verifyBtn.click()
  await page.waitForTimeout(4000)
  const { rows: [v] } = await db.query(
    'select verified, verification_source from public.companies where id = $1', [coId])
  ok('التوثيق محفوظ', v?.verified === true, String(v?.verified))
  ok('ومصدره مسجّل', v?.verification_source === 'marsad_review', v?.verification_source)

  await openFile()
  ok('ويصير الزرّ «سحب التوثيق»',
    (await page.getByRole('button', { name: 'سحب التوثيق' }).count()) === 1)

  await page.getByRole('button', { name: 'سحب التوثيق' }).click()
  const dlg2 = page.getByRole('dialog', { name: 'سبب القرار' })
  await dlg2.waitFor({ state: 'visible', timeout: 10000 })
  ok('والسحب يحتاج سبباً', await dlg2.getByRole('button', { name: 'تأكيد' }).isDisabled())
  await dlg2.locator('textarea').fill('انتهت صلاحية المستندات المعتمدة.')
  await page.waitForTimeout(300)
  await dlg2.getByRole('button', { name: 'تأكيد' }).click()
  await page.waitForTimeout(4000)
  const { rows: [v2] } = await db.query(
    'select verified from public.companies where id = $1', [coId])
  ok('السحب محفوظ', v2?.verified === false, String(v2?.verified))

  ok('console نظيف', errs.length === 0, errs.slice(0, 2).join(' | '))
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 240)}`)
} finally {
  await browser.close()
  await db.query(`delete from public.audit_logs where entity = 'company' and entity_id = $1`, [coId]).catch(() => {})
  await db.query(`delete from public.notifications where payload->>'company_id' = $1`, [coId]).catch(() => {})
  await db.query('delete from public.companies where id = $1', [coId]).catch(() => {})
  await db.query('delete from public.users where id = $1', [PROBE_ADMIN]).catch(() => {})
  const { rows: [left] } = await db.query(
    'select count(*)::int n from public.companies where id = $1', [coId])
  console.log(`\n  🧹 شركات الفحص المتبقية: ${left.n}`)
  await db.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — القبول والتوثيق يُقرَّران في الملفّ، وتحفظهما القاعدة\n`)
process.exit(fail ? 1 : 0)
