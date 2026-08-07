#!/usr/bin/env node
/**
 * Does the page fit the phone? Measured in a real browser, not asserted.
 *
 * A static read of the source cannot answer this. Whether a row overflows
 * depends on the text inside it, the font that loaded, and the width it ended
 * up with — all of which exist only after layout. So this opens a real Chromium
 * at each width and asks the page itself.
 *
 * Seven widths: four phones, then 480, 768 and 820 — a large phone in landscape
 * and the two tablet sizes, which are touch devices and were dropping back to
 * 34px targets the moment the phone rules stopped applying.
 *   320  the narrowest still in use (iPhone SE, older Android)
 *   375  iPhone SE 2/3, iPhone 12 mini
 *   390  iPhone 12–15
 *   412  Pixel, most large Android
 *
 * What it refuses to accept:
 *   - the page scrolls sideways
 *   - any element sticks out past the viewport
 *   - text is clipped by its own box
 *   - a tap target smaller than 44px
 *   - a dialog taller or wider than the screen
 *
 *   node scripts/audit-mobile.mjs [url] [--shots]
 */

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4173'
const SHOTS = process.argv.includes('--shots')
const WIDTHS = [320, 375, 390, 412, 480, 768, 820]

// Public routes: everything reachable without an account. The rest sit behind
// Clerk, and a harness that fakes a session tests the fake.
const ROUTES = ['/', '/about', '/pricing', '/partners', '/faq', '/contact', '/login', '/register']

if (SHOTS) mkdirSync('mobile-shots', { recursive: true })

/**
 * Runs inside the page. Everything here is measured from the live layout.
 */
const MEASURE = (vw) => {
  // `vw` is passed in, never read from the page.
  //
  // Under Chromium's mobile emulation `window.innerWidth` follows the *layout*
  // viewport, which expands to fit overflowing content: inject a 900px element
  // into a 320px phone and innerWidth becomes 900 too. Every comparison of
  // scrollWidth against innerWidth is then 900 > 900 — false — and the audit
  // reports a clean page precisely when the page is broken. The self-test below
  // caught this; nothing else would have.
  const out = { scrollWidth: document.documentElement.scrollWidth, vw, overflow: [], clipped: [], small: [], dialogs: [], overlap: [] }

  const label = (el) => {
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)
    return `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/)[0] : ''}${t ? ` «${t}»` : ''}`
  }

  /**
   * Is this element's overflow already contained by an ancestor?
   *
   * getBoundingClientRect reports the box whether or not anything clips it, so
   * a decorative pattern inside `overflow: hidden` measured as 80px off the
   * left edge of a 320px phone while being, in fact, invisible and causing no
   * scrolling at all. A check that reports what is not there gets switched off.
   */
  const clippingAncestor = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p)
      if (o.overflowX !== 'visible' || o.overflow !== 'visible') return p
    }
    return null
  }

  // Text leaves already measured, for the overlap comparison below.
  const overlapCandidates = []

  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue

    // Sticking out past the right or left edge. 1px of tolerance for rounding.
    //
    // An ancestor that clips does not make this acceptable — it makes it a
    // different fault. The element is not pushing the page sideways, it is being
    // cut off, and content silently cut is exactly what a scrollbar at least
    // announces. Both are reported; only the name changes.
    const clipper = clippingAncestor(el)
    if (clipper && (r.right > vw + 1 || r.left < -1)) {
      const cr = clipper.getBoundingClientRect()
      const cs2 = getComputedStyle(clipper)
      // A scrollable ancestor is a choice: the reader can reach the rest.
      const scrollable = /auto|scroll/.test(cs2.overflowX) || /auto|scroll/.test(cs2.overflow)
      // Only content can be lost. A gradient panel behind a hero is meant to
      // run off the edge — clipping it is the design, not a defect — so what
      // counts is whether anything readable is being cut.
      const carriesContent = !!(el.textContent || '').trim()
        || el.tagName === 'IMG' || el.querySelector('img, svg')
      if (!scrollable && carriesContent && (r.right > cr.right + 1 || r.left < cr.left - 1)) {
        out.clipped.push({ el: `${label(el)} ← داخل ${label(clipper).split('«')[0]}` })
      }
    }

    if ((r.right > vw + 1 || r.left < -1) && !clipper) {
      // Only the outermost offender: reporting a wide row and each of its
      // twelve children is the same fault twelve times.
      const parent = el.parentElement
      const pr = parent ? parent.getBoundingClientRect() : null
      if (!pr || (pr.right <= vw + 1 && pr.left >= -1)) {
        out.overflow.push({ el: label(el), left: Math.round(r.left), right: Math.round(r.right) })
      }
    }

    // Text cut off by its own box. Only where overflow is actually hidden —
    // `auto`/`scroll` is a choice, and ellipsis is a deliberate one.
    if (el.children.length === 0 && (el.textContent || '').trim()) {
      const hiddenX = cs.overflowX === 'hidden' && cs.textOverflow !== 'ellipsis'
      const hiddenY = cs.overflowY === 'hidden'
      if ((hiddenX && el.scrollWidth > el.clientWidth + 1)
          || (hiddenY && el.scrollHeight > el.clientHeight + 1)) {
        out.clipped.push({ el: label(el) })
      }
    }

    // Tap targets. 44px is the smallest a finger reliably hits.
    //
    // A link rendered inline is a word in a sentence, not a target — «اقرأ
    // الشروط» inside a paragraph is 14px tall because that is the line height,
    // and padding it to 44 would break the paragraph. Only links that present
    // themselves as controls count.
    const tag = el.tagName.toLowerCase()
    const isInlineLink = tag === 'a' && cs.display.startsWith('inline') && !cs.display.includes('block')

    // Clerk's own badge: an empty link to go.clerk.com, 14px tall, that Clerk
    // renders on a development instance and removes on a production one.
    // Forcing it to 44px would enlarge somebody else's logo. Named here rather
    // than dropped quietly, so it stops being an exception the day the
    // production instance is configured — which is already on the list.
    const isVendorBadge = tag === 'a'
      && (el.getAttribute('href') || '').includes('go.clerk.com')
      && !(el.textContent || '').trim()
    if ((/^(button|select)$/.test(tag)
         || (tag === 'a' && !isInlineLink && !isVendorBadge)
         || el.getAttribute('role') === 'button'
         || (el.tagName === 'INPUT' && !/hidden/.test(el.type)))
        && r.height > 0 && r.height < 44 && cs.position !== 'absolute') {
      out.small.push({ el: label(el), h: Math.round(r.height) })
    }

    // Text sitting on top of other text.
    //
    // The audit passed a page whose navigation bar had wrapped onto three lines
    // inside a 70px header and landed across the page heading. Nothing was wider
    // than the screen, nothing was clipped, no target was small — every check
    // said clean, and a screenshot said otherwise. Overlap is its own fault and
    // needs its own measurement.
    //
    // Compared only between text-bearing leaves, and only where neither is
    // positioned on purpose: a badge over a card corner is a design, a heading
    // under a menu is not.
    //
    // The ancestor chain matters as much as the element. Clerk keeps the
    // password step mounted while the e-mail step is showing, layered out of
    // flow, and both labels are `position: static` in themselves — so a check
    // that looked only at the leaf reported a login form overlapping itself.
    // Anything layered, faded or hidden by an ancestor is deliberate.
    const layered = (() => {
      for (let p = el; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p)
        if (o.opacity === '0' || o.visibility === 'hidden') return true
        if (p !== el && (o.position === 'absolute' || o.position === 'fixed')) return true
        if (o.transform !== 'none' && p !== el) return true
        if (p.getAttribute && (p.getAttribute('aria-hidden') === 'true' || p.hasAttribute('inert'))) return true
      }
      return false
    })()

    if (el.children.length === 0 && (el.textContent || '').trim().length > 2
        && cs.position === 'static' && r.height > 0 && !layered) {
      for (const other of overlapCandidates) {
        if (other.el === el) continue
        const o = other.r
        const hit = r.left < o.right - 2 && r.right > o.left + 2
                 && r.top < o.bottom - 2 && r.bottom > o.top + 2
        // Not a descendant or ancestor — a parent always "overlaps" its child.
        if (hit && !el.contains(other.el) && !other.el.contains(el)) {
          out.overlap.push({ a: label(el), b: label(other.el) })
          break
        }
      }
      overlapCandidates.push({ el, r })
    }

    // A dialog bigger than the screen cannot be closed or read.
    if (el.getAttribute('role') === 'dialog' || /modal|drawer|sheet/i.test(String(el.className))) {
      if (r.width > vw + 1 || r.height > window.innerHeight + 1) {
        out.dialogs.push({ el: label(el), w: Math.round(r.width), h: Math.round(r.height) })
      }
    }
  }
  return out
}

const browser = await chromium.launch()
let failures = 0
const summary = []

/**
 * Does this harness still catch anything?
 *
 * A check that reports zero is worth nothing until it has been shown to report
 * something. Two deliberately broken elements are injected into a real page and
 * the measurement is run against them; if either goes unnoticed the run stops,
 * because every ✅ after that would be meaningless.
 */
{
  const ctx = await browser.newContext({ viewport: { width: 320, height: 780 }, isMobile: true })
  const page = await ctx.newPage()
  // networkidle, not domcontentloaded. The app finishes mounting and routing
  // after DOM ready, and the first version injected its test elements into a
  // page that then navigated out from under them — so the self-test reported
  // the harness blind when the harness was fine and the timing was not.
  await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(400)
  await page.evaluate(() => {
    const wide = document.createElement('div')
    wide.style.cssText = 'width:900px;height:20px;background:#eee'
    wide.textContent = 'SELFTEST_WIDE'
    document.body.appendChild(wide)
    const tiny = document.createElement('button')
    tiny.style.cssText = 'min-height:18px;height:18px'
    tiny.textContent = 'SELFTEST_TINY'
    document.body.appendChild(tiny)
  })
  const r = await page.evaluate(MEASURE, 320)
  await ctx.close()

  const sawWide = r.scrollWidth > r.vw + 1
    || r.overflow.some((o) => o.el.includes('SELFTEST_WIDE'))
    || r.clipped.some((o) => o.el.includes('SELFTEST_WIDE'))
  const sawTiny = r.small.some((o) => o.el.includes('SELFTEST_TINY'))

  if (!sawWide || !sawTiny) {
    console.log(`\n  ❌ الفحص لا يمسك ما وُضع له عمداً — عريض:${sawWide ? 'نعم' : 'لا'} صغير:${sawTiny ? 'نعم' : 'لا'}`)
    console.log('     أي نتيجة بعد هذا لا تعني شيئاً.\n')
    await browser.close()
    process.exit(2)
  }
  console.log('  ✔ الفحص نفسه مُختبَر: يمسك العنصر العريض والزر الصغير\n')
}

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: 780 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  })
  const page = await ctx.newPage()

  for (const route of ROUTES) {
    let r
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 })
      await page.waitForTimeout(400)
      r = await page.evaluate(MEASURE, width)
    } catch (e) {
      console.log(`  ⚠️  ${width}px ${route} — ${e.message.split('\n')[0].slice(0, 60)}`)
      continue
    }

    const scrolls = r.scrollWidth > r.vw + 1
    const bad = scrolls || r.overflow.length || r.clipped.length || r.small.length
      || r.dialogs.length || r.overlap.length
    if (bad) failures++

    summary.push({ width, route, scrolls, ...r })

    const mark = bad ? '❌' : '✅'
    const bits = []
    if (scrolls) bits.push(`تمرير أفقي (${r.scrollWidth} > ${r.vw})`)
    if (r.overflow.length) bits.push(`${r.overflow.length} خارج الشاشة`)
    if (r.clipped.length) bits.push(`${r.clipped.length} نص مقصوص`)
    if (r.small.length) bits.push(`${r.small.length} زر < 44px`)
    if (r.overlap.length) bits.push(`${r.overlap.length} تراكب`)
    if (r.dialogs.length) bits.push(`${r.dialogs.length} نافذة أكبر من الشاشة`)
    console.log(`  ${mark} ${String(width).padStart(3)}px ${route.padEnd(11)} ${bits.join(' · ') || 'سليمة'}`)

    for (const o of r.overflow.slice(0, 3)) console.log(`        ↳ ${o.el}  [${o.left}…${o.right}]`)
    for (const o of r.clipped.slice(0, 3)) console.log(`        ✂ ${o.el}`)
    for (const o of r.small.slice(0, 3)) console.log(`        ☝ ${o.el} — ${o.h}px`)
    for (const o of r.dialogs.slice(0, 2)) console.log(`        ▭ ${o.el} — ${o.w}×${o.h}`)
    for (const o of r.overlap.slice(0, 3)) console.log(`        ⧉ ${o.a}  فوق  ${o.b}`)

    if (SHOTS) {
      await page.screenshot({ path: `mobile-shots/${width}${route.replace(/\//g, '_') || '_home'}.png`, fullPage: true })
    }
  }
  await ctx.close()
  console.log('')
}

await browser.close()
console.log(failures
  ? `  ❌ ${failures} من ${summary.length} فحص فيه مشكلة\n`
  : `  ✅ ${summary.length} فحصاً على ${WIDTHS.length} عروض — لا تمرير أفقي، ولا خروج، ولا قص، ولا زر صغير\n`)
process.exit(failures ? 1 : 0)
