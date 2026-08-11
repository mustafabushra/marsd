#!/usr/bin/env node
/**
 * The `ready` path on screen — the one no real generation is currently in.
 *
 * A synthetic job is inserted in `ready` with a *closed* equation, driven, then
 * removed; a second one with an *open* equation checks the confirmation refuses
 * to enable itself. Neither is ever published: the confirm button is inspected,
 * not clicked, because publishing swaps the register the whole product reads.
 *
 * The rows are inserted against a dataset id of their own and deleted in a
 * finally, so nothing real is touched even if this fails halfway.
 *
 *   node scripts/probe-publish-ready-ui.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
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

const madeJobs = []
const browser = await chromium.launch()

const makeJob = async (label, expected, loaded, rejected) => {
  const id = randomUUID()
  const ds = randomUUID()
  await db.query(
    `insert into public.import_jobs
       (id, source_key, dataset_id, snapshot_period, file_name, expected_rows,
        rows_loaded, rows_rejected, status, verification, started_at)
     values ($1,'ministry_of_commerce',$2,$3,'probe.xlsx',$4,$5,$6,'ready',$7, now())`,
    [id, ds, label, expected, loaded, rejected, JSON.stringify({
      verify: [{ key: 'accounted', ok: loaded + rejected === expected,
        label: `${loaded} محمّل + ${rejected} مرفوض = ${expected} متوقّع` }],
    })])
  madeJobs.push(id)
  return id
}

try {
  const CLOSED = 'فحص المعادلة المغلقة'
  const OPEN = 'فحص المعادلة المفتوحة'
  const closedId = await makeJob(CLOSED, 100, 90, 10)   // 90 + 10 = 100
  const openId = await makeJob(OPEN, 100, 50, 10)       // 50 + 10 ≠ 100

  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 150)))
  await signIn(page, BASE, { role: 'platform_admin' })

  // By job id, not by visible text. Two `ready` generations differ only in
  // their numbers, and a text filter picked whichever it reached first — this
  // drove the closed-equation card while claiming to test the open one.
  const openReview = async (jobId) => {
    await page.goto(`${BASE}/admin/data-management`, { waitUntil: 'domcontentloaded', timeout: 40000 })
    const card = page.locator(`[data-job-id="${jobId}"]`)
    await card.waitFor({ state: 'visible', timeout: 20000 })
    await card.getByRole('button', { name: 'مراجعة الاستيراد', exact: true }).click()
    await page.waitForSelector('[role="dialog"]', { timeout: 15000 })
    await page.waitForTimeout(2000)
  }

  // ===== Closed equation =====
  console.log('\n─── جيل «ready» ومعادلته مغلقة ───')
  await openReview(closedId)
  let dlg = await page.locator('[role="dialog"]').innerText()
  ok('يظهر في «جيل قادم» بحالة جاهز للنشر', /جاهز للنشر/.test(dlg))
  ok('والمعادلة معلنة مغلقة', /✔/.test(dlg), dlg.match(/[✔✖][^\n]{0,60}/)?.[0])

  const pubBtn = page.getByRole('button', { name: 'نشر هذا الجيل' })
  ok('زر النشر معروض', await pubBtn.count() === 1)
  ok('وغير معطّل', !(await pubBtn.isDisabled()))

  await pubBtn.click()
  await page.waitForTimeout(1200)
  const confirmDlg = page.locator('[role="dialog"][aria-label="تأكيد النشر"]')
  ok('الضغط يفتح تأكيد النشر', await confirmDlg.count() === 1)
  const ctext = await confirmDlg.innerText()
  for (const k of ['المتوقّع', 'المحمّل', 'المرفوض', 'محسوب', 'المجموعة القادمة', 'المجموعة الحالية']) {
    ok(`  التأكيد يعرض «${k}»`, ctext.includes(k))
  }
  const confirmBtn = confirmDlg.getByRole('button', { name: 'تأكيد النشر' })
  ok('وزر التأكيد مفعّل والمعادلة مغلقة', !(await confirmBtn.isDisabled()))

  // Not clicked. Publishing swaps the live register.
  await confirmDlg.getByRole('button', { name: 'تراجع' }).click()
  await page.waitForTimeout(600)
  ok('و«تراجع» يغلق التأكيد', await confirmDlg.count() === 0)

  // ===== Open equation =====
  console.log('\n─── جيل «ready» ومعادلته مفتوحة ───')
  await openReview(openId)
  dlg = await page.locator('[role="dialog"]').innerText()
  ok('المعادلة معلنة مفتوحة', /✖|غير محسوب/.test(dlg), dlg.match(/[✔✖][^\n]{0,60}/)?.[0])
  ok('وسبب المنع مذكور', /غير مغلقة|غير محسوب/.test(dlg))
  const pub2 = page.getByRole('button', { name: 'نشر هذا الجيل' })
  ok('زر النشر معطّل', await pub2.count() === 1 && await pub2.isDisabled())

  ok('console نظيف', errs.length === 0, errs.slice(0, 2).join(' | '))
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 220)}`)
} finally {
  await browser.close()
  for (const id of madeJobs) {
    await db.query('delete from public.import_jobs where id = $1', [id]).catch(() => {})
  }
  const { rows: [left] } = await db.query(
    `select count(*)::int n from public.import_jobs where file_name = 'probe.xlsx'`)
  console.log(`\n  🧹 مهامّ الفحص المتبقية: ${left.n}`)
  await db.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — «ready» وحدها تنشر، والمعادلة تحكم التأكيد\n`)
process.exit(fail ? 1 : 0)
