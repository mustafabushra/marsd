#!/usr/bin/env node
/**
 * /admin/data-management, against the real generations in the database.
 *
 * What it holds the screen to:
 *   the live generation is named, with its own numbers, and said to be partial
 *     when it is — 503 rows of 1.9 million is not «published» and nothing else
 *   the equation is shown and its verdict matches the database's `accounted`
 *   «no CR» and «neither identifier» are two different counts, on screen
 *   publish is offered only from `ready`, and the confirmation refuses to
 *     enable itself while the equation is open
 *   each section fails on its own
 *
 *   node scripts/probe-data-management.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4391'

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
const errs = []

try {
  const { rows: jobs } = await db.query(
    `select id, status, expected_rows, rows_loaded, rows_rejected, dataset_id
       from public.import_jobs order by started_at desc`)
  const { rows: [{ live }] } = await db.query(
    'select public.published_registry_dataset()::text live')
  const pub = jobs.find((j) => j.dataset_id === live)

  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage()
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)) })
  page.on('pageerror', (e) => errs.push(`PAGEERROR: ${String(e).slice(0, 160)}`))

  await signIn(page, BASE, { role: 'platform_admin' })
  await page.goto(`${BASE}/admin/data-management`, { waitUntil: 'domcontentloaded', timeout: 40000 })
  await page.waitForFunction(
    () => (document.querySelector('#main')?.innerText || '').includes('الجيل المنشور'),
    { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1200)

  const main = page.locator('#main')
  const body = await main.innerText()

  console.log('\n─── الصفحة ───')
  ok('تفتح وتعرض أقسامها',
    /الجيل المنشور حالياً/.test(body) && /الأجيال السابقة/.test(body), body.slice(0, 90))

  ok('كل الأجيال معروضة', jobs.every((j) =>
    body.includes(String(Number(j.expected_rows).toLocaleString('ar-SA')))
    || body.includes(String(j.expected_rows))), `${jobs.length} في القاعدة`)

  if (pub) {
    const loaded = Number(pub.rows_loaded).toLocaleString('ar-SA')
    ok('الجيل الحيّ يعرض صفوفه الحقيقية', body.includes(loaded), `${pub.rows_loaded}`)
    const partial = Number(pub.rows_loaded) / Number(pub.expected_rows) < 0.99
    ok(partial ? 'ويقول إنه جزئي حين يكون كذلك' : 'ولا يدّعي النقص حين يكون كاملاً',
      partial ? /جزئي/.test(body) : !/هذا الجيل جزئي/.test(body))
  }

  // ===== Import review =====
  console.log('\n─── مراجعة الاستيراد ───')
  await page.getByRole('button', { name: 'عرض التفاصيل الكاملة' }).first().click()
    .catch(async () => { await page.getByRole('button', { name: 'مراجعة' }).first().click() })
  await page.waitForSelector('[role="dialog"]', { timeout: 15000 })
  await page.waitForTimeout(2200)
  const dlg = await page.locator('[role="dialog"]').innerText()

  ok('تفتح لوحة المراجعة', /مراجعة الاستيراد/.test(dlg))
  ok('وتعرض المعادلة', /محمّل \+|متوقّع/.test(dlg), dlg.slice(0, 80))

  const j = pub || jobs[0]
  const closed = Number(j.rows_loaded) + Number(j.rows_rejected) === Number(j.expected_rows)
  ok('وحكمها على المعادلة يطابق القاعدة',
    closed ? /✔/.test(dlg) : /✖|غير محسوب|غير مغلقة/.test(dlg),
    closed ? 'مغلقة في القاعدة' : 'مفتوحة في القاعدة')

  ok('ويفصل «بلا أي معرّف» عن «الرقم الموحّد وحده»',
    /بلا أي معرّف/.test(dlg) && /الرقم الموحّد وحده/.test(dlg))
  ok('ويشرح أن غياب رقم السجل وحده ليس سبب رفض',
    /سجلات صالحة|لا تُرفض لهذا السبب/.test(dlg))

  // ===== Publish gate, on screen =====
  console.log('\n─── بوّابة النشر ───')
  const publishBtn = page.getByRole('button', { name: 'نشر هذا الجيل' })
  const cnt = await publishBtn.count()
  if (j.status === 'ready') {
    ok('زر النشر يظهر في «ready»', cnt === 1)
    if (cnt) {
      ok('ومعطّل حين تكون المعادلة مفتوحة', closed ? true : await publishBtn.isDisabled())
    }
  } else {
    ok(`لا زر نشر في «${j.status}»`, cnt === 0)
    ok('وتُشرح الحالة بدل إخفائها بصمت',
      /لا يُنشر إلا جيل في حالة|الجيل المنشور حالياً/.test(dlg))
  }

  await page.getByRole('button', { name: 'إغلاق' }).click()
  await page.waitForTimeout(700)
  ok('اللوحة تُغلق', (await page.locator('[role="dialog"]').count()) === 0)

  // ===== Responsive =====
  console.log('\n─── القياسات ───')
  for (const w of [1500, 1200, 1024, 700, 390]) {
    await page.setViewportSize({ width: w, height: 1000 })
    await page.waitForTimeout(600)
    const over = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth + 2)
    ok(`لا فيض أفقي @${w}`, !over)
  }

  ok('console نظيف', errs.length === 0, errs.slice(0, 2).join(' | '))
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 220)}`)
} finally {
  await browser.close()
  await db.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — الأجيال ظاهرة، والمعادلة تحكم النشر\n`)
process.exit(fail ? 1 : 0)
