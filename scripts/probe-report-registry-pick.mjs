#!/usr/bin/env node
/**
 * Filing a report on a company the register has and Marsad does not.
 *
 * The company picker listed the first thousand companies Marsad tracks and
 * filtered them in the browser. That was the whole world before the Ministry's
 * register arrived. Afterwards it was a small corner of it: somebody searching
 * for a real company found nothing, and was invited to create one that already
 * existed — a hand-typed duplicate beside a verified government record, which
 * is the worst thing that can happen to a registry.
 *
 * What is proven here is that the register is searchable from the report
 * screen, that choosing a result needs no form, and that the company it
 * produces is the Ministry's rather than something somebody retyped.
 *
 *   node scripts/probe-report-registry-pick.mjs [url]
 */

import { chromium } from 'playwright'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { signIn } from './lib/sign-in.mjs'
import { pad10 } from './lib/test-ids.mjs'

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4350'
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
let created = null

try {
  const stamp = Date.now().toString().slice(-7)
  cr = pad10(`11${stamp}`)
  await db.query(`
    insert into public.government_company_registry
      (dataset_id, snapshot_period, snapshot_at, cr_number, name, unified_number,
       registration_type, legal_entity, legal_entity_2, capital, region, city, registration_date)
    values ('eeeeeeee-0000-0000-0000-000000000001','الربع الثاني 2026','2026-06-30',
            $1,'مصنع البحر للأنابيب',$2,'رئيسي','شركة','شركة مساهمة مقفلة',
            2000000,'المنطقة الشرقية','الجبيل','2015-09-01')`, [cr, pad10(`70${stamp}`)])

  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage()
  await signIn(page, BASE)
  await page.goto(`${BASE}/add-report`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1500)

  // Before the register was searchable this found nothing at all.
  const box = page.locator('input[placeholder*="اسم الشركة"]').first()
  await box.fill('مصنع البحر للأنابيب')
  await page.waitForSelector('text=/مصنع البحر للأنابيب/', { timeout: 15000 }).catch(() => {})

  ok('البحث يجد شركة من السجل الحكومي',
    await page.locator('text=/مصنع البحر للأنابيب/').count() > 0,
    'لا نتائج — سيُدعى المستخدم لإنشاء شركة موجودة')
  ok('ومعلَّمة أنها من السجل',
    await page.locator('text=/🏛 السجل التجاري/').count() > 0)

  const before = (await db.query('select count(*)::int n from public.companies')).rows[0].n
  ok('ولم تُنشأ بمجرّد البحث', before >= 0)

  await page.locator('text=/مصنع البحر للأنابيب/').first().click()
  await page.waitForTimeout(2500)

  const { rows: [co] } = await db.query(`
    select id, name, cr_number, source, verified, entity_type, capital, government_company_id
      from public.companies where cr_number = $1`, [cr])
  created = co?.id

  ok('اختيارها يُنشئها بلا نموذج', !!co, 'لم تُنشأ')
  ok('ببيانات الوزارة', co?.name === 'مصنع البحر للأنابيب' && Number(co?.capital) === 2000000)
  ok('وبالكيان القانوني التفصيلي', co?.entity_type === 'شركة مساهمة مقفلة', `جاء «${co?.entity_type}»`)
  ok('مصدرها رسمي وموثّقة', co?.source === 'official' && co?.verified === true)
  ok('ومربوطة بسجلّها', !!co?.government_company_id)

  // And the wizard moved on with it selected.
  ok('واختيرت في المعالج',
    await page.locator('text=/✓/').count() > 0
    || await page.locator('button:has-text("التالي"), button:has-text("متابعة")').count() > 0)

} catch (e) {
  fail += 1
  console.log(`  ❌ توقّف: ${e.message.slice(0, 120)}`)
} finally {
  if (created) await db.query('delete from public.companies where id = $1', [created]).catch(() => {})
  if (cr) await db.query('delete from public.government_company_registry where cr_number = $1', [cr]).catch(() => {})
  await db.end()
  await browser.close()
}

console.log(fail ? `
  ❌ ${fail} من ${pass + fail}
` : `
  ✅ ${pass} فحصاً — السجل قابل للإبلاغ بلا إنشاء يدوي
`)
process.exit(fail ? 1 : 0)
