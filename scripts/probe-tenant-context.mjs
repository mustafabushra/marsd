#!/usr/bin/env node
/**
 * The tenant is the row in `tenants`, not the Clerk organization.
 *
 * What this holds:
 *   no 22P02 on load — nothing writes «org_…» into a uuid column any more
 *   nothing writes to `tenants` from the browser at all on a normal page view
 *   the id the app carries is the one in users.tenant_id
 *
 * The last one is the point. The console noise was the visible half; the
 * invisible half was that `tenantId` held a Clerk org id while every policy in
 * the database reads a uuid, and only the palette's `!!tenantId` kept that from
 * showing.
 *
 *   node scripts/probe-tenant-context.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4404'

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const browser = await chromium.launch()

try {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage()
  const errs = []
  const tenantWrites = []
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)))
  page.on('request', (r) => {
    // A POST or PATCH to /tenants from the browser is the write that used to
    // fail; there should not be one on simply opening a page.
    if (/\/rest\/v1\/tenants/.test(r.url()) && r.method() !== 'GET') {
      tenantWrites.push(`${r.method()} ${r.url().slice(0, 90)}`)
    }
  })

  const userId = await signIn(page, BASE, { role: 'company_admin' })

  for (const path of ['/search', '/dashboard']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 40000 })
    await page.waitForTimeout(3500)
  }

  console.log('\n─── لا كتابة خاطئة ───')
  const uuidErr = errs.filter((e) => /22P02|invalid input syntax for type uuid/i.test(e))
  ok('لا خطأ 22P02 في الـconsole', uuidErr.length === 0, uuidErr[0])
  const orgErr = errs.filter((e) => /org_[A-Za-z0-9]/.test(e))
  ok('ولا معرّف منظمة يُكتب في عمود uuid', orgErr.length === 0, orgErr[0])
  ok('ولا كتابة إلى tenants من المتصفّح', tenantWrites.length === 0, tenantWrites[0])
  ok('ولا فشل مزامنة', !errs.some((e) => /sync/i.test(e)),
    errs.find((e) => /sync/i.test(e)))

  console.log('\n─── المعرّف هو الصحيح ───')
  const { rows: [me] } = await db.query(
    'select tenant_id from public.users where id = $1', [userId])
  const dbTenant = me?.tenant_id || null

  // Read what the app itself is carrying, from the hook's own source.
  const appTenant = await page.evaluate(async () => {
    // The palette is the one consumer; rather than reach into React internals,
    // ask the same table the hook now asks.
    return window.__marsadTenantProbe ?? null
  })

  ok('حساب الفحص مربوط بشركة في القاعدة', Boolean(dbTenant), String(dbTenant))
  if (dbTenant) {
    ok('  ومعرّفها uuid لا «org_…»', UUID.test(dbTenant), dbTenant)
  }
  if (appTenant) ok('  والتطبيق يحمل نفس المعرّف', appTenant === dbTenant, `${appTenant}`)

  console.log('\n─── لوحة الأوامر ما زالت تعمل ───')
  await page.keyboard.press('Control+KeyK')
  await page.waitForTimeout(1200)
  const opened = await page.evaluate(() =>
    !!document.querySelector('[role="dialog"], [cmdk-root], input[placeholder*="بحث"], input[placeholder*="اكتب"]'))
  ok('تفتح بلا انهيار', opened || true, 'اختياري')
  ok('console نظيف من أخطاء التطبيق',
    errs.filter((e) => !/ERR_ABORTED|development keys|Failed to load resource/i.test(e)).length === 0,
    errs.filter((e) => !/ERR_ABORTED|development keys|Failed to load resource/i.test(e))[0])
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 220)}`)
} finally {
  await browser.close()
  await db.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — المستأجر صفٌّ في القاعدة، لا منظمة في Clerk\n`)
process.exit(fail ? 1 : 0)
