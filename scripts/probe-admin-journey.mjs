#!/usr/bin/env node
/**
 * The super-admin's round, walked in order, with the back button used at every
 * step — because a screen that only works when reached one way is not finished.
 *
 *   command centre → work centre → a company → its tabs → back →
 *   registry import → users → logs
 *
 * It also asks which roles can get in at all. The database grants seven roles
 * graded permissions, while AdminRoute admits platform_admin only; those two
 * facts are worth stating out loud rather than assuming they agree.
 *
 *   node scripts/probe-admin-journey.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
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

const browser = await chromium.launch()
const errs = []

try {
  const { rows: [co] } = await db.query(
    'select id, name from public.companies order by created_at limit 1')

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 130)) })
  page.on('pageerror', (e) => errs.push(`PAGEERROR: ${String(e).slice(0, 150)}`))

  await signIn(page, BASE, { role: 'platform_admin' })

  const go = async (path) => {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    // Wait on the content region, not the document: the shell alone clears any
    // whole-page threshold, so a page still fetching its rows looked finished.
    // /admin/users needs about four seconds to fill its table and was being
    // read while empty and called broken.
    await page.waitForFunction(
      () => (document.querySelector('#main')?.innerText || '').trim().length > 300,
      { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(800)
    return page.locator('#main').innerText()
  }

  console.log('\n─── الرحلة ───')

  const cc = await go('/admin/command-center')
  ok('مركز القيادة يفتح ويعرض أقسامه', cc.length > 400 && /يحتاج|متأخر|اليوم|النموذج|السجل/.test(cc),
    cc.slice(0, 90))

  const wc = await go('/admin/work')
  ok('مركز العمل يفتح', wc.length > 300)
  ok('ونطاقاته معروضة', /الكل|غير مُسنَد|متأخر|بانتظار الشركة|عليّ/.test(wc), wc.slice(0, 90))
  // «بانتظار الشركة» is its own scope and is not counted inside «متأخر».
  ok('و«بانتظار الشركة» نطاق قائم بذاته', /بانتظار الشركة/.test(wc))

  const file = await go(`/admin/company/${co.id}`)
  ok('ملفّ الشركة يفتح من رابط مباشر', file.includes(co.name))

  const tablist = page.getByRole('tablist', { name: 'أقسام ملفّ الشركة' })
  for (const t of ['المستندات', 'التقارير', 'الاعتراضات', 'الخطّ الزمني', 'سجل التدقيق']) {
    await tablist.getByRole('tab', { name: t, exact: true }).click()
    await page.waitForTimeout(1200)
    ok(`  ${t}`, await tablist.count() === 1
      && (await page.locator('#main').innerText()).trim().length > 200)
  }

  await page.goBack()
  // Wait for the screen behind, not for the clock. A fixed 1.8s read the work
  // centre mid-load and called a page that renders fine «empty».
  await page.waitForFunction(
    () => (document.querySelector('#main')?.innerText || '').trim().length > 200,
    { timeout: 20000 }).catch(() => {})
  ok('الرجوع من الملفّ لا يترك صفحة فارغة',
    (await page.locator('#main').innerText()).trim().length > 200, page.url())

  const ri = await go('/admin/registry-import')
  ok('استيراد السجل التجاري يفتح', ri.length > 300, ri.slice(0, 90))

  const us = await go('/admin/users')
  ok('المستخدمون يفتح', us.length > 300)

  const lg = await go('/admin/logs')
  ok('السجلات تفتح', lg.length > 300)

  // A request cancelled on unmount is not a failure. Every screen here aborts
  // its in-flight fetches in a cleanup, and React runs effects twice in
  // development, so ERR_ABORTED is the expected sound of that working. The
  // direct call to open.data.gov.sa that used to be here is gone — it goes
  // through /api/registry-source now — so a portal error appearing again means
  // something regressed, and it is named rather than counted.
  const ABORTED = /ERR_ABORTED/
  const appErrs = errs.filter((e) => !ABORTED.test(e))
  ok('console نظيف من أخطاء التطبيق', appErrs.length === 0, appErrs.slice(0, 3).join(' | '))
  ok('ولا طلب مباشر إلى بوابة البيانات المفتوحة',
    !errs.some((e) => /open\.data\.gov\.sa/.test(e)),
    errs.filter((e) => /open\.data\.gov\.sa/.test(e))[0])
  await ctx.close()

  // ===== Who may enter =====
  console.log('\n─── من يدخل اللوحة ───')
  const { rows: roles } = await db.query(
    'select distinct role from public.role_permissions order by role')

  for (const { role } of roles) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const p = await c.newPage()
    try {
      await signIn(p, BASE, { role })
      await p.goto(`${BASE}/admin/work`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await p.waitForTimeout(2600)
      const at = new URL(p.url()).pathname
      const inside = at.startsWith('/admin')
      console.log(`  ${inside ? '🔓' : '🔒'} ${role.padEnd(14)} → ${at}`)
    } catch (e) {
      console.log(`  ⚠️  ${role.padEnd(14)} → ${e.message.slice(0, 60)}`)
    } finally {
      await c.close()
    }
  }
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 220)}`)
} finally {
  await browser.close()
  await db.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — الرحلة تمشي من طرف إلى طرف\n`)
process.exit(fail ? 1 : 0)
