#!/usr/bin/env node
/**
 * «هذه الشركة موجودة» — said before the form is filled, not after.
 *
 * The duplicate check ran at submit time. So somebody typed a name, a legal
 * form, a capital, a city, an activity and a founding date, attached four
 * documents, pressed send — and learned the company was already there.
 *
 * Now that Marsad holds the Ministry's register that is not a rare accident:
 * most companies anybody thinks to add are in the national register, because
 * the national register is every company.
 *
 * What is proven here is that the answer arrives while the number is being
 * typed, and that it is not a refusal — the form fills itself from the record
 * instead.
 *
 *   node scripts/probe-registry-lookup.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4320'

const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await db.connect()

let pass = 0
let fail = 0
const ok = (n, c, d = '') => {
  if (c) { pass += 1; console.log(`  ✅ ${n}`) } else { fail += 1; console.log(`  ❌ ${n}${d ? ` — ${d}` : ''}`) }
}

const browser = await chromium.launch()
let cr = null

try {
  // A government record to find. Created here so the probe does not depend on
  // whatever happens to be in the register today.
  const stamp = Date.now().toString().slice(-7)
  cr = `99${stamp}`
  await db.query(`
    insert into public.government_company_registry
      (dataset_id, snapshot_period, snapshot_at, cr_number, name, unified_number,
       registration_type, legal_entity, legal_entity_2, capital, region, city, registration_date)
    values ('cccccccc-0000-0000-0000-000000000001', 'الربع الثاني 2026', '2026-06-30',
            $1, 'مصنع الفحص للبلاستيك', $2, 'رئيسي', 'شركة',
            'شركة ذات مسؤولية محدودة', 750000, 'المنطقة الشرقية', 'الدمام', '2018-05-12')`,
  [cr, `70${stamp}`])

  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await signIn(page, BASE)
  await page.goto(`${BASE}/add-company`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1200)

  ok('صفحة إضافة شركة تفتح', await page.locator('text=/أضِف شركة/').count() > 0)

  // Nothing before a number is typed.
  ok('لا شيء معروض قبل الكتابة',
    await page.locator('text=/وجدناها في السجل/').count() === 0)

  const field = page.locator('input[inputmode="numeric"]').first()
  await field.fill(cr)
  await page.waitForSelector('text=/وجدناها في السجل التجاري/', { timeout: 15000 }).catch(() => {})

  ok('يُخبر أثناء الكتابة أنها في السجل',
    await page.locator('text=/وجدناها في السجل التجاري/').count() > 0,
    'لم يظهر شيء — الشخص سيملأ النموذج كاملاً ثم يُفاجأ')
  ok('ويعرض اسمها', await page.locator('text=/مصنع الفحص للبلاستيك/').count() > 0)

  // The answer is an offer, not a refusal.
  const fillBtn = page.locator('button:has-text("املأ البيانات من السجل")')
  ok('ويعرض ملء البيانات بدل الرفض', await fillBtn.count() > 0)

  await fillBtn.click()
  await page.waitForTimeout(700)

  const values = await page.evaluate(() => {
    const out = {}
    for (const i of document.querySelectorAll('input, select')) {
      if (i.value) out[i.value] = true
    }
    return out
  })

  ok('الاسم مُلئ', !!values['مصنع الفحص للبلاستيك'])
  ok('الكيان القانوني التفصيلي مُلئ', !!values['شركة ذات مسؤولية محدودة'],
    Object.keys(values).join(' | ').slice(0, 90))
  ok('رأس المال مُلئ', !!values['750000'])
  ok('المدينة مُلئت', !!values['الدمام'])
  ok('تاريخ القيد مُلئ', !!values['2018-05-12'])

  // And a way past it.
  ok('يوجد طريق للمتابعة يدوياً',
    await page.locator('button:has-text("متابعة الإدخال يدوياً")').count() > 0)

} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 120)}`)
} finally {
  if (cr) await db.query('delete from public.government_company_registry where cr_number = $1', [cr]).catch(() => {})
  await db.end()
  await browser.close()
}

console.log(fail ? `\n  ❌ ${fail} من ${pass + fail}\n` : `\n  ✅ ${pass} فحصاً — يُخبر قبل التعبئة، ويملأ بدل أن يرفض\n`)
process.exit(fail ? 1 : 0)
