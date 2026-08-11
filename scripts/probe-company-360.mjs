#!/usr/bin/env node
/**
 * The company file's three newest tabs, driven the way a person drives them.
 *
 * The first version of this used `filter({ hasText })` and `.first()`, which
 * matches any button *containing* the words and clicked something else — the
 * fourth locator in this project to be wrong before the code was. Exact
 * accessible names only, here and from now on.
 *
 * The three tabs answer three different questions and must not converge:
 * disputes is what was objected to, audit is who changed which field from what
 * to what, and the timeline is the story. An audit row that has been rewritten
 * into Arabic prose is an audit row that cannot be used as evidence.
 *
 *   node scripts/probe-company-360.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4370'

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
  const { rows: [co] } = await db.query(
    `select id, name, status from public.companies order by created_at limit 1`)
  const { rows: [audit] } = await db.query(
    'select count(*)::int n from public.company_audit_log where company_id = $1', [co.id])

  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage()
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 110)) })
  page.on('pageerror', (e) => errs.push(`pageerror: ${String(e).slice(0, 110)}`))

  await signIn(page, BASE, { role: 'platform_admin' })
  await page.goto(`${BASE}/admin/company/${co.id}`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(2500)

  // Exact accessible name. A tab is a button whose whole name is the label.
  // Scoped to the content area: the sidebar carries an «الاعتراضات» entry of
  // its own, and an unscoped exact match clicked that and navigated away from
  // the company file entirely.
  // The tablist, not the page. «الاعتراضات» is a tab here and a navigation
  // entry elsewhere, and matching by name alone clicked the navigation and left
  // the company file — which is why the tab never appeared to load.
  const tab = (name) => page.getByRole('tablist', { name: 'أقسام ملفّ الشركة' })
    .getByRole('tab', { name, exact: true })

  const head = await page.locator('body').innerText()
  ok('الملفّ يفتح', head.includes(co.name))
  ok('وحالة مرصد معروضة', /نشطة|بانتظار الاعتماد|مرفوضة|معلّقة/.test(head))

  // ===== Disputes =====
  await tab('الاعتراضات').click()
  await page.waitForSelector('text=/لا توجد اعتراضات|مفتوحة/', { timeout: 15000 })
  const dt = await page.locator('body').innerText()
  ok('تبويب الاعتراضات يفتح ويعرض حالته',
    /لا توجد اعتراضات/.test(dt) || /مفتوحة \d/.test(dt), dt.slice(0, 80))

  const { rows: [dc] } = await db.query(
    `select count(*)::int n from public.disputes d
      where d.company_id = $1
         or d.report_id in (select r.id from public.reports r where r.target_company_id = $1)`,
    [co.id])
  ok('ويطابق ما في القاعدة',
    dc.n === 0 ? /لا توجد اعتراضات/.test(dt) : /مفتوحة/.test(dt), `${dc.n} في القاعدة`)

  // ===== Timeline =====
  await tab('الخطّ الزمني').click()
  await page.waitForSelector('text=/الخطّ الزمني/', { timeout: 15000 })
  await page.waitForTimeout(1500)
  const tl = await page.locator('body').innerText()

  const { rows: tlRows } = await db.query(
    `select count(*)::int n from public.admin_company_timeline($1, 80)`, [co.id])
    .catch(() => ({ rows: [{ n: null }] }))

  ok('الخطّ الزمني يعرض أحداثاً عربية',
    /أُنشئ ملفّ الشركة|قُبل الطلب|رُفع مستند|دُقّق مستند|قُدّم تقرير|تغيّرت حالة الشركة/.test(tl),
    tl.slice(0, 100))
  ok('ويجمّعها بالأيام', /اليوم|أمس|\d{4}/.test(tl))
  // The line that keeps the two tabs apart.
  ok('ولا يعرض أسماء أعمدة خام',
    !/updated_at|old_values|new_values|review_status/.test(tl),
    'اسم عمود ظهر في القصّة')

  // ===== Audit =====
  await tab('سجل التدقيق').click()
  await page.waitForSelector('text=/سجل التدقيق/', { timeout: 15000 })
  await page.waitForTimeout(1500)
  const au = await page.locator('body').innerText()

  ok('سجل التدقيق يعرض صفوفاً', audit.n === 0
    ? /لا توجد تغييرات مسجّلة/.test(au)
    : /من \d+/.test(au), `${audit.n} صفّاً في القاعدة`)

  if (audit.n > 0) {
    ok('ويعرض القيم خاماً كما كُتبت',
      /"pending"|"approved"|"active"|pending|approved/.test(au),
      'القيم مُترجمة — لا تصلح دليلاً')
    ok('ويقول من أصل كم', /من \d+/.test(au))

    // ===== Drawer =====
    const rowBtn = page.locator('#main button').filter({ hasText: 'النظام' }).first()
    const anyRow = (await rowBtn.count()) ? rowBtn
      : page.locator('#main button').filter({ hasText: 'تغيير' }).first()
    if (await anyRow.count()) {
      await anyRow.click()
      await page.waitForSelector('[role="dialog"]', { timeout: 10000 })
      const dr = await page.locator('[role="dialog"]').innerText()
      ok('الضغط على صفّ يفتح Drawer', dr.includes('تفاصيل التغيير'))
      ok('والـDrawer يعرض الفاعل والوقت والمفتاح الخام',
        /الفاعل/.test(dr) && /التاريخ والوقت/.test(dr) && /المفتاح الخام/.test(dr))

      await page.keyboard.press('Escape')
      await page.waitForTimeout(600)
      const stillOpen = await page.locator('[role="dialog"]').count()
      // Escape is the convention everywhere else in this app; if it is not
      // wired the close button still has to work.
      if (stillOpen) {
        await page.getByRole('button', { name: 'إغلاق' }).click()
        await page.waitForTimeout(600)
        ok('ويُغلق بالزرّ', (await page.locator('[role="dialog"]').count()) === 0)
      } else {
        ok('ويُغلق بمفتاح Escape', true)
      }
    }

    // ===== Pagination =====
    const prev = page.getByRole('button', { name: 'السابق', exact: true })
    const next = page.getByRole('button', { name: 'التالي', exact: true })
    ok('«السابق» معطّل في أول صفحة', await prev.isDisabled())
    if (audit.n > 25) {
      await next.click()
      await page.waitForTimeout(1600)
      const p2 = await page.locator('body').innerText()
      ok('و«التالي» ينقل الصفحة', /^\s*26–/m.test(p2) || /26–/.test(p2), p2.match(/\d+–\d+ من \d+/)?.[0])
      ok('و«السابق» يعمل بعدها', !(await prev.isDisabled()))
    } else {
      ok('و«التالي» معطّل حين لا صفحة بعدها', await next.isDisabled())
    }
  }

  // ===== Responsive =====
  for (const w of [1440, 1024, 390]) {
    await page.setViewportSize({ width: w, height: 1000 })
    await page.waitForTimeout(800)
    const over = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth + 2)
    ok(`لا فيض أفقي @${w}`, !over)
  }

  ok('console نظيف', errs.length === 0, errs.slice(0, 2).join(' | '))

} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 200)}`)
} finally {
  await browser.close()
  await db.end()
}

console.log(fail
  ? `\n  ❌ ${fail} من ${pass + fail}\n`
  : `\n  ✅ ${pass} فحصاً — الاعتراضات والقصّة والدليل، كلٌّ في مكانه\n`)
process.exit(fail ? 1 : 0)
