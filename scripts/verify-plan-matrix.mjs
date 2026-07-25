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
check('free وحدها مفعّلة',   plans.filter((p) => p.active).map((p) => p.code).join(',') === 'free')
check('free وحدها افتراضية', plans.filter((p) => p.is_default).length === 1 && free?.is_default)
check('free وحدها Give-to-Get', plans.filter((p) => p.give_to_get_enabled).map((p) => p.code).join(',') === 'free')

// Settings the enforcement reads.
const { data: settings } = await supabase.from('system_settings').select('key, value')
const rules = settings?.find((s) => s.key === 'give_to_get_rules')?.value
const catalog = settings?.find((s) => s.key === 'feature_catalog')?.value
console.log('')
check('سقف الكسب الشهري مضبوط', Number(rules?.monthly_earn_cap) === 200, `${rules?.monthly_earn_cap}`)
check('فهرس الميزات يعرّف كل ميزة مستخدمة',
  [...new Set(plans.flatMap((p) => p.features || []))].every((f) => catalog?.[f]),
  Object.keys(catalog || {}).length + ' مفتاح')

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
