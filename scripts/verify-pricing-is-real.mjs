#!/usr/bin/env node
/**
 * Does the public price list show the prices the system actually charges?
 *
 * It did not. /pricing rendered four cards written by hand in
 * src/data/mockData.js:
 *
 *     أساسي    الصفحة: 99 ر.س     الصف: 1499 ر.س
 *     احترافي  الصفحة: 299 ر.س    الصف: 4999 ر.س
 *     مؤسسات   الصفحة: «مخصص»     الصف: 9999 ر.س
 *
 * Three prices understated by a factor of fifteen, on the page a customer
 * decides from. It also advertised three plans whose `active` is false — nobody
 * could buy them — and omitted شريك مرصد, which is on. Editing a plan in the
 * admin panel moved none of it.
 *
 * Two things are checked, because either alone would let it come back: that the
 * page reads the plans, and that nothing else on it is a price.
 *
 *   node scripts/verify-pricing-is-real.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

let failed = 0
const check = (ok, name, detail = '') => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

// ---------------------------------------------------------------------------
// The page reads the plans
// ---------------------------------------------------------------------------
const pricing = readFileSync('src/pages/Pricing.jsx', 'utf8')
check(/rpc\(\s*['"]public_plans['"]/.test(pricing),
  'صفحة الأسعار تقرأ الباقات من النظام', 'لا استدعاء لـ public_plans')
check(!/mockPricingTiers/.test(pricing),
  'ولا تقرأ أسعاراً مكتوبة يدوياً', 'ما زالت على mockPricingTiers')

// ---------------------------------------------------------------------------
// No price is written into the source
// ---------------------------------------------------------------------------
// A number next to ر.س anywhere under src/ is a price somebody typed. The one
// exception is a currency label with no figure attached — «ر.س/شهرياً» beside a
// value read from the plan — so the pattern requires digits.
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(jsx?|tsx?)$/.test(e)) out.push(p.replace(/\\/g, '/'))
  }
  return out
}
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')

const priced = []
for (const f of walk('src')) {
  for (const [i, line] of codeOnly(readFileSync(f, 'utf8')).split('\n').entries()) {
    // A literal figure quoted as riyals. `toLocaleString(...)+ ' ر.س'` on a
    // value read from the database is fine and does not match: the digits have
    // to be in the source.
    if (/['"`]\s*\d[\d,.]*\s*ر\.?س/.test(line) || /\d[\d,.]*\s*ر\.س\s*[/،]/.test(line)) {
      priced.push(`${f}:${i + 1} — ${line.trim().slice(0, 55)}`)
    }
  }
}
check(priced.length === 0, 'لا سعر مكتوب في الشيفرة', priced.join(' | '))

// ---------------------------------------------------------------------------
// And what the function returns matches the rows
// ---------------------------------------------------------------------------
const url = readFileSync('.env.migrations', 'utf8').split(/\r?\n/)
  .find((l) => l.trim().startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim()
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
try {
  await c.query('begin')
  await c.query('set local role anon')
  await c.query("select set_config('request.jwt.claims','',true)")
  const { rows: [{ p }] } = await c.query('select public.public_plans() as p')
  await c.query('rollback')

  const listed = p?.plans || []
  check(Array.isArray(listed), 'الزائر يقرأ قائمة الأسعار')

  const { rows: real } = await c.query(
    'select code, price_monthly, active, listed_publicly from public.plans')
  const byCode = new Map(real.map((r) => [r.code, r]))

  const wrong = listed.filter((x) => {
    const r = byCode.get(x.code)
    return !r || Number(r.price_monthly) !== Number(x.priceMonthly)
  })
  check(wrong.length === 0, 'وكل سعر معروض يطابق صفّه',
    wrong.map((x) => x.code).join('، '))

  const unsellable = listed.filter((x) => {
    const r = byCode.get(x.code)
    return r && (!r.active || !r.listed_publicly)
  })
  check(unsellable.length === 0, 'ولا تُعرض باقة موقوفة أو غير معروضة',
    unsellable.map((x) => x.code).join('، '))

  // Reported, not failed: how many sellable plans exist is a business decision,
  // not a defect. But a price list with one card is worth saying out loud.
  const sellable = real.filter((r) => r.active && r.listed_publicly)
  if (sellable.length < 2) {
    console.log(`     ⓘ ${sellable.length} باقة معروضة للبيع فقط`
      + ` (${real.filter((r) => !r.active).map((r) => r.code).join('، ')} موقوفة)`
      + ' — فعّلها من /admin/plans لتظهر')
  }
} finally {
  await c.end()
}

console.log(failed ? `\n  ❌ ${failed} فحص فشل\n` : '\n  ✅ كل الفحوصات نجحت\n')
process.exit(failed ? 1 : 0)
