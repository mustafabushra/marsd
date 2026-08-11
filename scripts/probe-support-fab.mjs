#!/usr/bin/env node
/**
 * The floating button, at the widths where it has to work.
 *
 * The entry point was a sidebar item, and below 1024px the sidebar is an
 * off-canvas drawer — so on every phone the only way to report a problem was
 * behind a hamburger, which is four steps at the moment somebody is already
 * annoyed. This checks it is reachable in one, at every width.
 *
 * And the stacking, which is the part the first probe could not see: it opened
 * the dialog at 1440px and resized afterwards, with the drawer shut the whole
 * time. The dialog was z-index 90 under a drawer at 120, so opening it from
 * inside the menu on a phone put it behind the menu. Here the drawer is opened
 * first, on purpose.
 *
 *   node scripts/probe-support-fab.mjs [url]
 */

import { chromium } from 'playwright'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4392'

let pass = 0
let fail = 0
const ok = (n, c, d = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

const browser = await chromium.launch()

try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 950 } })).newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 150)))
  await signIn(page, BASE, { role: 'company_admin' })

  const fab = page.getByRole('button', { name: 'الإبلاغ عن مشكلة' })
  const dlg = page.getByRole('dialog', { name: 'الإبلاغ عن مشكلة' })

  // ===== Present on every company screen, at every width =====
  console.log('\n─── الزر العائم ───')
  for (const path of ['/search', '/dashboard', '/my-reports', '/compare']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 40000 })
    // Wait for the button rather than for a guessed number of milliseconds.
    // A fixed 2.2s read /my-reports while it was still mounting and called a
    // present button missing.
    const seen = await fab.waitFor({ state: 'visible', timeout: 20000 })
      .then(() => true).catch(() => false)
    ok(`ظاهر على ${path}`, seen)
  }

  await page.goto(`${BASE}/search`, { waitUntil: 'domcontentloaded', timeout: 40000 })
  await page.waitForTimeout(2200)

  console.log('\n─── عند كل عرض ───')
  for (const w of [1500, 1200, 1024, 700, 390, 320]) {
    await page.setViewportSize({ width: w, height: 860 })
    // The sidebar animates for .22s on a width change and the layout settles
    // after it. Reading at 500ms caught the page mid-transition and reported an
    // overflow that does not exist once it lands.
    await page.waitForTimeout(1100)
    const vis = await fab.isVisible().catch(() => false)
    const box = await fab.boundingBox().catch(() => null)
    // Inside the viewport, not hanging off the edge of it.
    const inside = box ? box.x >= 0 && box.x + box.width <= w + 1 : false
    const over = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth + 2)
    ok(`@${w} ظاهر وداخل الشاشة ولا يسبّب فيضاً`, vis && inside && !over,
      `visible=${vis} inside=${inside} overflow=${over}`)
  }

  // The label collapses on the narrowest screens; the accessible name must not.
  await page.setViewportSize({ width: 360, height: 800 })
  await page.waitForTimeout(500)
  ok('وله اسم يُقرأ حين يختفي النصّ', await fab.getAttribute('aria-label') === 'الإبلاغ عن مشكلة')

  // ===== One tap, on a phone =====
  console.log('\n─── الفتح على الجوال ───')
  await fab.click()
  await dlg.waitFor({ state: 'visible', timeout: 10000 })
  ok('ضغطة واحدة تفتح النافذة', await dlg.isVisible())
  ok('ولا فيض أفقي والنافذة مفتوحة', !(await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth + 2)))
  await page.getByRole('button', { name: 'إغلاق' }).click()
  await page.waitForTimeout(600)
  ok('وتُغلق', (await dlg.count()) === 0)

  // ===== The stacking bug =====
  console.log('\n─── فوق قائمة الجوال ───')
  // Open the drawer, then the dialog. The drawer is z-index 120; a dialog at 90
  // opens behind it and cannot be touched.
  const burger = page.locator('.marsad-appbar button').first()
  await burger.click()
  await page.waitForTimeout(700)
  const drawerOpen = await page.locator('.marsad-sidebar[data-open="true"]').count()
  ok('القائمة تفتح', drawerOpen === 1)

  // The scrim should cover the button rather than the button floating over an
  // open menu.
  ok('والزر العائم مُغطّى بالقائمة لا فوقها',
    await page.evaluate(() => {
      const b = document.querySelector('.marsad-support-fab')
      const s = document.querySelector('.marsad-scrim')
      if (!b || !s) return false
      const z = (el) => Number(getComputedStyle(el).zIndex) || 0
      return z(s) > z(b)
    }))

  // Close it by tapping beside the panel, which is what a person does. Two
  // things make this a coordinate rather than a locator: the scrim's centre
  // lies under the drawer, and the burger is unreachable while the scrim is up
  // — correctly so, the scrim is there to swallow exactly those clicks. In RTL
  // the drawer is pinned to the right, so the free strip is the left edge.
  await page.mouse.click(24, 420)
  await page.waitForTimeout(900)
  ok('والقائمة تُغلق بالضغط بجانبها',
    (await page.locator('.marsad-sidebar[data-open="true"]').count()) === 0)
  await fab.click()
  await dlg.waitFor({ state: 'visible', timeout: 10000 })
  const above = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-label="الإبلاغ عن مشكلة"]')
    const side = document.querySelector('.marsad-sidebar')
    const z = (el) => Number(getComputedStyle(el).zIndex) || 0
    return d && side ? z(d) > z(side) : false
  })
  ok('والنافذة فوق القائمة في ترتيب الطبقات', above, 'النافذة تحت القائمة')

  // And it actually receives the click — the real consequence of the above.
  const hit = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-label="الإبلاغ عن مشكلة"]')
    const r = d.getBoundingClientRect()
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + 40)
    return d.contains(el)
  })
  ok('وتستقبل الضغط فعلاً', hit, 'شيء آخر فوقها')

  ok('console نظيف', errs.length === 0, errs.slice(0, 2).join(' | '))
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 220)}`)
} finally {
  await browser.close()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — الزر موجود عند كل عرض، وضغطة واحدة تكفي\n`)
process.exit(fail ? 1 : 0)
