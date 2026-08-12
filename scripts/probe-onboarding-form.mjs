#!/usr/bin/env node
/**
 * Step one asks for the whole identity, and stops asking for the official half.
 *
 * The rule: what the Ministry publishes is fetched and locked; what it does not
 * publish is the only thing typed. Checked by driving the real form against the
 * real published generation.
 */
import { chromium } from 'playwright'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4410'
const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()

let pass = 0, fail = 0
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) } }

const browser = await chromium.launch()
try {
  const { rows: [g] } = await db.query(
    `select name, cr_number, unified_number, region, city, legal_entity, capital
       from public.government_company_registry
      where dataset_id = public.published_registry_dataset()
        and coalesce(btrim(cr_number),'') <> '' limit 1`)

  const page = await (await browser.newContext({ viewport: { width: 1400, height: 1200 } })).newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 150)))
  await signIn(page, BASE, { role: 'company_member' })
  await page.goto(`${BASE}/company-onboarding`, { waitUntil: 'domcontentloaded', timeout: 40000 })
  await page.waitForFunction(() => (document.body.innerText || '').length > 300, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500)

  console.log('\n─── الحقول ───')
  const body = await page.locator('#main, body').first().innerText()
  for (const f of ['الرقم الموحّد', 'الكيان القانوني', 'المنطقة', 'رأس المال', 'العنوان الوطني', 'الموقع الإلكتروني'])
    ok(`  «${f}» معروض`, body.includes(f))

  console.log('\n─── الملء التلقائي ───')
  const cr = page.locator('input').filter({ hasNot: page.locator('[type=file]') })
  await page.getByRole('textbox').nth(1).fill(g.cr_number)
  await page.getByRole('button', { name: 'جلب البيانات من السجل التجاري' }).click()
  await page.waitForTimeout(4000)

  const after = await page.locator('body').innerText()
  ok('يعثر على الشركة ويقولها', /عُثر على الشركة في السجل/.test(after), after.slice(0, 90))

  const vals = await page.evaluate(() => {
    const out = {}
    document.querySelectorAll('input').forEach((i) => { if (i.value) out[i.value] = i.readOnly })
    return out
  })
  ok('واسم الشركة مُعبّأ من السجل', Object.keys(vals).some((v) => v.includes(g.name.slice(0, 10))), g.name.slice(0, 20))
  ok('ورقم السجل مُعبّأ', Object.keys(vals).includes(g.cr_number))
  if (g.unified_number) ok('والرقم الموحّد مُعبّأ', Object.keys(vals).includes(g.unified_number))
  const locked = Object.entries(vals).filter(([, ro]) => ro).length
  ok('والحقول الرسمية مقفلة', locked >= 3, `${locked} حقلاً مقفلاً`)

  ok('console نظيف', errs.length === 0, errs[0])
} catch (e) { fail++; console.log(`  ❌ توقّف: ${e.message.slice(0, 200)}`) }
finally { await browser.close(); await db.end() }
console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — الرسمي يُجلب ويُقفل، والباقي يُكتب\n`)
process.exit(fail ? 1 : 0)
