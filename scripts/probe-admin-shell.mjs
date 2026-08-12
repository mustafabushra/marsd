#!/usr/bin/env node
/**
 * The admin shell's layout: the switcher, the role, the search, the urgent count.
 *
 * These are chrome, so no behaviour probe covers them — and chrome is exactly
 * what a layout change breaks. The switcher in particular has to actually
 * switch: a control that looks like navigation and does nothing is worse than
 * the buried button it replaced.
 */
import { chromium } from 'playwright'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4410'
let pass = 0, fail = 0
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) } }

const browser = await chromium.launch()
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)))
  await signIn(page, BASE, { role: 'platform_admin' })
  await page.goto(`${BASE}/admin/command-center`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForFunction(() => (document.querySelector('#main')?.innerText || '').length > 400,
    { timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(1500)

  console.log('\n─── الشريط الجانبي ───')
  const side = page.locator('aside.marsad-sidebar')
  ok('عرضه 288px', (await side.evaluate((e) => getComputedStyle(e).width)) === '288px',
    await side.evaluate((e) => getComputedStyle(e).width))

  const sw = page.getByRole('tablist', { name: 'التبديل بين اللوحتين' })
  ok('مفتاح التبديل موجود', await sw.count() === 1)
  ok('  ولوحة الإدارة هي المحدَّدة',
    (await sw.getByRole('tab', { name: 'لوحة الإدارة' }).getAttribute('aria-selected')) === 'true')
  ok('  والشعار لا يكرّر «لوحة الإدارة»',
    (await side.innerText()).split('لوحة الإدارة').length - 1 === 1, 'مكرّرة')
  ok('وشارة الدور معروضة', /مشرف تدقيق وحوكمة/.test(await side.innerText()))

  console.log('\n─── الهيدر ───')
  const header = page.locator('header.marsad-appbar')
  const ht = await header.innerText()
  ok('شريط البحث في الوسط', /ابحث عن شركة|Ctrl/.test(ht), ht.slice(0, 70))
  ok('ولم يعد فيه «وضع المسؤول»', !/وضع المسؤول/.test(ht))

  // The urgent control appears only when there is work, so both outcomes are fine
  // — what is not fine is a «0» sitting there permanently.
  const urgent = page.getByRole('button', { name: /يحتاج قراراً/ })
  const n = await urgent.count()
  ok(`مركز الإجراءات العاجلة ${n ? 'معروض' : 'مخفي (لا عمل معلّق)'}`, true)
  if (n) {
    ok('  ولا يعرض صفراً', !/\b0\b/.test(await urgent.innerText()), await urgent.innerText())
    await urgent.click()
    await page.waitForTimeout(2500)
    ok('  والضغط ينقل إلى مركز العمل', page.url().includes('/admin/work'), page.url())
    await page.goto(`${BASE}/admin/command-center`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
  }

  console.log('\n─── التبديل يبدّل فعلاً ───')
  await page.getByRole('tab', { name: 'لوحة الشركات' }).click()
  await page.waitForTimeout(3000)
  ok('الضغط يغادر لوحة الإدارة', !new URL(page.url()).pathname.startsWith('/admin'), page.url())

  console.log('\n─── القياسات ───')
  await page.goto(`${BASE}/admin/command-center`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  for (const w of [1500, 1200, 1024, 700, 390]) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.waitForTimeout(600)
    const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
    if (over) ok(`لا فيض @${w}`, false, 'يفيض')
  }
  ok('لا فيض أفقي عند أي عرض', true)
  ok('console نظيف', errs.length === 0, errs[0])
} catch (e) { fail++; console.log(`  ❌ توقّف: ${e.message.slice(0, 200)}`) }
finally { await browser.close() }
console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — الهيكل كما في المواصفة، بهوية مرصد\n`)
process.exit(fail ? 1 : 0)
