#!/usr/bin/env node
/**
 * The parts that only exist after a tap, and the desktop that must not move.
 *
 * `audit-mobile.mjs` measures a page as it loads. The side drawer, the account
 * menu and the notification panel are not in that page — they are created when
 * a finger lands on them, and a page that measures clean can still open a
 * drawer wider than the screen. This opens each one and measures it.
 *
 * It also guards the other direction. Every responsive rule is inside a
 * `max-width` query, but «it is inside a media query» is a claim about the
 * source, not about the browser. So the same elements are measured at 1440px
 * and required to be the desktop sizes they always were.
 *
 *   node scripts/audit-mobile-interactions.mjs [url]
 */

import { chromium } from 'playwright'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4173'
const PHONE = [320, 375, 390, 412]

/**
 * Anything sticking out of the viewport, measured after the tap.
 *
 * Two things sit outside the screen on purpose and are not faults:
 *
 * The closed drawer. It is parked at `translateX(100%)` so it can slide in;
 * `getBoundingClientRect` reports where it is parked, which is exactly one
 * screen to the side. It causes no scrolling and is the mechanism, not a bug.
 *
 * Anything inside a strip that scrolls sideways. A row of filter chips a
 * reader can swipe is a choice — the content is reachable. What is not
 * acceptable is the *page* scrolling, and that is measured separately.
 */
const SPILL = (vw) => {
  const out = []

  const inScrollableStrip = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p)
      if (/auto|scroll/.test(o.overflowX) || /auto|scroll/.test(o.overflow)) return true
    }
    return false
  }

  /**
   * Already cut off by an ancestor, and so not on the screen at all.
   *
   * `getBoundingClientRect` reports where a box would be whether or not
   * anything shows it. A round avatar clips its own contents, so a layer inside
   * it that is wider than the circle is invisible and moves nothing — reporting
   * it as «off the left edge» is reporting something that is not there, and a
   * check that does that gets ignored, which is worse than not having it.
   */
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p)
      if (o.overflow === 'hidden' || o.overflowX === 'hidden' || o.overflow === 'clip') {
        const pr = p.getBoundingClientRect()
        const r = el.getBoundingClientRect()
        if (r.left >= pr.left - 1 && r.right <= pr.right + 1) return false
        return true
      }
    }
    return false
  }

  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    if (r.right <= vw + 1 && r.left >= -1) continue

    if (el.closest('.marsad-sidebar[data-open="false"]') || el.matches('.marsad-sidebar[data-open="false"]')) continue
    if (inScrollableStrip(el) || clipped(el)) continue

    // The skip link. It is parked ten thousand pixels away until a keyboard
    // focuses it, which is how a skip link is built — it exists for a screen
    // reader and must not be visible to anyone else.
    if (el.matches('a') && /^\s*تخط/.test(el.textContent || '')) continue

    const p = el.parentElement?.getBoundingClientRect()
    if (!p || (p.right <= vw + 1 && p.left >= -1)) {
      out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/)[0]} [${Math.round(r.left)}→${Math.round(r.right)}] ${(el.textContent || '').trim().slice(0, 30)}`)
    }
  }
  return { spill: out, scrollWidth: document.documentElement.scrollWidth }
}

const browser = await chromium.launch()
let bad = 0
let checks = 0

const report = (label, r, vw) => {
  checks += 1
  const scrolls = r.scrollWidth > vw + 1
  if (!scrolls && !r.spill.length) return console.log(`  ✅ ${label}`)
  bad += 1
  console.log(`  ❌ ${label}${scrolls ? ` — تمرير أفقي ${r.scrollWidth}px` : ''}`)
  for (const s of r.spill.slice(0, 3)) console.log(`        ☝ ${s}`)
}

for (const width of PHONE) {
  const ctx = await browser.newContext({
    viewport: { width, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  })
  const page = await ctx.newPage()
  await signIn(page, BASE)
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(500)

  // The bar at the top, still a bar.
  //
  // This check exists because the audit passed a header that was 181px tall on
  // a 780px phone. Nothing overflowed, nothing was clipped, no target was
  // small — every question the audit knew how to ask had a good answer, and
  // the page was wrong anyway. A phone app bar is one row. Three rows of it,
  // with the bell and the avatar hanging over the article beneath, is the shape
  // being wrong rather than the size, and «measures clean» had come to mean
  // «the checks I wrote».
  const bar = await page.evaluate(() => {
    const h = document.querySelector('header')
    const m = document.querySelector('#main')
    if (!h || !m) return null
    const hb = h.getBoundingClientRect()
    const spill = [...h.querySelectorAll('*')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.height && r.bottom > hb.bottom + 1 }).length
    return { h: Math.round(hb.height), overlapsMain: hb.bottom > m.getBoundingClientRect().top + 1, spill }
  })
  if (bar) {
    checks += 1
    if (bar.h > 64 || bar.overlapsMain || bar.spill) {
      bad += 1
      console.log(`  ❌ ${width}px الهدر ${bar.h}px${bar.spill ? ` و${bar.spill} عنصراً خارجه` : ''}${bar.overlapsMain ? ' ويغطي المحتوى' : ''}`)
    } else {
      console.log(`  ✅ ${width}px الهدر صف واحد ${bar.h}px`)
    }
  }

  // The side drawer.
  const toggle = page.locator('.marsad-nav-toggle').first()
  if (await toggle.count()) {
    await toggle.click()
    await page.waitForTimeout(450)
    report(`${width}px القائمة الجانبية مفتوحة`, await page.evaluate(SPILL, width), width)

    // Open, it must be reachable and not wider than the screen it covers.
    const box = await page.locator('.marsad-sidebar').first().boundingBox()
    checks += 1
    if (!box || box.width > width || box.x < -1) {
      bad += 1
      console.log(`  ❌ ${width}px عرض القائمة ${Math.round(box?.width ?? 0)}px عند ${Math.round(box?.x ?? 0)}`)
    } else {
      console.log(`  ✅ ${width}px عرض القائمة ${Math.round(box.width)}px داخل الشاشة`)
    }
    // Escape, not a tap on the scrim. The scrim covers the whole screen, so
    // its centre — where a forced click lands — is underneath the drawer, and
    // the first version of this test spent thirty seconds clicking «إدارة
    // الباقة» and reporting a drawer that would not close.
    // Nothing inside the drawer may leave the drawer.
    //
    // The account card did. A blanket `flex-wrap: wrap` reached the sidebar,
    // which is a flex column — and a column told to wrap does not scroll, it
    // starts a second column beside itself. The card landed 115px wide on top
    // of the page. It was inside the viewport the whole time, so every check
    // that watched the screen edges saw nothing.
    const escaped = await page.evaluate(() => {
      const side = document.querySelector('.marsad-sidebar[data-open="true"]')
      if (!side) return null
      const sb = side.getBoundingClientRect()
      return [...side.querySelectorAll('*')]
        .filter((e) => {
          const r = e.getBoundingClientRect()
          return r.width && r.height && (r.left < sb.left - 1 || r.right > sb.right + 1)
        })
        .map((e) => (e.textContent || '').trim().slice(0, 24))
        .slice(0, 3)
    })
    if (escaped) {
      checks += 1
      if (escaped.length) {
        bad += 1
        console.log(`  ❌ ${width}px عناصر خرجت من القائمة: ${escaped.join(' | ')}`)
      } else {
        console.log(`  ✅ ${width}px كل محتوى القائمة داخلها`)
      }
    }

    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    checks += 1
    if (await page.locator('.marsad-sidebar[data-open="true"]').count()) {
      bad += 1
      console.log(`  ❌ ${width}px القائمة لا تُغلق بمفتاح Escape`)
    } else {
      console.log(`  ✅ ${width}px القائمة تُغلق بمفتاح Escape`)
    }
  }

  // The account menu.
  const avatar = page.locator('.cl-userButtonTrigger').first()
  if (await avatar.count()) {
    await avatar.click()
    await page.waitForTimeout(700)
    report(`${width}px قائمة الحساب مفتوحة`, await page.evaluate(SPILL, width), width)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }

  // The notification panel, wherever the bell lives.
  const bell = page.locator('[aria-label*="إشعار"], [title*="إشعار"], a[href="/notifications"]').first()
  if (await bell.count()) {
    await bell.click().catch(() => {})
    await page.waitForTimeout(700)
    report(`${width}px الإشعارات`, await page.evaluate(SPILL, width), width)
  }

  await ctx.close()
}

// The desktop, unchanged.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await signIn(page, BASE)
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(600)

  const desk = await page.evaluate(() => {
    const q = (s) => document.querySelector(s)
    const h = (el) => (el ? Math.round(el.getBoundingClientRect().height) : null)
    const w = (el) => (el ? Math.round(el.getBoundingClientRect().width) : null)
    return {
      avatar: h(q('.cl-userButtonTrigger')),
      sidebarShown: q('.marsad-sidebar') ? getComputedStyle(q('.marsad-sidebar')).transform : null,
      sidebarWidth: w(q('.marsad-sidebar')),
      toggleShown: q('.marsad-nav-toggle') ? getComputedStyle(q('.marsad-nav-toggle')).display : 'none',
      scrollWidth: document.documentElement.scrollWidth,
    }
  })
  await ctx.close()

  // The drawer belongs to the phone. On a desktop the sidebar is in the flow,
  // untransformed, and the hamburger that opens it is not rendered at all.
  const ok = desk.toggleShown === 'none'
    && (desk.sidebarShown === 'none' || desk.sidebarShown === 'matrix(1, 0, 0, 1, 0, 0)')
    && desk.avatar !== null && desk.avatar < 44
    && desk.scrollWidth <= 1441
  checks += 1
  if (ok) {
    console.log(`\n  ✅ سطح المكتب كما كان — أفاتار ${desk.avatar}px، قائمة ${desk.sidebarWidth}px ثابتة، لا زر ☰`)
  } else {
    bad += 1
    console.log(`\n  ❌ سطح المكتب تغيّر: ${JSON.stringify(desk)}`)
  }
}

await browser.close()
console.log(bad ? `\n  ❌ ${bad} من ${checks}\n` : `\n  ✅ ${checks} فحصاً — المنبثقات داخل الشاشة وسطح المكتب لم يتغيّر\n`)
process.exit(bad ? 1 : 0)
