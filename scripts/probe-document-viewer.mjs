#!/usr/bin/env node
/**
 * The document, and the decision about it, in the company file.
 *
 * What this is for: verifying used to mean downloading the file, reading it in
 * another window, coming back, and clicking a button on a row whose contents
 * you were now recalling from memory. So the test is not «does a dialog open» —
 * it is whether the PDF actually renders pixels, because a viewer that opens
 * empty looks exactly like one that works until somebody has to read a
 * registration number off it.
 *
 * A document row is created pointing at a real PDF already in the bucket,
 * driven, and deleted. The file itself is left alone — it belongs to somebody.
 *
 *   node scripts/probe-document-viewer.mjs [url]
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
const madeDocs = []

try {
  // A real PDF that is already in the bucket, and a company to hang it on.
  const { rows: [pdf] } = await db.query(
    `select name from storage.objects
      where bucket_id = 'company-documents' and name ilike '%.pdf' limit 1`)
  if (!pdf) throw new Error('لا ملف PDF في التخزين لاختباره')

  const { rows: [co] } = await db.query(
    `select id, name from public.companies order by created_at limit 1`)

  const docId = randomUUID()
  await db.query(
    `insert into public.company_documents
       (id, company_id, doc_type, file_name, file_url, status, created_at)
     values ($1, $2, 'commercial_registration', 'فحص_العارض.pdf', $3, 'pending', now())`,
    [docId, co.id, pdf.name])
  madeDocs.push(docId)

  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)) })

  await signIn(page, BASE, { role: 'platform_admin' })
  await page.goto(`${BASE}/admin/company/${co.id}`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2500)

  const tablist = page.getByRole('tablist', { name: 'أقسام ملفّ الشركة' })
  await tablist.getByRole('tab', { name: 'المستندات', exact: true }).click()
  await page.waitForTimeout(1600)

  console.log('\n─── القرار داخل الملفّ ───')
  const view = page.getByRole('button', { name: 'عرض المستند' }).first()
  ok('زرّ العرض ظاهر على المستند المرفوع', await view.count() >= 1)
  ok('وزرّ التوثيق معه', await page.getByRole('button', { name: 'توثيق' }).count() >= 1)
  ok('وزرّ الرفض معه', await page.getByRole('button', { name: 'رفض', exact: true }).count() >= 1)

  console.log('\n─── العارض ───')
  await view.click()
  const viewer = page.getByRole('dialog', { name: /عرض/ })
  await viewer.waitFor({ state: 'visible', timeout: 20000 })
  ok('العارض يفتح', await viewer.count() === 1)

  // The point of the whole thing: pixels on a canvas.
  //
  // Waiting on the canvas *dimensions* is not enough and briefly reported an
  // empty page: draw() sizes the canvas and paints it white before it renders,
  // so there is a moment where the element is full-size and blank. The wait is
  // for ink, over the whole page rather than the top of it — the top of a
  // scanned certificate is margin.
  const inkOf = () => {
    const c = document.querySelector('[role="dialog"] canvas')
    if (!c || !c.width || !c.height) return null
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let ink = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) ink += 1
    }
    return { w: c.width, h: c.height, ink }
  }

  await page.waitForFunction(
    `(${inkOf.toString()})()?.ink > 0`, { timeout: 30000 }).catch(() => {})
  const canvas = await page.evaluate(inkOf)
  ok('و PDF.js يرسم الصفحة فعلاً', canvas && canvas.w > 50 && canvas.h > 50,
    canvas ? `${canvas.w}×${canvas.h}` : 'لا canvas')
  ok('والصفحة ليست بيضاء فارغة', canvas && canvas.ink > 0, `${canvas?.ink ?? 0} بكسل حبر`)

  const bar = await viewer.innerText()
  ok('وأدوات التكبير والتدوير معروضة', /%/.test(bar))

  await viewer.getByRole('button', { name: 'إغلاق' }).click()
  await page.waitForTimeout(700)
  ok('ويُغلق', (await viewer.count()) === 0)

  console.log('\n─── الرفض يحتاج سبباً ───')
  await page.getByRole('button', { name: 'رفض', exact: true }).first().click()
  const rej = page.getByRole('dialog', { name: 'سبب الرفض' })
  await rej.waitFor({ state: 'visible', timeout: 10000 })
  const confirm = rej.getByRole('button', { name: 'تأكيد الرفض' })
  ok('التأكيد معطّل بلا سبب', await confirm.isDisabled())
  await rej.locator('textarea').fill('الصورة غير واضحة ورقم السجل غير مقروء.')
  await page.waitForTimeout(400)
  ok('ويُفعَّل بعد كتابة السبب', !(await confirm.isDisabled()))
  await confirm.click()
  await page.waitForTimeout(4000)

  const { rows: [after] } = await db.query(
    'select status, rejection_reason from public.company_documents where id = $1', [docId])
  ok('القرار محفوظ في القاعدة', after?.status === 'rejected', after?.status)
  ok('ومعه السبب الذي تراه الشركة',
    (after?.rejection_reason || '').includes('غير واضحة'), after?.rejection_reason)

  console.log('\n─── التوثيق ───')
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  await tablist.getByRole('tab', { name: 'المستندات', exact: true }).click()
  await page.waitForTimeout(1600)
  const verify = page.getByRole('button', { name: 'توثيق' }).first()
  if (await verify.count()) {
    await verify.click()
    await page.waitForTimeout(4000)
    const { rows: [v] } = await db.query(
      'select status from public.company_documents where id = $1', [docId])
    ok('التوثيق يُحفظ أيضاً', v?.status === 'verified', v?.status)
  } else {
    ok('التوثيق يُحفظ أيضاً', false, 'زرّ التوثيق غير موجود بعد الرفض')
  }

  ok('console نظيف', errs.length === 0, errs.slice(0, 2).join(' | '))

  console.log('\n─── القياسات ───')
  for (const w of [1440, 1024, 700, 390]) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.waitForTimeout(600)
    const over = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth + 2)
    ok(`لا فيض أفقي @${w}`, !over)
  }
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 240)}`)
} finally {
  await browser.close()
  for (const id of madeDocs) {
    await db.query('delete from public.company_documents where id = $1', [id]).catch(() => {})
  }
  const { rows: [left] } = await db.query(
    `select count(*)::int n from public.company_documents where file_name = 'فحص_العارض.pdf'`)
  console.log(`\n  🧹 مستندات الفحص المتبقية: ${left.n}`)
  await db.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — المستند يُقرأ ويُقرَّر فيه دون مغادرة الملفّ\n`)
process.exit(fail ? 1 : 0)
