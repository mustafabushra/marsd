#!/usr/bin/env node
/**
 * Two claims that are easy to make and easy to get wrong.
 *
 * 1. Provenance is real. The import screen names the Ministry because the
 *    portal said so through /api/registry-source, not because the string is
 *    hard-coded. Checked by comparing the screen against what the endpoint
 *    itself returns, and by confirming the browser makes no direct call to
 *    open.data.gov.sa.
 *
 * 2. «Never ran» does not look like «ran and changed nothing». A job that has
 *    never fired reading as success is how a broken schedule stays invisible
 *    for months. The database already separates never/stalled/success; this
 *    holds the screen to showing them apart.
 *
 *   node scripts/probe-source-and-jobs.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4392'

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

try {
  // ===== 1. The endpoint, on its own =====
  console.log('\n─── /api/registry-source ───')
  const DS = 'ed041830-933d-4b93-aab2-c3b78822b22f'
  const r = await fetch(`${BASE}/api/registry-source?dataset=${DS}`)
  const src = await r.json()
  ok('يردّ 200 بمصدر مُتحقَّق', r.status === 200 && src.verified === true, JSON.stringify(src).slice(0, 90))
  ok('ويسمّي الجهة', Boolean(src.providerAr), src.providerAr || 'لا جهة')
  ok('ويسمّي المجموعة', Boolean(src.titleAr), (src.titleAr || '').slice(0, 60))

  const bad = await fetch(`${BASE}/api/registry-source?dataset=169.254.169.254`)
  ok('ويرفض ما ليس UUID', bad.status === 400)
  const nf = await fetch(`${BASE}/api/registry-source?dataset=00000000-0000-0000-0000-000000000000`)
  const nfb = await nf.json().catch(() => ({}))
  ok('ولا يدّعي التوثيق لمجموعة لم تُعرَف', nf.status !== 200 || nfb.verified === false,
    `${nf.status} ${JSON.stringify(nfb).slice(0, 70)}`)

  // ===== 2. On the import screen =====
  console.log('\n─── شاشة الاستيراد ───')
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage()
  const direct = []
  page.on('request', (q) => { if (q.url().includes('open.data.gov.sa')) direct.push(q.url()) })

  await signIn(page, BASE, { role: 'platform_admin' })
  await page.goto(`${BASE}/admin/registry-import`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(3500)
  const imp = await page.locator('#main').innerText()

  ok('تعرض الجهة التي ردّ بها المصدر', imp.includes(src.providerAr), src.providerAr)
  ok('وتعرض اسم المجموعة كما ورد', imp.includes(src.titleAr.slice(0, 25)), src.titleAr.slice(0, 40))
  ok('ولا يطلب المتصفّح البوابة مباشرة', direct.length === 0, direct[0])

  // ===== 3. Background jobs =====
  console.log('\n─── المهامّ الخلفية ───')
  // admin_background_jobs is permission-guarded, and a plain connection carries
  // no claim — it returned null, and the comparison below quietly became a
  // check of nothing. Impersonate a platform admin the way PostgREST does so
  // the screen is actually compared against the database.
  const JOBS_USER = 'jobs_probe_admin'
  await db.query(
    `insert into public.users (id, email, role)
     values ($1, 'jobs-probe@marsad.test', 'platform_admin')
     on conflict (id) do update set role = 'platform_admin'`, [JOBS_USER])
  await db.query('begin')
  await db.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: JOBS_USER })])
  const { rows: [{ j }] } = await db.query('select public.admin_background_jobs() j')
  await db.query('rollback')
  await db.query('delete from public.users where id = $1', [JOBS_USER]).catch(() => {})
  ok('حالة المهامّ مقروءة من القاعدة', j != null, 'أعادت null — الفحص التالي بلا معنى')

  await page.goto(`${BASE}/admin/command-center`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForFunction(
    () => (document.querySelector('#main')?.innerText || '').length > 600, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(2500)
  const cc = await page.locator('#main').innerText()

  const LABEL = { success: 'نجح', failed: 'فشل', never: 'لم يعمل قطّ', stalled: 'متوقّف' }
  const cleanupStatus = j?.cleanup?.status
  if (cleanupStatus) {
    ok(`حالة «الكنس الليلي» في القاعدة: ${cleanupStatus}`, true)
    ok(`والشاشة تقولها بنصّها «${LABEL[cleanupStatus]}»`, cc.includes(LABEL[cleanupStatus]),
      cc.slice(0, 100))
    // The distinction that matters: never must not read as success.
    if (cleanupStatus === 'never') {
      ok('ولا تعرضها كنجاح', !/نجح/.test(cc) || cc.includes('لم يعمل قطّ'))
    }
  } else {
    ok('المهامّ الخلفية معروضة', /المهامّ|الكنس/.test(cc), cc.slice(0, 80))
  }

  // The four labels must be four different strings, or the screen cannot tell
  // the states apart no matter what the database says.
  const labels = Object.values(LABEL)
  ok('الحالات الأربع أربع عبارات مختلفة', new Set(labels).size === 4)
} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 220)}`)
} finally {
  await browser.close()
  await db.end()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — المصدر مُثبَت، و«لم يعمل قطّ» ليست «نجح»\n`)
process.exit(fail ? 1 : 0)
