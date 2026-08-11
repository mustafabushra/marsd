#!/usr/bin/env node
/**
 * A ticket sent from a company, and read by Marsad — the whole loop.
 *
 * The half that matters and is easy to skip: a form that sends somewhere nobody
 * looks is worse than no form, because it collects the complaint and the trust
 * and answers neither. So the ticket is really submitted from the company side,
 * then found on /admin/support, opened, its screenshot fetched through a signed
 * URL, and its status moved.
 *
 * Cleans up after itself, storage object included.
 *
 *   node scripts/probe-support-roundtrip.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

const MARK = `فحص الرحلة ${Date.now()}`
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64')
const dir = mkdtempSync(join(tmpdir(), 'marsad-rt-'))
const shot = join(dir, 'screen.png')
writeFileSync(shot, PNG)

const browser = await chromium.launch()
let ticketId = null

try {
  // ===== The company sends one =====
  console.log('\n─── من الشركة ───')
  const c1 = await browser.newContext({ viewport: { width: 1400, height: 1000 } })
  const p1 = await c1.newPage()
  await signIn(p1, BASE, { role: 'company_admin' })
  await p1.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded', timeout: 40000 })
  await p1.waitForTimeout(2500)
  await p1.getByRole('button', { name: 'الدعم الفني' }).click()
  const dlg = p1.getByRole('dialog', { name: 'الإبلاغ عن مشكلة' })
  await dlg.waitFor({ state: 'visible', timeout: 10000 })
  await dlg.locator('#sup-kind').selectOption('technical')
  await dlg.locator('#sup-details').fill(`${MARK} — الصفحة تتوقّف عند فتح التقارير.`)
  await dlg.locator('input[type=file]').setInputFiles(shot)
  await p1.waitForTimeout(600)
  await dlg.getByRole('button', { name: 'إرسال' }).click()
  await p1.waitForTimeout(6000)
  ok('البلاغ أُرسل', /وصلنا بلاغك/.test(await dlg.innerText()))
  await c1.close()

  const { rows } = await db.query(
    'select id from public.support_tickets where details like $1 limit 1', [`%${MARK}%`])
  ok('ووصل إلى القاعدة', rows.length === 1)
  if (!rows.length) throw new Error('لا بلاغ لمتابعته')
  ticketId = rows[0].id

  // ===== Marsad reads it =====
  console.log('\n─── عند مرصد ───')
  const c2 = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  const p2 = await c2.newPage()
  const errs = []
  p2.on('pageerror', (e) => errs.push(String(e).slice(0, 150)))
  await signIn(p2, BASE, { role: 'platform_admin' })
  await p2.goto(`${BASE}/admin/support`, { waitUntil: 'domcontentloaded', timeout: 40000 })
  await p2.waitForFunction(
    () => (document.querySelector('#main')?.innerText || '').includes('الدعم الفني'),
    { timeout: 20000 }).catch(() => {})
  await p2.waitForTimeout(2000)

  const main = p2.locator('#main')
  ok('الشاشة تفتح', (await main.innerText()).includes('الدعم الفني'))
  ok('والبلاغ ظاهر في «المفتوحة»', (await main.innerText()).includes(MARK),
    (await main.innerText()).slice(0, 100))

  await main.getByText(MARK, { exact: false }).first().click()
  const det = p2.getByRole('dialog', { name: 'تفاصيل البلاغ' })
  await det.waitFor({ state: 'visible', timeout: 10000 })
  await p2.waitForTimeout(1800)
  const dtext = await det.innerText()
  ok('التفاصيل تفتح', dtext.includes(MARK))
  ok('وتعرض الصفحة التي جاء منها', dtext.includes('/search'), dtext.slice(0, 120))
  ok('والمرفق مذكور', dtext.includes('screen.png'), dtext.slice(0, 120))

  // The signed URL has to actually resolve to the bytes.
  const [popup] = await Promise.all([
    p2.waitForEvent('popup', { timeout: 15000 }).catch(() => null),
    det.getByRole('button', { name: /screen\.png/ }).click(),
  ])
  if (popup) {
    await popup.waitForLoadState('domcontentloaded').catch(() => {})
    ok('والرابط الموقّع يفتح الملف', /support-attachments/.test(popup.url()), popup.url().slice(0, 90))
    await popup.close()
  } else {
    ok('والرابط الموقّع يفتح الملف', false, 'لم تُفتح نافذة')
  }

  // ===== Status =====
  console.log('\n─── الحالة ───')
  await det.getByRole('button', { name: 'قيد المعالجة', exact: true }).click()
  await p2.waitForTimeout(2500)
  const { rows: after } = await db.query(
    'select status from public.support_tickets where id = $1', [ticketId])
  ok('تغيير الحالة يُحفَظ في القاعدة', after[0]?.status === 'in_progress', after[0]?.status)

  ok('console نظيف', errs.length === 0, errs.slice(0, 2).join(' | '))
  await c2.close()
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
    'select count(*)::int n from public.support_tickets where details like $1', [`%${MARK}%`])
  console.log(`\n  🧹 المتبقّي: ${left.n}`)
  await db.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — البلاغ يُرسَل، ويُقرأ، وتُفتح صورته\n`)
process.exit(fail ? 1 : 0)
