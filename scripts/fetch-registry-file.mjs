#!/usr/bin/env node
/**
 * Fetch the Ministry's commercial-register file from the portal, untouched.
 *
 * The dataset record on open.data.gov.sa labels its resource `format: "API"`
 * and points `url` at a SharePoint *folder* share. A server request to that
 * URL answers 403 in thirteen bytes, which is why every earlier attempt
 * concluded the file could only be fetched by a person.
 *
 * It can't be fetched by curl. It can be fetched by a browser: the share is
 * open to anyone with the link, and the folder holds the original CSV beside
 * two XLSX parts. The parts are the trap — they are the same data split to fit
 * a spreadsheet, and opening either one costs 864,000 companies at Excel's
 * 1,048,576-row ceiling. This takes the CSV and nothing else.
 *
 *   node scripts/fetch-registry-file.mjs <out-path>
 */

import { chromium } from 'playwright'
import { statSync } from 'node:fs'

const OUT = process.argv[2]
if (!OUT) {
  console.error('  الاستعمال: node scripts/fetch-registry-file.mjs <مسار الحفظ>')
  process.exit(1)
}

const SHARE = 'https://mcigovksa-my.sharepoint.com/:f:/g/personal/mcopendata_mc_gov_sa/IgC6CRMXwVeMRpe5ev20K5-jASpZfddet1P7B2PE5izO7YM?e=EPzmeP'
const WANT  = '2026 02q active crs.csv'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  locale: 'ar-SA',
  acceptDownloads: true,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
})
const page = await ctx.newPage()

try {
  console.log('  فتح المجلّد…')
  await page.goto(SHARE, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(9000)

  // Select the CSV by name. Clicking the row rather than searching for a
  // download button, because the button acts on the selection.
  const row = page.locator(`[role="row"]:has-text("${WANT}")`).first()
  await row.waitFor({ timeout: 60000 })
  await row.click()
  await page.waitForTimeout(2500)
  console.log(`  محدَّد: ${WANT}`)

  const dl = page.waitForEvent('download', { timeout: 30 * 60 * 1000 })

  const btn = page.locator('button:has-text("تنزيل"), button:has-text("Download")').first()
  if (await btn.count()) {
    await btn.click()
  } else {
    // The command bar collapses on narrow viewports; the keyboard shortcut is
    // the same command.
    await page.keyboard.press('Alt+d')
  }

  console.log('  التنزيل بدأ — ٣٤٩ ميغابايت، قد يستغرق دقائق…')
  const download = await dl
  await download.saveAs(OUT)

  const size = statSync(OUT).size
  console.log(`\n  ✅ ${OUT}`)
  console.log(`     ${(size / 1024 / 1024).toFixed(1)} ميغابايت`)

  if (size < 300 * 1024 * 1024) {
    console.log('     ⚠ أصغر من المتوقّع (٣٤٩م) — تحقّق قبل الاستيراد')
    process.exitCode = 1
  }
} catch (e) {
  console.log(`  ❌ ${e.message.slice(0, 220)}`)
  process.exitCode = 1
} finally {
  await browser.close()
}
