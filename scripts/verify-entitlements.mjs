#!/usr/bin/env node
/**
 * Exercise the entitlement queries exactly as the browser does.
 *
 * Uses the public anon key over PostgREST, not the migration connection, so
 * this catches what a direct SQL check cannot: a policy that hides a row from
 * the app, a column name PostgREST rejects, an embed that silently returns
 * null. The subscription page shipped for months selecting a column that does
 * not exist, and no SQL check would ever have noticed.
 *
 * Usage: node scripts/verify-entitlements.mjs
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = (file, key) => {
  const line = readFileSync(file, 'utf8').split('\n').find((l) => l.trim().startsWith(key + '='))
  return line ? line.slice(line.indexOf('=') + 1).trim() : null
}

const url = env('.env.production', 'VITE_SUPABASE_URL')
const anon = env('.env.production', 'VITE_SUPABASE_ANON_KEY')
const supabase = createClient(url, anon)

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures++
}

console.log('\n  استعلامات الواجهة عبر مفتاح anon:\n')

// 1) The plan list the subscription page renders.
const plans = await supabase
  .from('plans')
  .select('id, code, name, description, price_monthly, limits, features, active, give_to_get_enabled, sort_order')
  .order('sort_order', { ascending: true })
check('قراءة plans', !plans.error, plans.error?.message || `${plans.data?.length} صف`)

const free = (plans.data || []).find((p) => p.code === 'free')
check('باقة free موجودة ومفعّلة', !!free?.active)
check('free تحمل Give-to-Get', free?.give_to_get_enabled === true)
check('free لها حدود مضبوطة', Number(free?.limits?.searches_per_month) === 10, `searches=${free?.limits?.searches_per_month}`)
check('الباقات المدفوعة موقوفة', (plans.data || []).filter((p) => p.code !== 'free').every((p) => !p.active))
// Which feature belongs to which plan is asserted cell by cell in
// verify-plan-matrix.mjs. Here the point is only that the paid plans were
// seeded complete rather than switched off and left empty — this check named
// api_access on pro until the agreed matrix moved it to enterprise, which made
// a correct database look broken.
check('المدفوعة مبذورة بميزاتها', (plans.data || []).filter((p) => p.code !== 'free').every((p) => (p.features || []).length > 0))

// 2) The embed the entitlement resolver depends on. This is the shape that was
//    broken: a bad column here nulls the whole row rather than erroring loudly.
const sub = await supabase
  .from('subscriptions')
  .select('status, current_period_end, plans(id, code, name, description, price_monthly, limits, features, active, give_to_get_enabled)')
  .limit(1)
  .maybeSingle()
check('embed subscriptions→plans', !sub.error, sub.error?.message || '')
check('الـ embed يعيد باقة فعلية', !!sub.data?.plans?.code, sub.data?.plans?.code || 'null')

// 3) Settings the resolver reads.
const settings = await supabase
  .from('system_settings')
  .select('key, value')
  .in('key', ['give_to_get_rules', 'entitlements_enforcement', 'feature_catalog'])
check('قراءة system_settings', !settings.error, settings.error?.message || `${settings.data?.length}/3 مفاتيح`)
check('المفاتيح الثلاثة كاملة', (settings.data || []).length === 3)

const rules = (settings.data || []).find((s) => s.key === 'give_to_get_rules')?.value
check('قواعد الكسب موجودة', Number(rules?.earn?.report_approved?.points) > 0, `report_approved=${rules?.earn?.report_approved?.points}`)

// 4) Ledger and quota, read the way the resolver reads them.
const credits = await supabase.from('credits_ledger').select('amount').limit(5)
check('قراءة credits_ledger', !credits.error, credits.error?.message || `${credits.data?.length} صف`)

const quota = await supabase.from('view_quota_usage').select('period, views_count').limit(5)
check('قراءة view_quota_usage', !quota.error, quota.error?.message || `${quota.data?.length} صف`)

console.log(`\n  ${failures === 0 ? 'كل الفحوص نجحت' : failures + ' فحص فشل'}\n`)
process.exit(failures === 0 ? 0 : 1)
