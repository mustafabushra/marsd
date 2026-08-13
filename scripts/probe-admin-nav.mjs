#!/usr/bin/env node
/**
 * Every entry in the admin sidebar, opened.
 *
 * The information architecture pass moves names and grouping without touching
 * a single route, which is exactly the kind of change that looks correct in a
 * diff and leaves one entry pointing at nothing. A menu is only as good as its
 * least-clicked item, and nobody clicks the least-clicked item.
 *
 * So this opens all of them: expand every group, read the labels off the real
 * DOM rather than off the source, click each one, and require that the content
 * region fills. It also checks the two structural promises the menu now makes —
 * that «مركز العمل» leads with only مركز القيادة beside it, and that a heading
 * claiming its children also appear in the work centre is not sitting above a
 * screen that has no work items.
 *
 *   node scripts/probe-admin-nav.mjs [url]
 */

import { chromium } from 'playwright'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4393'

let pass = 0
let fail = 0
const ok = (n, c, d = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) }
  else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

// The queues the heading promises are reachable from مركز العمل. Kept here
// rather than derived, because the point is to catch the menu drifting away
// from admin_work_items — and a check that reads both from the same place
// cannot catch that.
const IN_WORK_CENTRE = [
  'طلبات الانضمام', 'طلبات الملكية', 'الاعتراضات', 'تقارير قيد المراجعة',
]

const browser = await chromium.launch()
const errs = []

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 130)) })
  page.on('pageerror', (e) => errs.push(`PAGEERROR: ${String(e).slice(0, 150)}`))

  await signIn(page, BASE, { role: 'platform_admin' })
  await page.goto(`${BASE}/admin/work`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.marsad-sidebar', { timeout: 20000 })

  const aside = page.locator('.marsad-sidebar')

  console.log('\n─── بنية الشريط ───')

  // Group headings are the clickable rows carrying the ▾ marker.
  const groupTitles = await aside.locator('div:has(> span:text-is("▾"))').allInnerTexts()
    .catch(() => [])
  const groups = (await aside.evaluate((el) => Array.from(el.querySelectorAll('nav > div > button'))
    .map((b) => b.textContent.replace('▾', '').trim())))
  ok('تسع مجموعات', groups.length === 9, `${groups.length}: ${groups.join(' | ')}`)

  for (const t of ['الشركات', 'المراجعة', 'التقارير', 'المستندات', 'المراقبة', 'التحليلات', 'المنصة', 'النظام', 'أدوات إضافية']) {
    ok(`  ${t}`, groups.includes(t), groups.join(' | '))
  }

  // The two screens a day is worked from, and nothing else, above the groups.
  const tops = await aside.evaluate((el) => Array.from(el.querySelectorAll('nav > button'))
    .map((b) => b.textContent.trim()))
  // مركز العمل نزل إلى «المراجعة» باسم «صندوق المراجعة»، فبقي واحد.
  ok('مدخل صدارة واحد', tops.length === 1, `${tops.length}: ${tops.join(' | ')}`)
  ok('وهو مركز القيادة', tops.join('|') === 'مركز القيادة', tops.join(' | '))

  // ===== open everything =====
  console.log('\n─── كل مدخل يفتح ───')

  // Expand every group. They collapse again on navigation only if the active
  // item is elsewhere, so this is re-run before each click.
  const expandAll = async () => {
    const heads = aside.locator('nav > div > button')
    for (let i = 0; i < await heads.count(); i += 1) {
      const box = heads.nth(i)
      const openNow = await box.evaluate((el) =>
        el.nextElementSibling && getComputedStyle(el.nextElementSibling).display !== 'none')
      if (!openNow) await box.click()
    }
  }

  await expandAll()

  const links = await aside.evaluate((el) =>
    Array.from(el.querySelectorAll('nav > div > div > button'))
      .map((b) => b.getAttribute('aria-label') || b.textContent.trim()))
  ok(`عدد المداخل تحت المجموعات: ${links.length}`, links.length >= 30, String(links.length))

  const emptyOnes = []
  // بالموضع لا بالاسم.
  //
  // «التقارير» و«المستندات» اسمان تحملهما مجموعة وبند معاً، فالمطابقة بالاسم
  // تضغط رأس المجموعة فتطويها بدل أن تفتح الشاشة — وتبدو ناجحة لأن شيئاً
  // ما حدث. الترتيب داخل حاوية البنود لا يلتبس.
  const itemAt = (i) => aside.locator('nav > div > div > button').nth(i)
  for (let idx = 0; idx < links.length; idx += 1) {
    const label = links[idx]
    await expandAll()
    await itemAt(idx).click()
    // Wait for content, not for the clock: the shell alone clears any
    // whole-page threshold, so a page still fetching looked finished.
    await page.waitForFunction(
      () => (document.querySelector('#main')?.innerText || '').trim().length > 120,
      { timeout: 15000 }).catch(() => {})
    const body = (await page.locator('#main').innerText()).trim()
    const at = new URL(page.url()).pathname
    // حالة الفراغ نجاح لا فشل.
    //
    // العتبة وحدها لا تفرّق بين شاشة لم تُرسَم وشاشة رُسمت وليس فيها ما
    // تعرضه: صفر طلب ملكية، وصفر تقرير قيد المراجعة. الأولى عطل والثانية
    // هي الصواب، وإسقاطهما معاً يجعل المسبار يصرخ كلما فرغ طابور.
    const EMPTY = /لا (توجد|يوجد|تقارير|طلبات|مستندات|شركات)|ليس هناك|✓/
    const good = at.startsWith('/admin') && (body.length > 120 || EMPTY.test(body))
    if (!good) emptyOnes.push(`${label} → ${at} (${body.length})`)
    console.log(`  ${good ? '✅' : '❌'} ${label.padEnd(30)} ${at}`)
    if (good) pass += 1; else fail += 1
  }

  console.log('\n─── الوعود التي يقطعها الشريط ───')
  ok('التحقق من الشركات مدخل قائم بذاته', links.includes('التحقق من الشركات'))
  for (const q of IN_WORK_CENTRE) {
    ok(`  ${q} مدرج تحت طوابير الطلبات`, links.includes(q), links.join(' | ').slice(0, 120))
  }
  ok('ومؤشر الثقة في التحليلات', links.includes('مؤشر الثقة'))

  // ضوضاء النقل لا أخطاء التطبيق: خادم التطوير يقطع اتصالات أثناء جولة
  // تفتح خمسًا وأربعين شاشة، وHMR يُلغي طلبات في أثنائها. إسقاطها يجعل
  // الفحص يرسب في كل جولة طويلة فيُتجاهَل — وحينها لا يمسك الخطأ الحقيقي.
  const ABORTED = /ERR_ABORTED|ERR_CONNECTION_CLOSED|ERR_NETWORK_CHANGED|Failed to fetch/
  const appErrs = errs.filter((e) => !ABORTED.test(e))
  ok('console نظيف من أخطاء التطبيق', appErrs.length === 0, appErrs.slice(0, 3).join(' | '))

  if (emptyOnes.length) {
    console.log('\n  مداخل لم تفتح:')
    for (const e of emptyOnes) console.log(`    · ${e}`)
  }

  await ctx.close()
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 220)}`)
} finally {
  await browser.close()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — كل مدخل في الشريط يفتح شاشة\n`)
process.exit(fail ? 1 : 0)
