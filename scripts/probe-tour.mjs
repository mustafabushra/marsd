#!/usr/bin/env node
/**
 * The guided tour, driven.
 *
 * What matters and is easy to get wrong:
 *   it starts by itself on a first visit, and never again after a decision
 *   every step points at an element that is really there
 *   a step whose element is missing is dropped, not fatal
 *   the buttons do what they say, in both directions
 *   it survives the widths the product is used at
 *
 * localStorage is cleared between contexts so «first visit» is really first.
 *
 *   node scripts/probe-tour.mjs [url]
 */

import { chromium } from 'playwright'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4404'

let pass = 0
let fail = 0
const ok = (n, c, d = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

const browser = await chromium.launch()

const dialog = (p) => p.getByRole('dialog', { name: /جولة تعريفية/ })

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)))
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)) })

  await signIn(page, BASE, { role: 'company_admin' })

  // ===== First visit =====
  console.log('\n─── أول زيارة ───')
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 40000 })
  await page.evaluate(() => window.localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })
  // The tour waits for the dashboard's own anchors before opening, so this
  // waits for the tour rather than for a number of seconds.
  await dialog(page).waitFor({ state: 'visible', timeout: 25000 }).catch(() => {})

  const d = dialog(page)
  ok('تبدأ تلقائياً على لوحة التحكم', await d.count() === 1)

  const text = await d.innerText().catch(() => '')
  ok('وتعرض العنوان والخطوة', /\d+\s*\/\s*\d+/.test(text), text.slice(0, 70).replace(/\n/g, ' '))
  const total = Number((text.match(/\d+\s*\/\s*(\d+)/) || [])[1] || 0)
  // Eleven anchors exist on a loaded dashboard. Fewer means the tour opened
  // before the page had finished drawing and silently dropped steps, which is
  // the bug this count is here to catch.
  ok('وتعرض كل الخطوات لا بعضها', total === 11, `${total} خطوة من 11`)

  // ===== Every step points at something real =====
  console.log('\n─── كل خطوة تشير إلى عنصر موجود ───')
  let seen = 0
  let missing = 0
  for (let n = 0; n < total; n++) {
    const highlighted = await page.evaluate(() => {
      // The ring is the only element with this border colour.
      const ring = [...document.querySelectorAll('div')].find((el) => {
        const s = getComputedStyle(el)
        return s.position === 'fixed' && s.borderColor.includes('22, 163, 74')
      })
      if (!ring) return null
      const r = ring.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }
    })
    if (!highlighted || highlighted.w < 8 || highlighted.h < 8) missing += 1
    seen += 1
    if (n < total - 1) {
      await d.getByRole('button', { name: 'التالي' }).click()
      await page.waitForTimeout(900)
    }
  }
  ok(`مرّت الخطوات ${seen} كلّها`, seen === total)
  ok('وكلٌّ منها أبرز عنصراً له حجم', missing === 0, `${missing} بلا إبراز`)

  // ===== Finish =====
  console.log('\n─── الإنهاء ───')
  ok('آخر خطوة زرّها «إنهاء»',
    (await d.getByRole('button', { name: 'إنهاء' }).count()) === 1)
  await d.getByRole('button', { name: 'إنهاء' }).click()
  await page.waitForTimeout(800)
  ok('وتُغلق', (await dialog(page).count()) === 0)

  const stored = await page.evaluate(() =>
    Object.entries(window.localStorage).filter(([k]) => k.startsWith('marsad.tour')))
  ok('وتُحفظ الحالة', stored.length === 1 && stored[0][1] === 'finished', JSON.stringify(stored))

  // ===== And does not nag =====
  console.log('\n─── لا تُزعج بعدها ───')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(9000)
  ok('لا تفتح تلقائياً بعد الإنهاء', (await dialog(page).count()) === 0)

  // ===== But the button always works =====
  console.log('\n─── الزرّ يعيدها دائماً ───')
  const launcher = page.getByRole('button', { name: /جولة تعريفية/ })
  ok('زرّ «جولة تعريفية» ظاهر', await launcher.count() >= 1)
  await launcher.first().click()
  await page.waitForTimeout(1200)
  ok('ويعيد فتحها من أوّلها',
    (await dialog(page).count()) === 1
    && /(^|\D)1\s*\/\s*\d+/.test(await dialog(page).innerText()))

  // ===== Back and forth =====
  console.log('\n─── التالي والسابق ───')
  await dialog(page).getByRole('button', { name: 'التالي' }).click()
  await page.waitForTimeout(700)
  const atTwo = /(^|\D)2\s*\/\s*\d+/.test(await dialog(page).innerText())
  ok('«التالي» يتقدّم', atTwo)
  await dialog(page).getByRole('button', { name: 'السابق' }).click()
  await page.waitForTimeout(700)
  ok('و«السابق» يرجع', /(^|\D)1\s*\/\s*\d+/.test(await dialog(page).innerText()))
  ok('ولا «سابق» في الخطوة الأولى',
    (await dialog(page).getByRole('button', { name: 'السابق' }).count()) === 0)

  // ===== Skip =====
  console.log('\n─── التخطّي ───')
  await dialog(page).getByRole('button', { name: 'تخطّي' }).click()
  await page.waitForTimeout(700)
  ok('«تخطّي» يُغلق', (await dialog(page).count()) === 0)
  const afterSkip = await page.evaluate(() =>
    Object.entries(window.localStorage).find(([k]) => k.startsWith('marsad.tour'))?.[1])
  ok('ويُسجَّل كقرار', afterSkip === 'skipped', String(afterSkip))

  // ===== Widths =====
  console.log('\n─── القياسات ───')
  await launcher.first().click()
  await page.waitForTimeout(1200)
  for (const w of [1440, 1024, 700, 390]) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.waitForTimeout(1100)
    const box = await dialog(page).boundingBox().catch(() => null)
    const inside = box ? box.x >= -1 && box.x + box.width <= w + 2 : false
    const over = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth + 2)
    ok(`@${w} البطاقة داخل الشاشة ولا فيض`, inside && !over,
      box ? `x=${Math.round(box.x)} w=${Math.round(box.width)} over=${over}` : 'لا بطاقة')
  }

  // ===== Escape =====
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.waitForTimeout(600)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(700)
  ok('ومفتاح Escape يُنهيها', (await dialog(page).count()) === 0)

  ok('console نظيف', errs.filter((e) => !/ERR_ABORTED/.test(e)).length === 0,
    errs.filter((e) => !/ERR_ABORTED/.test(e))[0])
  await ctx.close()
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 220)}`)
} finally {
  await browser.close()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — جولة تبدأ مرّة، وتُستدعى متى شئت\n`)
process.exit(fail ? 1 : 0)
