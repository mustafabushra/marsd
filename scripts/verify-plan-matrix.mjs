#!/usr/bin/env node
/**
 * Check the plan matrix in the database against what was agreed, and exercise
 * the resolver's arithmetic on it.
 *
 * The matrix is data, so it can drift without any code changing — an edit in
 * the admin panel is meant to take effect immediately, which is exactly why it
 * needs a check that reads the database rather than a fixture.
 *
 * Usage: node scripts/verify-plan-matrix.mjs
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

const env = (file, key) => {
  const line = readFileSync(file, 'utf8').split('\n').find((l) => l.trim().startsWith(key + '='))
  return line ? line.slice(line.indexOf('=') + 1).trim() : null
}
const supabase = createClient(env('.env.production', 'VITE_SUPABASE_URL'), env('.env.production', 'VITE_SUPABASE_ANON_KEY'))

let bad = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
  if (!ok) bad++
}

// The matrix as agreed. -1 is unlimited.
const EXPECTED = {
  free:       { searches: 10,   pending: 5,  seats: 2,  watch: 3,   features: [] },
  basic:      { searches: 200,  pending: 15, seats: 3,  watch: 50,  features: ['full_trust_report'] },
  pro:        { searches: 5000, pending: 50, seats: 10, watch: 500, features: ['full_trust_report', 'compare', 'alerts'] },
  enterprise: { searches: -1,   pending: -1, seats: -1, watch: -1,  features: ['full_trust_report', 'compare', 'alerts', 'api_access'] },
}

const { data: plans, error } = await supabase.from('plans').select('*').order('sort_order')
if (error) { console.error('  تعذّر قراءة الباقات: ' + error.message); process.exit(1) }

console.log('\n  المصفوفة مقابل المتفق عليه:\n')

for (const [code, want] of Object.entries(EXPECTED)) {
  const p = plans.find((x) => x.code === code)
  if (!p) { check(`باقة ${code} موجودة`, false); continue }
  const L = p.limits || {}
  check(`${code}: بحث`,           Number(L.searches_per_month) === want.searches, `${L.searches_per_month}`)
  check(`${code}: قيد المراجعة`,  Number(L.pending_reports) === want.pending,     `${L.pending_reports}`)
  check(`${code}: مقاعد`,         Number(L.users) === want.seats,                 `${L.users}`)
  check(`${code}: قوائم المراقبة`, Number(L.watchlist_items) === want.watch,      `${L.watchlist_items}`)
  check(`${code}: تقارير بلا حد`,  Number(L.reports_per_month) === -1,             `${L.reports_per_month}`)
  check(`${code}: شركات بلا حد`,   Number(L.companies_per_month) === -1,           `${L.companies_per_month}`)
  const feats = [...(p.features || [])].sort().join(',')
  check(`${code}: الميزات`, feats === [...want.features].sort().join(','), feats || '(لا شيء)')
}

console.log('')
const free = plans.find((p) => p.code === 'free')
// This asserted that only the free plan was active. That was true while the
// paid tiers were seeded and dormant; 037 gave companies a way to buy one, so
// an active paid plan is now the normal state. What still matters is that
// nothing is offered for sale without a price on it.
//
// free and partner are the two that are not sold: one is the default, the other
// is granted by Marsad for contribution and has no price by design. Everything
// else active is on the price list and must carry a price.
const GRANTED = ['free', 'partner']
const offered = (plans || []).filter((p) => p.active && !GRANTED.includes(p.code))
check('كل باقة معروضة مُسعّرة', offered.every((p) => Number(p.price_monthly) > 0),
  `${offered.length} معروضة: ${offered.map((p) => p.code).join('، ') || 'لا شيء'}`)

// A granted plan with a price would be sold by accident from the pricing page.
const granted = (plans || []).filter((p) => GRANTED.includes(p.code))
check('الباقات الممنوحة بلا سعر', granted.every((p) => Number(p.price_monthly) === 0),
  granted.map((p) => `${p.code}=${p.price_monthly}`).join('، '))
check('free وحدها افتراضية', plans.filter((p) => p.is_default).length === 1 && free?.is_default)
// This asserted that only the free plan carried Give-to-Get. 095 turned it on
// everywhere: the points were earned by contributing, and withholding them from
// the subscribers most able to contribute is backwards for a registry that is
// mostly empty. The balance a company can see must be a balance it can spend.
check('كل الباقات تحتسب النقاط',
  plans.every((p) => p.give_to_get_enabled),
  plans.filter((p) => !p.give_to_get_enabled).map((p) => p.code).join('، ') || 'لا استثناء')

// What now bounds the exposure is monthly_earn_cap, which this file already
// asserts below once the settings are read.

// Settings the enforcement reads. Over the database connection, not the browser
// key: system_settings is admin-only, so the anon client gets an empty list and
// every check below it compares against undefined and reports a wrong value
// where the truth is that it never read one.
const settings = await (async () => {
  const c = new pg.Client({
    connectionString: env('.env.migrations', 'DATABASE_URL'),
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const { rows } = await c.query('select key, value from public.system_settings')
  await c.end()
  return rows
})()

console.log('')
check('الإعدادات مقروءة أصلاً', settings.length > 0, `${settings.length} مفتاح`)

const rules = settings.find((s) => s.key === 'give_to_get_rules')?.value
const catalog = settings.find((s) => s.key === 'feature_catalog')?.value
check('سقف الكسب الشهري مضبوط', Number(rules?.monthly_earn_cap) === 200, `${rules?.monthly_earn_cap}`)

const used = [...new Set(plans.flatMap((p) => p.features || []))]
check('فهرس الميزات يعرّف كل ميزة مستخدمة',
  used.length > 0 && used.every((f) => catalog?.[f]),
  `${used.length} مستخدمة · ${Object.keys(catalog || {}).length} معرّفة` +
  (used.filter((f) => !catalog?.[f]).length ? ` · ناقص: ${used.filter((f) => !catalog?.[f]).join('، ')}` : ''))

// The arithmetic the app runs: free member, no credits, three lookups made.
const UNLIMITED = -1
const remaining = (ceiling, used, credits, g2g) =>
  ceiling === UNLIMITED ? Infinity : Math.max(0, ceiling - used) + (g2g ? credits : 0)
console.log('')
check('حساب المتبقي: مجاني بلا رصيد بعد 3 عمليات', remaining(10, 3, 0, true) === 7, String(remaining(10, 3, 0, true)))
check('حساب المتبقي: الرصيد يوسّع السقف',          remaining(10, 10, 20, true) === 20, String(remaining(10, 10, 20, true)))
check('حساب المتبقي: المدفوعة لا تستفيد من الرصيد', remaining(200, 0, 50, false) === 200, String(remaining(200, 0, 50, false)))
check('حساب المتبقي: بلا حد',                       remaining(-1, 9999, 0, false) === Infinity)

console.log(`\n  ${bad === 0 ? 'كل الفحوص نجحت' : bad + ' فحص فشل'}\n`)
process.exit(bad === 0 ? 0 : 1)
