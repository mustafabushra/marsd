#!/usr/bin/env node
/**
 * «الإبلاغ عن مشكلة», driven the way somebody with a problem would drive it.
 *
 * The point of the screen is the attachment — a screenshot of the thing we
 * cannot see — so the file is really chosen, really uploaded, and then looked
 * for in the bucket and in the table. A dialog that accepts a file and drops it
 * on the floor looks identical to one that works, right up until somebody needs
 * the picture.
 *
 * Everything it creates is deleted at the end, including the object in storage.
 *
 *   node scripts/probe-support.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4392'

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

// A real 1x1 PNG, so the type check and the upload both see a genuine file.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64')
const dir = mkdtempSync(join(tmpdir(), 'marsad-support-'))
const shot = join(dir, 'screenshot_01.png')
writeFileSync(shot, PNG)
const big = join(dir, 'too_big.png')
writeFileSync(big, Buffer.alloc(11 * 1024 * 1024, 1))
const bad = join(dir, 'notes.txt')
writeFileSync(bad, 'plain text')

const browser = await chromium.launch()
let ticketId = null

try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 150)))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 150)) })

  const userId = await signIn(page, BASE, { role: 'company_admin' })
  await page.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded', timeout: 40000 })
  await page.waitForTimeout(2500)

  console.log('\n─── فتح النافذة ───')
  const openBtn = page.getByRole('button', { name: 'الإبلاغ عن مشكلة' })
  ok('الزرّ العائم ظاهر في كل شاشات الشركات', await openBtn.count() === 1)
  await openBtn.click()
  const dlg = page.getByRole('dialog', { name: 'الإبلاغ عن مشكلة' })
  await dlg.waitFor({ state: 'visible', timeout: 10000 })
  ok('النافذة تفتح', await dlg.count() === 1)

  const text = await dlg.innerText()
  for (const k of ['نوع البلاغ', 'تفاصيل البلاغ', 'المرفقات', 'اسحب وأفلت الملفات هنا',
    'أو انقر للتصفح من جهازك', 'إرسال', 'إلغاء']) {
    ok(`  «${k}» معروض`, text.includes(k))
  }
  ok('  العدّاد يبدأ من صفر', /0\/5|٠\/٥/.test(text), text.match(/\d+\/\d+ مرفقات/)?.[0])

  console.log('\n─── التحقّق قبل الإرسال ───')
  await dlg.getByRole('button', { name: 'إرسال' }).click()
  await page.waitForTimeout(700)
  ok('وصف قصير يُرفض ولا يُرسَل',
    /لا يقلّ عن/.test(await dlg.innerText()))

  console.log('\n─── المرفقات ───')
  const input = dlg.locator('input[type=file]')
  await input.setInputFiles(bad)
  await page.waitForTimeout(500)
  ok('نوع غير مقبول يُرفض بسبب مذكور', /نوع غير مقبول/.test(await dlg.innerText()))

  await input.setInputFiles(big)
  await page.waitForTimeout(700)
  ok('ملف أكبر من ١٠ م.ب يُرفض', /أكبر من/.test(await dlg.innerText()))

  await input.setInputFiles(shot)
  await page.waitForTimeout(600)
  let t = await dlg.innerText()
  ok('الملف المقبول يظهر باسمه', t.includes('screenshot_01.png'))
  ok('والعدّاد يتقدّم', /1\/5|١\/٥/.test(t), t.match(/\d+\/\d+ مرفقات/)?.[0])

  await input.setInputFiles(shot)
  await page.waitForTimeout(500)
  ok('ونفس الملف مرّتين لا يُضاف مرّتين', /مضاف بالفعل/.test(await dlg.innerText()))

  // Remove and re-add, so the chip's own control is exercised.
  await dlg.getByRole('button', { name: 'إزالة screenshot_01.png' }).click()
  await page.waitForTimeout(400)
  ok('وإزالة المرفق تعمل', /0\/5|٠\/٥/.test(await dlg.innerText()))
  await input.setInputFiles(shot)
  await page.waitForTimeout(500)

  console.log('\n─── الإرسال ───')
  await dlg.locator('#sup-kind').selectOption('billing')
  await dlg.locator('#sup-details').fill('لم يُفعَّل الاشتراك بعد الدفع، والشاشة تعرض الباقة القديمة.')
  await dlg.getByRole('button', { name: 'إرسال' }).click()
  await page.waitForTimeout(6000)

  const after = await dlg.innerText()
  ok('تظهر رسالة الاستلام مع رقم البلاغ', /وصلنا بلاغك/.test(after), after.slice(0, 90))

  // ===== What actually landed =====
  console.log('\n─── ما وصل فعلاً ───')
  const { rows } = await db.query(
    `select id, kind, details, status, page_url, tenant_id, created_by
       from public.support_tickets where created_by = $1
      order by created_at desc limit 1`, [userId])
  ok('البلاغ مسجَّل في القاعدة', rows.length === 1, `${rows.length}`)

  if (rows.length) {
    ticketId = rows[0].id
    ok('  بالنوع المختار', rows[0].kind === 'billing', rows[0].kind)
    ok('  وبالنصّ المكتوب', rows[0].details.includes('لم يُفعَّل الاشتراك'))
    ok('  وحالته «open»', rows[0].status === 'open', rows[0].status)
    ok('  ويحمل الصفحة التي جاء منها', rows[0].page_url === '/search', rows[0].page_url)
    // Stamped by the database, never sent by the browser.
    ok('  والمُرسِل مختوم من القاعدة', rows[0].created_by === userId)

    const { rows: att } = await db.query(
      `select file_name, mime_type, file_size, s3_key
         from public.support_ticket_attachments where ticket_id = $1`, [ticketId])
    ok('المرفق مسجَّل', att.length === 1, `${att.length} مرفقاً`)
    if (att.length) {
      ok('  باسمه ونوعه', att[0].file_name === 'screenshot_01.png' && att[0].mime_type === 'image/png',
        `${att[0].file_name} ${att[0].mime_type}`)
      ok('  ومساره تحت رقم البلاغ', String(att[0].s3_key).startsWith(`${ticketId}/`), att[0].s3_key)

      const { rows: obj } = await db.query(
        `select name from storage.objects where bucket_id = 'support-attachments' and name = $1`,
        [att[0].s3_key])
      // The row points at an object; a row pointing at nothing shows support a
      // screenshot that cannot be opened.
      ok('  والملف موجود فعلاً في التخزين', obj.length === 1, 'الصفّ يشير إلى لا شيء')
    }
  }

  ok('console نظيف', errs.length === 0, errs.slice(0, 2).join(' | '))

  console.log('\n─── القياسات ───')
  for (const w of [1440, 1024, 700, 390]) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.waitForTimeout(500)
    const over = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth + 2)
    ok(`لا فيض أفقي @${w}`, !over)
  }
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 220)}`)
} finally {
  await browser.close()
  if (ticketId) {
    const { rows: keys } = await db.query(
      'select s3_key from public.support_ticket_attachments where ticket_id = $1', [ticketId])
    for (const k of keys) {
      await db.query(
        `delete from storage.objects where bucket_id = 'support-attachments' and name = $1`,
        [k.s3_key]).catch(() => {})
    }
    await db.query('delete from public.support_tickets where id = $1', [ticketId]).catch(() => {})
  }
  const { rows: [left] } = await db.query(
    `select count(*)::int n from public.support_tickets where details like '%لم يُفعَّل الاشتراك%'`)
  console.log(`\n  🧹 بلاغات الفحص المتبقية: ${left.n}`)
  await db.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — البلاغ يصل، والصورة معه\n`)
process.exit(fail ? 1 : 0)
