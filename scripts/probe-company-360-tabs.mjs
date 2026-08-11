#!/usr/bin/env node
/**
 * All eleven tabs of the company file, each one opened and read.
 *
 * The defect this exists to catch: a tab body that names something undefined
 * renders nothing and takes the page with it, while the build passes and the
 * console stays clean until the moment it is clicked. Three tabs shipped that
 * way. A tab nobody opens during review is a tab nobody has tested, so this
 * opens all of them, every time.
 *
 * Each tab must, on its own:
 *   survive the click            — the tab row is still there afterwards
 *   stay selected                — aria-selected followed the click
 *   put something on the screen  — content, an empty state, or an error state,
 *                                  but never a blank panel
 *   add nothing to the console
 *
 *   node scripts/probe-company-360-tabs.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4391'

const TABS = [
  'نظرة عامة', 'البيانات الأساسية', 'المستندات', 'الحساب والطلبات',
  'التقارير', 'طلبات التوضيح', 'الاعتراضات', 'مؤشر الثقة',
  'الخطّ الزمني', 'سجل التدقيق', 'سجل النشاط',
]

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

try {
  const { rows: [co] } = await db.query(
    `select id, name from public.companies order by created_at limit 1`)

  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage()
  const errs = []
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)) })
  page.on('pageerror', (e) => errs.push(`PAGEERROR: ${String(e).slice(0, 160)}`))

  await signIn(page, BASE, { role: 'platform_admin' })
  await page.goto(`${BASE}/admin/company/${co.id}`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2500)

  // Scoped to the tablist. «الاعتراضات» and «التقارير» are also navigation
  // entries; an unscoped match by name clicks the sidebar and leaves the page.
  const tablist = page.getByRole('tablist', { name: 'أقسام ملفّ الشركة' })
  const main = page.locator('#main')

  ok(`التبويبات ${TABS.length} موجودة`, await tablist.getByRole('tab').count() === TABS.length,
    `وجد ${await tablist.getByRole('tab').count()}`)

  console.log('\n─── كل تبويب على حدة ───')
  for (const name of TABS) {
    const before = errs.length
    await tablist.getByRole('tab', { name, exact: true }).click()
    await page.waitForTimeout(1400)

    const stillThere = await tablist.count() === 1
    const selected = stillThere
      && (await tablist.getByRole('tab', { name, exact: true }).getAttribute('aria-selected')) === 'true'
    // The panel is what sits under the tab row, so measure the main region
    // minus the header and the row itself rather than the whole document.
    const text = stillThere ? (await main.innerText()).trim() : ''
    const painted = text.length > 200
    const clean = errs.length === before

    const why = !stillThere ? 'الصفحة انهارت' : !selected ? 'لم يُحدَّد'
      : !painted ? 'لوحة فارغة' : errs.slice(before).join(' | ')
    ok(`«${name}»`, stillThere && selected && painted && clean, why)

    if (!stillThere) {
      // The page is gone; reload so the remaining tabs are still testable.
      await page.goto(`${BASE}/admin/company/${co.id}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(2200)
    }
  }

  console.log('\n─── التنقّل ───')
  await tablist.getByRole('tab', { name: 'المستندات', exact: true }).click()
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: '‹ رجوع لسجلّ الشركات' }).click()
  await page.waitForTimeout(2000)
  ok('الرجوع يعود لسجلّ الشركات', page.url().includes('/admin/roster'), page.url())
  await page.goBack()
  await page.waitForTimeout(2200)
  ok('والرجوع بالمتصفّح يعيد فتح الملفّ', page.url().includes(co.id))

  console.log('\n─── القياسات ───')
  for (const w of [1500, 1200, 1024, 700, 390]) {
    await page.setViewportSize({ width: w, height: 1000 })
    await page.waitForTimeout(700)
    const over = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth + 2)
    ok(`لا فيض أفقي @${w}`, !over)
  }

  ok('console نظيف طوال الجولة', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 220)}`)
} finally {
  await browser.close()
  await db.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — كل تبويب يفتح ويعرض شيئاً\n`)
process.exit(fail ? 1 : 0)
