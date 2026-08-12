#!/usr/bin/env node
/**
 * The number is asked first, and what follows depends on the answer.
 *
 * Three outcomes, all of them told before anything is typed:
 *   in the published register → the form appears already filled and locked
 *   not in it                 → an empty form, and it says so
 *   already in Marsad         → do not register it again; claim it
 *
 * The last one is the reason this order exists at all: the old form let
 * somebody fill in an entire company and only then learn it was registered.
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
    `select name, cr_number, unified_number from public.government_company_registry
      where dataset_id = public.published_registry_dataset()
        and coalesce(btrim(cr_number),'') <> '' limit 1`)
  const { rows: [mine] } = await db.query(
    `select name, cr_number from public.companies
      where status='active' and coalesce(btrim(cr_number),'') <> '' limit 1`)

  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 } })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 150)))
  await signIn(page, BASE, { role: 'company_member' })

  const open = async () => {
    await page.goto(`${BASE}/company-onboarding`, { waitUntil: 'domcontentloaded', timeout: 40000 })
    await page.waitForFunction(() => /ابدأ برقم السجل/.test(document.body.innerText || ''), { timeout: 20000 })
  }

  console.log('\n─── البوابة أولاً ───')
  await open()
  const first = await page.locator('body').innerText()
  ok('يُسأل عن الرقم قبل أي شيء', /ابدأ برقم السجل/.test(first))
  ok('ولا تظهر حقول النموذج بعد',
    !/الكيان القانوني/.test(first) && !/العنوان الوطني/.test(first))
  ok('ومعه مخرج يدوي', /سأدخل البيانات يدوياً/.test(first))

  console.log('\n─── رقم في السجل المنشور ───')
  await page.locator('#identify-cr').fill(g.cr_number)
  await page.getByRole('button', { name: 'متابعة' }).click()
  await page.waitForTimeout(4500)
  let t = await page.locator('body').innerText()
  ok('يفتح النموذج', /الكيان القانوني/.test(t), t.slice(0, 80))
  ok('ويقول إنه عثر عليها', /عُثر على الشركة في السجل/.test(t))
  ok('والاسم مُعبّأ', t.includes(g.name.slice(0, 10)) || (await page.evaluate((n) =>
    [...document.querySelectorAll('input')].some((i) => i.value.includes(n)), g.name.slice(0, 10))))
  const locked = await page.evaluate(() =>
    [...document.querySelectorAll('input')].filter((i) => i.readOnly && i.value).length)
  ok('والحقول الرسمية مقفلة', locked >= 3, `${locked} مقفلاً`)

  console.log('\n─── رقم ليس في السجل ───')
  await open()
  await page.locator('#identify-cr').fill('9999999999')
  await page.getByRole('button', { name: 'متابعة' }).click()
  await page.waitForTimeout(4500)
  t = await page.locator('body').innerText()
  ok('يفتح نموذجاً فارغاً', /الكيان القانوني/.test(t))
  ok('ويقول إنه لم يجدها', /لم نجد هذه الشركة في السجل المنشور/.test(t), t.slice(0, 80))
  const lockedNone = await page.evaluate(() =>
    [...document.querySelectorAll('input')].filter((i) => i.readOnly && i.value).length)
  ok('ولا شيء مقفل', lockedNone === 0, `${lockedNone} مقفلاً`)

  if (mine) {
    console.log('\n─── رقم مسجَّل في مرصد ───')
    await open()
    await page.locator('#identify-cr').fill(mine.cr_number)
    await page.getByRole('button', { name: 'متابعة' }).click()
    await page.waitForTimeout(4500)
    t = await page.locator('body').innerText()
    ok('يمنع التسجيل المكرّر قبل الكتابة', /مسجّلة في مرصد بالفعل/.test(t), t.slice(0, 90))
    ok('ولا يفتح النموذج', !/الكيان القانوني/.test(t))
  }

  console.log('\n─── المخرج اليدوي ───')
  await open()
  await page.getByRole('button', { name: /سأدخل البيانات يدوياً/ }).click()
  await page.waitForTimeout(1200)
  ok('يفتح النموذج بلا بحث', /الكيان القانوني/.test(await page.locator('body').innerText()))

  ok('console نظيف', errs.length === 0, errs[0])
} catch (e) { fail++; console.log(`  ❌ توقّف: ${e.message.slice(0, 200)}`) }
finally { await browser.close(); await db.end() }
console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — الرقم أولاً، والنموذج يعرف نفسه\n`)
process.exit(fail ? 1 : 0)
