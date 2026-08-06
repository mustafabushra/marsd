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
// Since 095 this is true of every plan, not only free — earned points count
// toward the allowance whatever the company is subscribed to.
check('كل الباقات تحتسب النقاط',
  (plans.data || []).every((p) => p.give_to_get_enabled),
  (plans.data || []).filter((p) => !p.give_to_get_enabled).map((p) => p.code).join('، ') || 'لا استثناء')
// The value, not a value. This asserted searches_per_month === 10 and started
// failing the moment an operator changed it in the admin panel — which is what
// the panel is for. A check that breaks when the product is used as designed
// trains people to ignore the checks. What matters is that the key exists and
// is a sane number; verify-plan-matrix.mjs is where the agreed figures live.
const freeSearches = Number(free?.limits?.searches_per_month)
check('free لها حد بحث معرّف', Number.isFinite(freeSearches) && freeSearches !== 0,
  `searches=${free?.limits?.searches_per_month}`)

// This asserted that every paid plan was switched off. That was true while they
// were seeded and dormant; 037 gave companies a way to buy one, so a paid plan
// being active is now the normal state. What still matters is that whatever is
// offered is priced.
//
// free and partner are not offered for sale: one is the default, the other is
// granted by Marsad for contribution (090) and is zero-priced by design. Both
// are excluded here and checked for the opposite below — a granted plan that
// acquired a price would start being sold from the pricing page.
const GRANTED = ['free', 'partner']
const paid = (plans.data || []).filter((p) => !GRANTED.includes(p.code))
check('الباقات المعروضة مُسعّرة',
  paid.filter((p) => p.active).every((p) => Number(p.price_monthly) > 0),
  `${paid.filter((p) => p.active).length} معروضة من ${paid.length}`)

const granted = (plans.data || []).filter((p) => GRANTED.includes(p.code))
check('الباقات الممنوحة بلا سعر',
  granted.length > 0 && granted.every((p) => Number(p.price_monthly) === 0),
  granted.map((p) => `${p.code}=${p.price_monthly}`).join('، ') || 'لا شيء')
// Which feature belongs to which plan is asserted cell by cell in
// verify-plan-matrix.mjs. Here the point is only that the paid plans were
// seeded complete rather than switched off and left empty — this check named
// api_access on pro until the agreed matrix moved it to enterprise, which made
// a correct database look broken.
check('المدفوعة مبذورة بميزاتها', (plans.data || []).filter((p) => p.code !== 'free').every((p) => (p.features || []).length > 0))

// 2) The resolver's own path.
//
// This used to test the subscriptions→plans embed the resolver was built on,
// and asserted that a row came back. It ran with the anon key, which has no
// session — so RLS correctly returned nothing and the check read that as a
// broken embed. It was asserting that an unauthenticated caller could read a
// subscription, which is the opposite of what should be true.
//
// 038 replaced the embed with my_entitlements(), so that is what to check: a
// caller with no session must be refused, and told why rather than handed an
// empty object that reads as "no limits".
const anonEnt = await supabase.rpc('my_entitlements')
check('my_entitlements موجودة', !anonEnt.error, anonEnt.error?.message || '')
check('بلا جلسة: تُرفض بسبب مذكور',
  anonEnt.data?.degraded === true && !!anonEnt.data?.reason,
  anonEnt.data?.reason || JSON.stringify(anonEnt.data))
check('بلا جلسة: لا تُسرّب حدوداً',
  !anonEnt.data?.limits && !anonEnt.data?.features,
  anonEnt.data?.limits ? 'سرّبت حدوداً!' : 'لا شيء')

// 3) Settings, from the outside.
//
// This block used to assert that all three keys came back to this client — and
// it passed, because system_settings was readable by anyone holding the anon key
// that ships inside the browser bundle. It was checking that a leak was intact.
//
// The keys are not equal. billing_settings, feature_catalog and
// entitlements_enforcement are things a signed-in customer needs. trust_score_rules
// and give_to_get_rules are the scoring model and the credit economy: publishing
// them tells a company exactly how to move its own score. So the assertion is
// inverted — an unauthenticated read must come back empty.
const settings = await supabase
  .from('system_settings')
  .select('key, value')
  .in('key', ['give_to_get_rules', 'trust_score_rules', 'feature_catalog', 'billing_settings'])

check('قراءة الإعدادات بلا جلسة لا تُخطئ', !settings.error, settings.error?.message || 'لا خطأ')
check('بلا جلسة: لا يُقرأ أي إعداد',
  (settings.data || []).length === 0,
  (settings.data || []).length ? `سرّبت: ${settings.data.map((s) => s.key).join(' · ')}` : 'صفر مفتاح')

const leaked = (settings.data || []).map((s) => s.key)
check('نموذج التقييم غير مكشوف', !leaked.includes('trust_score_rules'))
check('اقتصاد النقاط غير مكشوف', !leaked.includes('give_to_get_rules'))

// 4) Ledger and quota, read the way the resolver reads them.
const credits = await supabase.from('credits_ledger').select('amount').limit(5)
check('قراءة credits_ledger', !credits.error, credits.error?.message || `${credits.data?.length} صف`)

const quota = await supabase.from('view_quota_usage').select('period, views_count').limit(5)
check('قراءة view_quota_usage', !quota.error, quota.error?.message || `${quota.data?.length} صف`)

console.log(`\n  ${failures === 0 ? 'كل الفحوص نجحت' : failures + ' فحص فشل'}\n`)
process.exit(failures === 0 ? 0 : 1)
