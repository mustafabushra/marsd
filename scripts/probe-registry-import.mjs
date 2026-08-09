#!/usr/bin/env node
/**
 * A real quarter of the register, in a real browser, without killing the tab.
 *
 * `RESULT_CODE_HUNG` — reported from an actual import. The upload was batched
 * and the parse was not, so Chrome killed the renderer before the file had
 * finished being read. Batching what happens after a freeze helps nobody who
 * never gets past the freeze.
 *
 * So the parse moved into a worker, and this is what proves it: a 120,000-row
 * file — 57MB, the shape the Ministry publishes — is handed to the real screen
 * in a real Chromium, and the page must stay answering while it is read.
 *
 * The liveness check is the point. «It finished» would also be true of a tab
 * that froze for ninety seconds and then recovered, and that tab is the bug.
 *
 *   node scripts/probe-registry-import.mjs http://127.0.0.1:4300
 */

import { chromium } from 'playwright'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4300'
const FILE = process.argv[3] || process.env.REGISTRY_FILE

let pass = 0
let fail = 0
const ok = (n, c, d = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) } else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()

try {
  await signIn(page, BASE, { role: 'platform_admin' })
  await page.goto(`${BASE}/admin/registry-import`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1500)

  ok('الشاشة تفتح', await page.locator('text=/استيراد من السجل التجاري/').count() > 0)
  ok('معلومات المصدر تُقرأ من البوابة',
    await page.locator('text=/السجلات التجارية القائمة/').count() > 0,
    'لم تصل البيانات الوصفية')

  const started = Date.now()
  await page.setInputFiles('input[type="file"]', FILE)

  // While it reads: does the page still answer?
  //
  // A frozen renderer cannot evaluate anything. Asking it repeatedly during the
  // parse is the difference between «the parse finished» and «the parse did not
  // hang» — and only the second one is what was broken.
  let alive = 0
  let stalled = 0
  for (let i = 0; i < 20; i += 1) {
    const t0 = Date.now()
    try {
      await page.evaluate(() => document.title, null, { timeout: 4000 })
      const ms = Date.now() - t0
      alive += 1
      if (ms > 2000) stalled += 1
    } catch {
      stalled += 1
    }
    if (await page.locator('.marsad-row-count').count() > 0) break
    await page.waitForTimeout(500)
  }

  // Zero stalls is the signal, not a count of successful polls: the loop exits
  // as soon as the count appears, so a fast parse legitimately polls fewer
  // times. What must never happen is a poll that cannot be answered.
  ok('الصفحة تظل تستجيب أثناء القراءة', stalled === 0 && alive >= 5,
    `${alive} استجابة، ${stalled} تجمّد`)

  await page.waitForSelector('.marsad-row-count', { timeout: 300000 })
  const secs = Math.round((Date.now() - started) / 1000)

  const shown = await page.locator('.marsad-row-count').first().textContent()
  // Arabic-Indic digits. The screen renders «١٢٠٬٠٠٠» through toLocaleString,
  // and `/\d/` matches none of it — the check failed against a number that was
  // displayed perfectly, which is the audit reading its own assumption.
  ok('عدد الصفوف معروض', /[0-9٠-٩]/.test(shown || ''), shown || 'لا شيء')
  console.log(`     قُرئ في ${secs} ثانية`)

  const green = await page.locator('span:has-text("✓")').count()
  ok('الأعمدة العشرة تُطابَق تلقائياً', green >= 9, `${green} عموداً`)

  ok('زر البدء ظاهر', await page.locator('button:has-text("بدء الاستيراد")').count() > 0)

  // And nothing crashed along the way.
  ok('لا خطأ معروض', await page.locator('[style*="FEF2F2"]').count() === 0,
    await page.locator('[style*="FEF2F2"]').first().textContent().catch(() => ''))

} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 120)}`)
} finally {
  await browser.close()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — ملف حقيقي يُقرأ والصفحة حيّة\n`)
process.exit(fail ? 1 : 0)
